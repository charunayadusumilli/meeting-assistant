/**
 * Mock LLM Provider for Testing
 *
 * Provides deterministic responses and embeddings without making real API calls.
 * This prevents API costs and ensures consistent, repeatable test results.
 */

class MockLLMProvider {
  constructor(options = {}) {
    this.responses = options.responses || ['Mock response'];
    this.embeddings = options.embeddings || null;
    this.streamDelay = options.streamDelay || 10; // ms between tokens
    this.shouldFail = options.shouldFail || false;
    this.embeddingDimension = options.embeddingDimension || 128;
  }

  /**
   * Generate a deterministic embedding vector from text
   * Uses hash-based approach similar to fallback in llm.js
   */
  async embedText(text) {
    if (this.shouldFail) {
      throw new Error('Mock LLM embedding failed');
    }

    if (!text) {
      text = 'default';
    }

    // Return pre-configured embedding if available
    if (this.embeddings && this.embeddings[text]) {
      return this.embeddings[text];
    }

    // Generate deterministic hash-based embedding
    return this.generateMockEmbedding(text);
  }

  /**
   * Generate a normalized vector from text content
   * Similar to the hash-based fallback in the actual LLM module
   */
  generateMockEmbedding(text) {
    const vec = new Array(this.embeddingDimension).fill(0);

    // Create vector from character codes
    for (let i = 0; i < text.length; i++) {
      vec[i % this.embeddingDimension] += text.charCodeAt(i);
    }

    // Normalize the vector
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vec.map(val => val / norm);
  }

  /**
   * Simulate streaming completion with configurable responses
   * Calls onToken callback for each token (word) in the response
   */
  async streamCompletion(prompt, images, onToken) {
    // Handle overloaded function signature (images optional)
    if (typeof images === 'function') {
      onToken = images;
      images = [];
    }

    if (this.shouldFail) {
      throw new Error('Mock LLM streaming failed');
    }

    // Get next response from queue (or use default)
    const response = this.responses.length > 0
      ? this.responses.shift()
      : 'Default mock response';

    // Split into tokens and stream them
    const tokens = response.split(' ');

    for (const token of tokens) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, this.streamDelay));

      // Call the token callback
      onToken(token + ' ');
    }
  }

  /**
   * Add a response to the queue
   */
  addResponse(response) {
    this.responses.push(response);
  }

  /**
   * Add a pre-configured embedding
   */
  addEmbedding(text, embedding) {
    if (!this.embeddings) {
      this.embeddings = {};
    }
    this.embeddings[text] = embedding;
  }

  /**
   * Reset the mock state
   */
  reset() {
    this.responses = [];
    this.embeddings = null;
    this.shouldFail = false;
  }
}

module.exports = { MockLLMProvider };
