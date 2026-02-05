/**
 * Session Service for Meeting Assistant
 * Session Management Service
 * 
 * Manages WebSocket connections for speech-to-text and backend communication
 */

const { io } = require('socket.io-client');
const EventEmitter = require('events');

/**
 * SessionService - Manages session lifecycle and backend communication
 */
class SessionService extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.isStarting = false;
        this.sessionId = null;
        this.backendConnection = null;
        this.config = null;
        this.requestCounter = 0;
        this.activeRequestId = null;
    }

    /**
     * Initialize with configuration
     */
    initialize(config) {
        this.config = config;
        console.log('[SessionService] Initialized with config:', config);
    }

    /**
     * Start a new session
     */
    async startSession(sessionData, sessionId) {
        if (this.isActive || this.isStarting) {
            console.warn('[SessionService] Session already active or starting');
            return false;
        }

        if (!sessionId) {
            console.error('[SessionService] Session ID required');
            return false;
        }

        try {
            this.sessionId = sessionId;
            this.isStarting = true;

            console.log(`[SessionService] Starting session ${this.sessionId}`);

            await this.connectToBackend();

            this.isActive = true;
            this.isStarting = false;

            console.log('[SessionService] Session started successfully');
            this.emit('session-started', { sessionId: this.sessionId });
            return true;
        } catch (error) {
            console.error('[SessionService] Failed to start session:', error);
            this.isStarting = false;
            await this.cleanup();
            return false;
        }
    }

    /**
     * Stop the current session
     */
    async stopSession() {
        if (!this.isActive && !this.isStarting) {
            console.warn('[SessionService] No active session to stop');
            return false;
        }

        try {
            console.log(`[SessionService] Stopping session ${this.sessionId}`);
            await this.cleanup();
            console.log('[SessionService] Session stopped successfully');
            this.emit('session-stopped');
            return true;
        } catch (error) {
            console.error('[SessionService] Error stopping session:', error);
            return false;
        }
    }

    /**
     * Connect to backend Socket.IO server
     */
    async connectToBackend() {
        return new Promise((resolve, reject) => {
            try {
                const backendUrl = this.config?.backendUrl || 'http://localhost:3000';

                console.log(`[SessionService] Connecting to backend at ${backendUrl}...`);

                const socket = io(backendUrl, {
                    reconnectionAttempts: 20,
                    timeout: 5000,
                    query: {
                        sessionId: this.sessionId
                    },
                    reconnection: true,
                    reconnectionDelay: 3000
                });

                socket.on('connect', () => {
                    this.backendConnection = {
                        connected: true,
                        startTime: Date.now(),
                        url: backendUrl,
                        socket: socket
                    };

                    console.log('[SessionService] ✅ Backend connected');
                    console.log(`[SessionService] Socket ID: ${socket.id}`);

                    resolve();
                });

                socket.on('connect_error', (error) => {
                    console.error('[SessionService] ❌ Connection error:', error.message);
                    reject(error);
                });

                socket.on('disconnect', (reason) => {
                    console.log(`[SessionService] Disconnected: ${reason}`);
                    if (this.backendConnection) {
                        this.backendConnection.connected = false;
                    }
                    this.emit('backend-disconnected', { reason });
                });

                socket.on('reconnect', (attemptNumber) => {
                    console.log(`[SessionService] Reconnected after ${attemptNumber} attempts`);
                    this.emit('backend-reconnected');
                });

                // Listen for answer events (streaming AI response)
                socket.on('answer', (data = {}) => {
                    if (!this.isRelevantRequest(data?.requestId)) {
                        console.warn('[SessionService] Dropping stale answer chunk');
                        return;
                    }
                    this.emit('answer', data);
                });

                // Response lifecycle events
                socket.on('response_start', (data = {}) => {
                    if (!this.isRelevantRequest(data?.requestId)) return;
                    this.emit('response_start', data);
                });

                socket.on('response_end', (data = {}) => {
                    if (!this.isRelevantRequest(data?.requestId)) return;
                    this.emit('response_end', data);
                });

                // Clear event
                socket.on('clear', (data = {}) => {
                    if (!this.isRelevantRequest(data?.requestId)) return;
                    this.emit('clear', data);
                });

                // Transcript events
                socket.on('transcript', (data) => {
                    this.emit('transcript', data);
                });

            } catch (error) {
                console.error('[SessionService] ❌ Failed to connect:', error);
                reject(error);
            }
        });
    }

    /**
     * Get current session status
     */
    getStatus() {
        return {
            isActive: this.isActive,
            sessionId: this.sessionId,
            backendConnected: this.backendConnection?.connected || false
        };
    }

    /**
     * Clean up connections and reset state
     */
    async cleanup() {
        console.log('[SessionService] Cleaning up...');

        if (this.backendConnection?.socket) {
            this.backendConnection.socket.removeAllListeners();
            this.backendConnection.socket.disconnect();
            this.backendConnection = null;
        }

        this.isActive = false;
        this.isStarting = false;
        this.sessionId = null;
        this.activeRequestId = null;
        this.requestCounter = 0;

        console.log('[SessionService] Cleanup completed');
    }

    /**
     * Check if request is relevant (not stale)
     */
    isRelevantRequest(requestId) {
        return requestId === undefined || requestId === null || requestId === this.activeRequestId;
    }

    /**
     * Start a new request and get its ID
     */
    startNewRequest() {
        this.requestCounter += 1;
        this.activeRequestId = this.requestCounter;
        return this.activeRequestId;
    }

    /**
     * Send event to backend
     */
    sendToBackend(event, data) {
        if (!this.backendConnection?.connected || !this.backendConnection?.socket) {
            console.error('[SessionService] Backend not connected');
            return false;
        }

        try {
            let payload = data;

            // Add request ID for questions
            if (event === 'question') {
                payload = { ...data, requestId: this.startNewRequest() };
            }

            this.backendConnection.socket.emit(event, payload);
            return true;
        } catch (error) {
            console.error('[SessionService] Error sending message:', error);
            return false;
        }
    }

    /**
     * Send recognized speech to backend
     */
    sendRecognizedItem(content, isFinal = true) {
        const event = isFinal ? 'recognized_item' : 'recognizing_item';
        return this.sendToBackend(event, {
            sessionId: this.sessionId,
            content: content,
            timestamp: Date.now()
        });
    }

    /**
     * Send question to backend for AI response
     */
    askQuestion(question, assistantId = null) {
        return this.sendToBackend('question', {
            sessionId: this.sessionId,
            question: question,
            assistantId: assistantId,
            timestamp: Date.now()
        });
    }
}

// Create singleton instance
const sessionService = new SessionService();

module.exports = {
    SessionService,
    sessionService
};
