/**
 * Web Speech API Provider for Browser/Renderer context
 *
 * Standalone module for the Electron renderer process
 * that wraps the Web Speech API for free speech-to-text.
 */

class WebSpeechProvider {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.callbacks = {
      onResult: null,
      onInterim: null,
      onError: null,
      onEnd: null,
      onStart: null
    };
  }

  isAvailable() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  init(options = {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Web Speech API not supported');
    }

    this.recognition = new SpeechRecognition();

    this.recognition.continuous = options.continuous !== false;
    this.recognition.interimResults = options.interimResults !== false;
    this.recognition.lang = options.language || 'en-US';
    this.recognition.maxAlternatives = options.maxAlternatives || 1;

    this.recognition.onstart = () => {
      console.log('[WebSpeech] Started listening');
      this.isListening = true;
      if (this.callbacks.onStart) this.callbacks.onStart();
    };

    this.recognition.onend = () => {
      console.log('[WebSpeech] Stopped listening');
      this.isListening = false;
      if (this.callbacks.onEnd) this.callbacks.onEnd();

      if (this._shouldRestart) {
        console.log('[WebSpeech] Auto-restarting...');
        setTimeout(() => this.start(), 100);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('[WebSpeech] Error:', event.error);

      if (event.error === 'no-speech') {
        return;
      }

      if (event.error === 'audio-capture') {
        console.error('[WebSpeech] No microphone found');
      }

      if (event.error === 'not-allowed') {
        console.error('[WebSpeech] Microphone permission denied');
      }

      if (this.callbacks.onError) {
        this.callbacks.onError(event.error, event);
      }
    };

    this.recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence;
      const isFinal = lastResult.isFinal;

      const result = {
        text: transcript,
        confidence: confidence,
        isFinal: isFinal,
        provider: 'WebSpeech'
      };

      if (isFinal) {
        console.log('[WebSpeech] Final:', transcript);
        if (this.callbacks.onResult) {
          this.callbacks.onResult(result);
        }
      } else {
        if (this.callbacks.onInterim) {
          this.callbacks.onInterim(result);
        }
      }
    };

    return this;
  }

  async start() {
    if (!this.recognition) {
      this.init();
    }

    if (this.isListening) {
      console.log('[WebSpeech] Already listening');
      return this;
    }

    // Check microphone permissions first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Release immediately
      console.log('[WebSpeech] Microphone permission granted');
    } catch (permError) {
      console.error('[WebSpeech] Microphone permission denied:', permError);
      if (this.callbacks.onError) {
        this.callbacks.onError('not-allowed', permError);
      }
      return this;
    }

    this._shouldRestart = true;

    try {
      this.recognition.start();
      console.log('[WebSpeech] Started successfully');
    } catch (error) {
      console.error('[WebSpeech] Start error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError('start-failed', error);
      }
    }

    return this;
  }

  stop() {
    this._shouldRestart = false;

    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }

    return this;
  }

  onResult(callback) {
    this.callbacks.onResult = callback;
    return this;
  }

  onInterim(callback) {
    this.callbacks.onInterim = callback;
    return this;
  }

  onError(callback) {
    this.callbacks.onError = callback;
    return this;
  }

  onEnd(callback) {
    this.callbacks.onEnd = callback;
    return this;
  }

  onStart(callback) {
    this.callbacks.onStart = callback;
    return this;
  }

  getStatus() {
    return {
      isAvailable: this.isAvailable(),
      isListening: this.isListening,
      provider: 'WebSpeech'
    };
  }
}

if (typeof window !== 'undefined') {
  window.WebSpeechProvider = WebSpeechProvider;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSpeechProvider };
}
