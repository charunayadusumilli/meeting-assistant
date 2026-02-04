const { localAssistantStore } = require('./local-assistant-store');

/**
 * ApiService - Local-only stub for Meeting Assistant
 */
class ApiService {
  constructor() {
    this.config = null;
    this.authService = null;
  }

  initialize(config, authService) {
    this.config = config || {};
    this.authService = authService || null;
    console.log('ApiService initialized in local mode');
  }

  getAuthHeaders() {
    const token = this.authService?.getToken?.() || 'local-dev-token';
    return {
      'Content-Type': 'application/json',
      'Authorization': token
    };
  }

  async fetchTopics(search = '', page = 0, pageSize = 10) {
    return localAssistantStore.list({ search, page, pageSize });
  }

  async fetchTopicDetails(topicId) {
    const assistant = localAssistantStore.getById(topicId);
    if (!assistant) {
      throw new Error('Assistant not found');
    }
    return assistant;
  }

  async createSession(huddleId, options = {}) {
    if (!huddleId) {
      throw new Error('huddleId is required to create a session');
    }

    const sessionId = `local-session-${Date.now()}`;
    return {
      _id: sessionId,
      id: sessionId,
      sessionId,
      huddleId,
      createdAt: Date.now(),
      status: 'ready',
      ...options
    };
  }

  async createDocumentUpload(documentData = {}) {
    const now = Date.now();
    return {
      presignedUrl: null,
      document: {
        _id: `local-doc-${now}`,
        id: `local-doc-${now}`,
        fileKey: null,
        fileUrl: null,
        name: documentData.name || 'Document',
        createdAt: now
      }
    };
  }

  async getDocument(documentId) {
    return {
      _id: documentId,
      id: documentId,
      fileUrl: null,
      presignedUrl: null
    };
  }

  getDefaultSpeechTokenTtlSeconds() {
    const fallback = 600;
    const configured = this.config?.speech?.defaultTokenTtlSeconds;
    const parsed = Number(configured);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  async fetchSpeechToken() {
    const ttlSeconds = this.getDefaultSpeechTokenTtlSeconds();
    const now = Date.now();

    return {
      token: this.authService?.getToken?.() || 'local-dev-token',
      region: this.config?.speech?.microsoft?.region || 'local',
      expiresIn: ttlSeconds,
      expiresAt: now + ttlSeconds * 1000
    };
  }
}

const apiService = new ApiService();

module.exports = {
  ApiService,
  apiService
};
