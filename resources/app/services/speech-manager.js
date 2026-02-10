/**
 * Speech Manager - Frontend audio streaming integration
 * Handles microphone input, transcription, and backend communication
 */

let WebSpeechProvider;
if (typeof require !== 'undefined') {
  try {
    const mod = require('./web-speech-provider');
    WebSpeechProvider = mod.WebSpeechProvider;
  } catch (e) { }
}
if (!WebSpeechProvider && typeof window !== 'undefined') {
  WebSpeechProvider = window.WebSpeechProvider;
}

let io;
if (typeof require !== 'undefined') {
  try { io = require('socket.io-client').io; } catch { }
}
if (!io && typeof window !== 'undefined') {
  io = window.io;
}

class SpeechManager {
  constructor(config = {}) {
    this.config = {
      backendUrl: config.backendUrl || 'http://localhost:3000',
      preferDeepgram: config.preferDeepgram || false,
      autoFallback: config.autoFallback !== false
    };

    this.webSpeechProvider = null;
    this.socket = null;
    this.sessionId = null;
    this.isActive = false;

    this.mediaRecorder = null;
    this.audioStream = null;

    this.callbacks = {
      onTranscript: null,
      onInterim: null,
      onAnswer: null,
      onError: null,
      onStatusChange: null
    };
  }

  async init() {
    if (WebSpeechProvider) {
      this.webSpeechProvider = new WebSpeechProvider();

      if (this.webSpeechProvider.isAvailable()) {
        this.webSpeechProvider
          .init({
            continuous: true,
            interimResults: true,
            language: 'en-US'
          })
          .onResult((result) => {
            this._handleTranscript(result.text, true);
          })
          .onInterim((result) => {
            this._handleTranscript(result.text, false);
          })
          .onError((error) => {
            console.error('[SpeechManager] Web Speech error:', error);
            // Trigger cloud STT fallback for network or permission errors
            if (this.config.autoFallback && (error === 'network' || error === 'not-allowed' || error === 'audio-capture')) {
              console.log('[SpeechManager] Fatal Web Speech error, falling back to cloud STT provider');
              this.stop();
              this.config.preferDeepgram = true;
              this.start();
            } else if (this.callbacks.onError) {
              this.callbacks.onError({ type: 'webspeech', error });
            }
          })
          .onStart(() => this._setStatus('listening'))
          .onEnd(() => this._setStatus('stopped'));
      }
    }
    return this;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (!io) {
        reject(new Error('Socket.IO client not loaded'));
        return;
      }

      this.sessionId = this._generateSessionId();

      this.socket = io(this.config.backendUrl, {
        query: { sessionId: this.sessionId },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
      });

      this.socket.on('connect', () => {
        console.log('[SpeechManager] Connected to backend');
        this._setStatus('connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[SpeechManager] Connection error:', error);
        reject(error);
      });

      this.socket.on('deepgram_ready', () => {
        console.log('[SpeechManager] Deepgram ready, starting audio stream');
        this._startAudioStreaming();
      });

      // Listen for transcripts from backend (Deepgram STT results)
      this.socket.on('transcript', (data) => {
        const text = data.text || data.content;
        if (!text) return;
        if (data.isFinal || data.type === 'final') {
          if (this.callbacks.onTranscript) this.callbacks.onTranscript(text);
        } else {
          if (this.callbacks.onInterim) this.callbacks.onInterim(text);
        }
      });

      this.socket.on('answer', (data) => {
        if (this.callbacks.onAnswer) {
          this.callbacks.onAnswer(data);
        }
      });

      this.socket.on('response_start', () => this._setStatus('processing'));
      this.socket.on('response_end', () => this._setStatus('ready'));
      this.socket.on('disconnect', () => this._setStatus('disconnected'));
    });
  }

  async start() {
    if (this.isActive) return;

    // Use Web Speech API as primary
    if (this.webSpeechProvider?.isAvailable() && !this.config.preferDeepgram) {
      this.webSpeechProvider.start();
      this.isActive = true;
      this._setStatus('listening');
      return;
    }

    // Fallback: cloud STT provider
    if (this.socket?.connected) {
      this.socket.emit('start_deepgram_session', { sessionId: this.sessionId });
      this.isActive = true;
      this._setStatus('listening');
    }
  }

  async _startAudioStreaming() {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.audioStream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.socket?.connected) {
          this.socket.emit('audio_data', event.data);
        }
      };
      this.mediaRecorder.start(100);
      console.log('[SpeechManager] Audio streaming started');
    } catch (e) {
      console.error('[SpeechManager] Mic access failed:', e);
      this.callbacks.onError && this.callbacks.onError({ type: 'mic', error: e });
    }
  }

  stop() {
    if (this.webSpeechProvider) {
      this.webSpeechProvider.stop();
    }

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }

    if (this.socket?.connected) {
      this.socket.emit('stop_session', { sessionId: this.sessionId });
    }

    this.isActive = false;
    this._setStatus('stopped');
  }

  askQuestion(question, assistantId = null, attachments = []) {
    if (!this.socket?.connected) return false;

    this.socket.emit('question', {
      sessionId: this.sessionId,
      question: question,
      assistantId: assistantId,
      attachments: attachments
    });

    return true;
  }

  toggleAutoDetect(enabled, assistantId = null) {
    if (!this.socket?.connected) return false;
    this.socket.emit('toggle-auto-detect', { enabled, assistantId });
    return true;
  }

  _handleTranscript(text, isFinal) {
    if (this.socket?.connected) {
      const event = isFinal ? 'recognized_item' : 'recognizing_item';
      this.socket.emit(event, {
        sessionId: this.sessionId,
        content: text,
        timestamp: Date.now()
      });
    }

    if (isFinal && this.callbacks.onTranscript) {
      this.callbacks.onTranscript(text);
    } else if (!isFinal && this.callbacks.onInterim) {
      this.callbacks.onInterim(text);
    }
  }

  _setStatus(status) {
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange(status);
    }
  }

  _generateSessionId() {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  onTranscript(callback) { this.callbacks.onTranscript = callback; return this; }
  onInterim(callback) { this.callbacks.onInterim = callback; return this; }
  onAnswer(callback) { this.callbacks.onAnswer = callback; return this; }
  onError(callback) { this.callbacks.onError = callback; return this; }
  onStatusChange(callback) { this.callbacks.onStatusChange = callback; return this; }

  disconnect() {
    this.stop();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this._setStatus('disconnected');
  }

  getStatus() {
    return {
      isActive: this.isActive,
      sessionId: this.sessionId,
      backendConnected: this.socket?.connected || false,
      webSpeechAvailable: this.webSpeechProvider?.isAvailable() || false
    };
  }
}

if (typeof window !== 'undefined') {
  window.SpeechManager = SpeechManager;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpeechManager };
}
