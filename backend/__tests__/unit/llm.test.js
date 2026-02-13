/**
 * Tests for llm.js - focusing on the pure functions (hashEmbedding, embedText)
 * Network-dependent functions (geminiStreamAPI, ollamaStream) are tested
 * only for error handling / fallback behavior.
 */

// We need to test the hashEmbedding function which is not exported.
// We'll test it indirectly through embedText.
// Also test streamCompletion error/fallback paths.

describe('llm module', () => {
  let llm;

  beforeEach(() => {
    // Reset module and environment before each test
    jest.resetModules();
    // Clear API keys so we test fallback behavior
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER;
    llm = require('../src/llm');
  });

  describe('embedText', () => {
    test('returns a numeric array', async () => {
      const embedding = await llm.embedText('hello world');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
      embedding.forEach(val => {
        expect(typeof val).toBe('number');
        expect(isFinite(val)).toBe(true);
      });
    });

    test('returns consistent embeddings for the same input', async () => {
      const e1 = await llm.embedText('test input');
      const e2 = await llm.embedText('test input');
      expect(e1).toEqual(e2);
    });

    test('returns different embeddings for different inputs', async () => {
      const e1 = await llm.embedText('hello');
      const e2 = await llm.embedText('world');
      expect(e1).not.toEqual(e2);
    });

    test('returns normalized vector (unit length)', async () => {
      const embedding = await llm.embedText('some text here');
      const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test('handles empty string', async () => {
      const embedding = await llm.embedText('');
      expect(Array.isArray(embedding)).toBe(true);
      // All zeros normalized -> all zeros
      embedding.forEach(val => {
        expect(val).toBe(0);
      });
    });

    test('returns 128-dimensional vector by default', async () => {
      const embedding = await llm.embedText('test');
      expect(embedding).toHaveLength(128);
    });
  });

  describe('streamCompletion', () => {
    test('calls onToken with error when no API key set', async () => {
      const tokens = [];
      await llm.streamCompletion('test prompt', [], (token) => {
        tokens.push(token);
      });
      // Should have called onToken with an error message
      expect(tokens.length).toBeGreaterThan(0);
      const combined = tokens.join('');
      expect(combined).toMatch(/error|GEMINI_API_KEY/i);
    });

    test('supports 2-argument form (prompt, onToken)', async () => {
      const tokens = [];
      await llm.streamCompletion('test prompt', (token) => {
        tokens.push(token);
      });
      expect(tokens.length).toBeGreaterThan(0);
    });
  });
});
