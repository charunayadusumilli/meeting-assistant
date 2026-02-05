/**
 * Web Speech API Provider for Browser/Renderer context
 * 
 * This is a standalone module for the Electron renderer process
 * that implements the Web Speech API for free speech-to-text.
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

    /**
     * Check if Web Speech API is available
     */
    isAvailable() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }

    /**
     * Initialize speech recognition
     */
    init(options = {}) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            throw new Error('Web Speech API not supported');
        }

        this.recognition = new SpeechRecognition();

        // Configure recognition
        this.recognition.continuous = options.continuous !== false;
        this.recognition.interimResults = options.interimResults !== false;
        this.recognition.lang = options.language || 'en-US';
        this.recognition.maxAlternatives = options.maxAlternatives || 1;

        // Set up event handlers
        this.recognition.onstart = () => {
            console.log('[WebSpeech] Started listening');
            this.isListening = true;
            if (this.callbacks.onStart) this.callbacks.onStart();
        };

        this.recognition.onend = () => {
            console.log('[WebSpeech] Stopped listening');
            this.isListening = false;
            if (this.callbacks.onEnd) this.callbacks.onEnd();

            // Auto-restart if still supposed to be listening
            if (this._shouldRestart) {
                console.log('[WebSpeech] Auto-restarting...');
                setTimeout(() => this.start(), 100);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('[WebSpeech] Error:', event.error);

            // Handle specific errors
            if (event.error === 'no-speech') {
                // Just restart, don't treat as fatal
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

    /**
     * Start listening
     */
    start() {
        if (!this.recognition) {
            this.init();
        }

        if (this.isListening) {
            console.log('[WebSpeech] Already listening');
            return this;
        }

        this._shouldRestart = true;

        try {
            this.recognition.start();
        } catch (error) {
            console.error('[WebSpeech] Start error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('start-failed', error);
            }
        }

        return this;
    }

    /**
     * Stop listening
     */
    stop() {
        this._shouldRestart = false;

        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }

        return this;
    }

    /**
     * Set callback for final results
     */
    onResult(callback) {
        this.callbacks.onResult = callback;
        return this;
    }

    /**
     * Set callback for interim results
     */
    onInterim(callback) {
        this.callbacks.onInterim = callback;
        return this;
    }

    /**
     * Set callback for errors
     */
    onError(callback) {
        this.callbacks.onError = callback;
        return this;
    }

    /**
     * Set callback for when recognition ends
     */
    onEnd(callback) {
        this.callbacks.onEnd = callback;
        return this;
    }

    /**
     * Set callback for when recognition starts
     */
    onStart(callback) {
        this.callbacks.onStart = callback;
        return this;
    }

    /**
     * Get status
     */
    getStatus() {
        return {
            isAvailable: this.isAvailable(),
            isListening: this.isListening,
            provider: 'WebSpeech'
        };
    }
}

// For browser/renderer context
if (typeof window !== 'undefined') {
    window.WebSpeechProvider = WebSpeechProvider;
}

// For Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebSpeechProvider };
}
