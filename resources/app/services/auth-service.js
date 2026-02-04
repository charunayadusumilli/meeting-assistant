/**
 * AuthService - Local-only authentication stub
 */
class AuthService {
  constructor() {
    this.accessToken = null;
    this.eventListeners = new Map();
    this.config = null;
    this.isAuthDisabled = true;
  }

  initialize(config) {
    this.config = config || {};
    this.isAuthDisabled = true;
    this.accessToken = this.config?.auth?.localToken || 'local-dev-token';
    console.log('AuthService initialized in local-only mode');
  }

  isAuthenticated() {
    return true;
  }

  async isAuthenticatedAsync() {
    return true;
  }

  isLoggedIn() {
    return true;
  }

  getToken() {
    if (!this.accessToken) {
      this.accessToken = this.config?.auth?.localToken || 'local-dev-token';
    }
    return this.accessToken;
  }

  async login() {
    this.accessToken = this.getToken();
    this.emit('authenticated', { accessToken: this.accessToken });
    return true;
  }

  async logout() {
    this.emit('logged-out');
    return true;
  }

  async handleCallback() {
    return true;
  }

  getPendingAuth() {
    return null;
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
}

const authService = new AuthService();

module.exports = {
  AuthService,
  authService
};
