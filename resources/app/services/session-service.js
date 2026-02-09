/**
 * SessionService - Main Process to Backend Bridge
 * Manages Socket.IO connection between Electron and the backend server
 */
const { io } = require('socket.io-client');
const { EventEmitter } = require('events');

class SessionService extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.isActive = false;
    this.sessionId = null;
    this.accessToken = null;
    this.config = null;
    this.backendUrl = 'http://localhost:3000';
    this.authService = null;
  }

  initialize(config) {
    this.config = config || {};
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    console.log('[SessionService] Initialized with backend:', this.backendUrl);
    this.connect();
  }

  setAuthService(service) {
    this.authService = service;
  }

  updateAccessToken(newToken) {
    this.accessToken = newToken;
  }

  connect() {
    if (this.socket) return;

    this.socket = io(this.backendUrl, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      query: { source: 'main-process' }
    });

    this.socket.on('connect', () => {
      console.log('[SessionService] Connected to backend');
      this.emit('connection-state', { connected: true });
    });

    this.socket.on('disconnect', () => {
      console.log('[SessionService] Disconnected from backend');
      this.emit('connection-state', { connected: false });
    });

    // Handle responses from backend
    this.socket.on('answer', (data) => this.emit('answer', data));
    this.socket.on('response_start', (data) => this.emit('response_start', data));
    this.socket.on('response_end', (data) => this.emit('response_end', data));
    this.socket.on('transcript', (data) => this.emit('transcript', data));
    this.socket.on('session-update', (data) => {
      if (data.sessionId) this.sessionId = data.sessionId;
      this.emit('session-update', data);
    });
  }

  async startSession(sessionData, accessToken, sessionId) {
    if (!this.socket?.connected) {
      console.warn('[SessionService] Cannot start session: valid connection required');
      return false;
    }

    this.sessionId = sessionId || this.sessionId;
    this.isActive = true;

    // Notify backend
    this.socket.emit('start_session', {
      sessionId: this.sessionId,
      ...sessionData
    });

    this.emit('session-update', {
      status: 'ready',
      sessionId: this.sessionId,
      startedAt: Date.now()
    });
    return true;
  }

  async stopSession() {
    this.isActive = false;
    if (this.socket?.connected) {
      this.socket.emit('stop_session', { sessionId: this.sessionId });
    }
    return true;
  }

  sendMessageToBackend(message) {
    if (!this.socket?.connected) return false;
    this.socket.emit('question', {
      sessionId: this.sessionId,
      content: message
    });
    return true;
  }

  sendToBackend(event, data) {
    if (!this.socket?.connected) return false;
    this.socket.emit(event, { sessionId: this.sessionId, ...data });
    return true;
  }

  async cleanup() {
    this.isActive = false;
    if (this.socket?.connected) {
      this.socket.emit('stop_session', { sessionId: this.sessionId });
    }
    this.sessionId = null;
  }

  getSessionStatus() {
    return {
      isActive: this.isActive,
      sessionId: this.sessionId,
      backendConnected: this.socket?.connected || false
    };
  }
}

const sessionService = new SessionService();
module.exports = { SessionService, sessionService };
