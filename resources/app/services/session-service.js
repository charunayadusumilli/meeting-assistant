/**
 * SessionService - Local-only session + streaming stub
 */
class SessionService {
  constructor() {
    this.isActive = false;
    this.isStarting = false;
    this.sessionId = null;
    this.accessToken = null;
    this.config = null;
    this.eventListeners = new Map();
    this.requestCounter = 0;
    this.activeRequestId = null;
  }

  initialize(config) {
    this.config = config || {};
    console.log('SessionService initialized in local mode');
  }

  setAuthService() {
    // no-op for local mode
  }

  updateAccessToken(newToken) {
    if (newToken) {
      this.accessToken = newToken;
    }
  }

  async startSession(sessionData, accessToken, sessionId) {
    if (this.isActive || this.isStarting) {
      console.warn('Session already active or starting');
      return false;
    }

    this.isStarting = true;
    this.sessionId = sessionId || `local-session-${Date.now()}`;
    this.accessToken = accessToken || 'local-dev-token';

    this.isActive = true;
    this.isStarting = false;

    this.emit('session-update', {
      status: 'ready',
      sessionId: this.sessionId,
      startedAt: Date.now(),
      ...sessionData
    });

    return true;
  }

  async stopSession() {
    if (!this.isActive && !this.isStarting) {
      console.warn('No active session to stop');
      return false;
    }

    await this.cleanup();
    return true;
  }

  getSessionStatus() {
    return {
      isActive: this.isActive,
      sessionId: this.sessionId,
      backendConnected: false,
      connections: { backend: null }
    };
  }

  async cleanup() {
    this.isActive = false;
    this.isStarting = false;
    this.sessionId = null;
    this.accessToken = null;
    this.activeRequestId = null;
    this.requestCounter = 0;
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  isRelevantRequest(requestId) {
    return requestId === undefined || requestId === null || requestId === this.activeRequestId;
  }

  startNewRequest() {
    this.requestCounter += 1;
    this.activeRequestId = this.requestCounter;
    return this.activeRequestId;
  }

  prepareQuestionPayload(data) {
    const payload = (data && typeof data === 'object' && !Array.isArray(data)) ? { ...data } : {};
    payload.requestId = this.startNewRequest();
    return payload;
  }

  sendToBackend(event, data) {
    if (!this.isActive) {
      console.warn('Session is not active; ignoring outbound event:', event);
      return false;
    }

    if (event === 'question') {
      const payload = this.prepareQuestionPayload(data);
      const answerText = 'Local mode: backend not configured yet.';

      this.emit('response_start', { requestId: payload.requestId });
      this.emit('answer', {
        requestId: payload.requestId,
        content: answerText,
        isFinal: true
      });
      this.emit('response_end', { requestId: payload.requestId });
      return true;
    }

    if (event === 'recognizing_item' || event === 'recognized_item') {
      this.emit('transcript', data);
      return true;
    }

    if (event === 'clear') {
      this.emit('clear', data);
      return true;
    }

    this.emit(`backend-${event}`, data);
    return true;
  }

  sendMessageToBackend(message) {
    return this.sendToBackend('message', message);
  }
}

const sessionService = new SessionService();

module.exports = {
  SessionService,
  sessionService
};
