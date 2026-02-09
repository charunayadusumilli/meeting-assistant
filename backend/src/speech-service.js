/**
 * Speech Service - Multi-provider STT abstraction layer
 *
 * Provides a unified interface for speech-to-text with automatic fallback:
 * - Primary: Web Speech API (free, browser-based)
 * - Fallback: Cloud STT provider (paid, high accuracy)
 */

const EventEmitter = require('events');
const WebSocket = require('ws');

const ProviderStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ERROR: 'error'
};

class BaseSpeechProvider extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.status = ProviderStatus.IDLE;
  }

  async start() { throw new Error('Not implemented'); }
  async stop() { throw new Error('Not implemented'); }
  isAvailable() { return false; }
}

class DeepgramProvider extends BaseSpeechProvider {
  constructor(apiKey) {
    super('Deepgram');
    this.apiKey = apiKey;
    this.connection = null;
  }

  isAvailable() {
    return !!this.apiKey;
  }

  sendAudio(data) {
    if (this.connection?.readyState === WebSocket.OPEN) {
      this.connection.send(data);
    }
  }

  async start(audioStream) {
    if (!this.apiKey) {
      throw new Error('Deepgram API key not configured');
    }

    this.status = ProviderStatus.CONNECTING;

    try {
      const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
        'model=nova-2&' +
        'language=en&' +
        'smart_format=true&' +
        'interim_results=true&' +
        'endpointing=300&' +
        'utterance_end_ms=1000';

      this.connection = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });

      this.connection.on('open', () => {
        console.log('[Deepgram] Connected');
        this.status = ProviderStatus.ACTIVE;
        this.emit('connected');
      });

      this.connection.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          const isFinal = response.is_final;

          if (transcript) {
            this.emit('transcript', {
              text: transcript,
              isFinal: isFinal,
              confidence: response.channel?.alternatives?.[0]?.confidence || 0,
              provider: this.name
            });
          }
        }
      });

      this.connection.on('error', (error) => {
        console.error('[Deepgram] Error:', error.message);
        this.status = ProviderStatus.ERROR;
        this.emit('error', error);
      });

      this.connection.on('close', () => {
        console.log('[Deepgram] Disconnected');
        this.status = ProviderStatus.IDLE;
        this.emit('disconnected');
      });

      return this;

    } catch (error) {
      this.status = ProviderStatus.ERROR;
      throw error;
    }
  }

  async stop() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.status = ProviderStatus.IDLE;
  }
}

class WebSpeechConfig {
  static getConfig() {
    return {
      continuous: true,
      interimResults: true,
      language: 'en-US',
      maxAlternatives: 1
    };
  }
}

class SpeechService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      deepgramApiKey: config.deepgramApiKey || process.env.DEEPGRAM_API_KEY,
      preferredProvider: config.preferredProvider || 'webspeech',
      enableFallback: config.enableFallback !== false
    };

    this.providers = {
      deepgram: new DeepgramProvider(this.config.deepgramApiKey)
    };

    this.activeProvider = null;
    this.isActive = false;

    this._setupProviderEvents();
  }

  _setupProviderEvents() {
    Object.values(this.providers).forEach(provider => {
      provider.on('transcript', (data) => {
        this.emit('transcript', data);
        if (data.isFinal) {
          this.emit('recognized', data);
        } else {
          this.emit('recognizing', data);
        }
      });

      provider.on('error', (error) => {
        console.error(`[SpeechService] ${provider.name} error:`, error.message);
        this.emit('provider-error', { provider: provider.name, error });

        if (this.config.enableFallback && this.activeProvider === provider) {
          this._attemptFallback();
        }
      });

      provider.on('connected', () => {
        this.emit('provider-connected', { provider: provider.name });
      });

      provider.on('disconnected', () => {
        this.emit('provider-disconnected', { provider: provider.name });
      });
    });
  }

  async _attemptFallback() {
    console.log('[SpeechService] Attempting fallback to Deepgram...');

    if (this.providers.deepgram.isAvailable()) {
      try {
        await this.startWithProvider('deepgram');
        console.log('[SpeechService] Fallback to Deepgram successful');
      } catch (error) {
        console.error('[SpeechService] Fallback failed:', error.message);
        this.emit('all-providers-failed');
      }
    } else {
      console.warn('[SpeechService] No fallback providers available');
      this.emit('all-providers-failed');
    }
  }

  getAvailableProviders() {
    const available = [];
    available.push({
      name: 'webspeech',
      displayName: 'Web Speech API',
      cost: 'Free',
      available: true
    });

    if (this.providers.deepgram.isAvailable()) {
      available.push({
        name: 'deepgram',
        displayName: 'Deepgram',
        cost: '$0.0043/min',
        available: true
      });
    }

    return available;
  }

  async startWithProvider(providerName, audioStream) {
    if (this.isActive) {
      await this.stop();
    }

    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    if (!provider.isAvailable()) {
      throw new Error(`Provider ${providerName} is not available`);
    }

    this.activeProvider = provider;
    this.isActive = true;

    return await provider.start(audioStream);
  }

  async start(audioStream) {
    if (this.config.preferredProvider === 'deepgram') {
      return await this.startWithProvider('deepgram', audioStream);
    }

    this.isActive = true;
    this.emit('ready', { provider: 'webspeech' });
    return { provider: 'webspeech' };
  }

  async stop() {
    if (this.activeProvider) {
      await this.activeProvider.stop();
      this.activeProvider = null;
    }
    this.isActive = false;
    this.emit('stopped');
  }

  getStatus() {
    return {
      isActive: this.isActive,
      activeProvider: this.activeProvider?.name || null,
      providerStatus: this.activeProvider?.status || ProviderStatus.IDLE,
      availableProviders: this.getAvailableProviders()
    };
  }
}

module.exports = {
  SpeechService,
  DeepgramProvider,
  WebSpeechConfig,
  BaseSpeechProvider,
  ProviderStatus
};
