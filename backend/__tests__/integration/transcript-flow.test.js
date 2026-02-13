/**
 * Integration Tests: Transcript Ingestion Flow
 *
 * Tests the complete transcript ingestion pipeline:
 * - Text extraction from various STT formats
 * - Chunking with overlap
 * - Embedding generation
 * - Vector store persistence
 * - File ingestion and duplicate prevention
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createVectorStore } = require('../../src/vector-store');
const { MockLLMProvider } = require('../helpers/mock-llm');
const fixtures = require('../helpers/fixtures');

// Mock the server module (will be required in tests)
let serverTest;

describe('Transcript Ingestion Flow', () => {
  let tmpDir, vectorStore, mockLLM;

  beforeEach(() => {
    // Create temporary directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-test-'));

    // Set up test environment
    process.env.DATA_DIR = tmpDir;
    process.env.TRANSCRIPTS_DIR = path.join(tmpDir, 'transcripts');
    process.env.STORAGE_DIR = path.join(tmpDir, 'storage');

    // Create directories
    fs.mkdirSync(process.env.TRANSCRIPTS_DIR, { recursive: true });
    fs.mkdirSync(process.env.STORAGE_DIR, { recursive: true });

    // Create vector store
    vectorStore = createVectorStore(process.env.STORAGE_DIR);

    // Create mock LLM provider
    mockLLM = new MockLLMProvider({ embeddingDimension: 128 });

    // Import server test functions (after env is set)
    // Note: In production, server.js starts automatically. For tests, we only import functions.
    delete require.cache[require.resolve('../../src/server')];
    serverTest = require('../../src/server').__test__;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('extractTranscriptText', () => {
    const { extractTranscriptText } = require('../../src/server').__test__ || {};

    test('extracts text from Web Speech API format', () => {
      const result = extractTranscriptText({ text: 'Hello world' });
      expect(result).toBe('Hello world');
    });

    test('extracts text from Deepgram format', () => {
      const data = { alternatives: [{ transcript: 'Deepgram text' }] };
      const result = extractTranscriptText(data);
      expect(result).toBe('Deepgram text');
    });

    test('extracts text from Azure format', () => {
      const data = { displayText: 'Azure text' };
      const result = extractTranscriptText(data);
      expect(result).toBe('Azure text');
    });

    test('extracts text from content field', () => {
      const data = { content: 'Content field text' };
      const result = extractTranscriptText(data);
      expect(result).toBe('Content field text');
    });

    test('extracts text from nBest format', () => {
      const data = { nBest: [{ display: 'nBest text' }] };
      const result = extractTranscriptText(data);
      expect(result).toBe('nBest text');
    });

    test('handles string input directly', () => {
      const result = extractTranscriptText('Direct string');
      expect(result).toBe('Direct string');
    });

    test('returns empty string for null/undefined', () => {
      expect(extractTranscriptText(null)).toBe('');
      expect(extractTranscriptText(undefined)).toBe('');
    });

    test('returns empty string for empty object', () => {
      expect(extractTranscriptText({})).toBe('');
    });

    test('returns empty string for malformed data', () => {
      expect(extractTranscriptText({ randomField: 'value' })).toBe('');
    });
  });

  describe('splitIntoChunks', () => {
    const { splitIntoChunks } = require('../../src/server').__test__ || {};

    test('creates single chunk for short text', () => {
      const text = 'Short text';
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    test('creates multiple chunks for long text', () => {
      const text = 'A'.repeat(2000);
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(800);
    });

    test('creates chunks with correct overlap', () => {
      const text = 'A'.repeat(1500);
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks.length).toBeGreaterThan(1);

      // Check overlap between first and second chunk
      const overlap = chunks[0].slice(-120);
      expect(chunks[1].startsWith(overlap)).toBe(true);
    });

    test('handles text exactly at chunk size', () => {
      const text = 'B'.repeat(800);
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    test('handles very long text', () => {
      const text = fixtures.chunks.veryLong;
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks.length).toBeGreaterThan(5);

      // Verify all chunks are within size limit
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(800);
      });
    });

    test('handles text with newlines', () => {
      const text = fixtures.chunks.withNewlines;
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(800);
      });
    });

    test('handles unicode characters', () => {
      const text = fixtures.chunks.unicode;
      const chunks = splitIntoChunks(text, 800, 120);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(800);
      });
    });

    test('handles empty text', () => {
      const chunks = splitIntoChunks('', 800, 120);
      expect(chunks).toEqual(['']);
    });
  });

  describe('ingestTranscriptText', () => {
    const { ingestTranscriptText } = require('../../src/server').__test__ || {};

    test('chunks and embeds transcript text', async () => {
      const text = 'A'.repeat(1500);
      const metadata = { source: 'test', sessionId: 'session-123' };

      const added = await ingestTranscriptText(
        text,
        metadata,
        'test-prefix',
        mockLLM.embedText.bind(mockLLM),
        vectorStore
      );

      expect(added).toBeGreaterThan(0);

      // Verify vectors were added
      const vectors = vectorStore.listVectors({ offset: 0, limit: 100 });
      expect(vectors.vectors.length).toBe(added);
    });

    test('generates correct chunk metadata', async () => {
      const text = 'Test transcript for chunking and metadata validation.';
      const metadata = {
        source: 'test',
        sessionId: 'session-456',
        filename: 'test.txt'
      };

      await ingestTranscriptText(
        text,
        metadata,
        'meta-test',
        mockLLM.embedText.bind(mockLLM),
        vectorStore
      );

      const vectors = vectorStore.listVectors({ offset: 0, limit: 10 });
      const firstVector = vectors.vectors[0];

      expect(firstVector.metadata.source).toBe('test');
      expect(firstVector.metadata.sessionId).toBe('session-456');
      expect(firstVector.metadata.filename).toBe('test.txt');
      expect(firstVector.metadata.chunk).toBe(1);
      expect(firstVector.metadata.chunkCount).toBeGreaterThan(0);
      expect(firstVector.metadata.ingestedAt).toBeDefined();
    });

    test('creates correct number of chunks', async () => {
      const text = 'B'.repeat(2500); // Should create ~3 chunks
      const metadata = { source: 'test' };

      const added = await ingestTranscriptText(
        text,
        metadata,
        'chunk-count',
        mockLLM.embedText.bind(mockLLM),
        vectorStore
      );

      // With 800 char chunks and 120 overlap, 2500 chars ~= 3-4 chunks
      expect(added).toBeGreaterThanOrEqual(3);
      expect(added).toBeLessThanOrEqual(4);
    });

    test('embeds each chunk', async () => {
      const text = 'Test text '.repeat(200); // Long enough for multiple chunks
      const metadata = { source: 'test' };

      await ingestTranscriptText(
        text,
        metadata,
        'embed-test',
        mockLLM.embedText.bind(mockLLM),
        vectorStore
      );

      const vectors = vectorStore.listVectors({ offset: 0, limit: 10 });

      vectors.vectors.forEach(vector => {
        expect(vector.embedding).toBeDefined();
        expect(Array.isArray(vector.embedding)).toBe(true);
        expect(vector.embedding.length).toBe(128);
      });
    });

    test('handles empty text', async () => {
      const added = await ingestTranscriptText(
        '',
        { source: 'test' },
        'empty',
        mockLLM.embedText.bind(mockLLM),
        vectorStore
      );

      expect(added).toBe(1); // Single empty chunk
    });
  });

  describe('ingestTranscriptFile', () => {
    const { ingestTranscriptFile } = require('../../src/server').__test__ || {};

    test('ingests .txt file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const content = 'This is a test transcript file with some content.';
      fs.writeFileSync(filePath, content);

      const added = await ingestTranscriptFile(
        filePath,
        'session-123',
        mockLLM.embedText.bind(mockLLM),
        vectorStore,
        {}
      );

      expect(added).toBeGreaterThan(0);
    });

    test('ingests .json array file', async () => {
      const filePath = path.join(tmpDir, 'test.json');
      const content = ['Line 1', 'Line 2', 'Line 3'];
      fs.writeFileSync(filePath, JSON.stringify(content));

      const added = await ingestTranscriptFile(
        filePath,
        'session-456',
        mockLLM.embedText.bind(mockLLM),
        vectorStore,
        {}
      );

      expect(added).toBeGreaterThan(0);
    });

    test('ingests .json object array file', async () => {
      const filePath = path.join(tmpDir, 'test-objects.json');
      const content = [
        { text: 'Object 1' },
        { text: 'Object 2' },
        { displayText: 'Object 3' }
      ];
      fs.writeFileSync(filePath, JSON.stringify(content));

      const added = await ingestTranscriptFile(
        filePath,
        'session-789',
        mockLLM.embedText.bind(mockLLM),
        vectorStore,
        {}
      );

      expect(added).toBeGreaterThan(0);
    });

    test('prevents duplicate ingestion', async () => {
      const filePath = path.join(tmpDir, 'duplicate.txt');
      fs.writeFileSync(filePath, 'Duplicate test content');

      const ingestedFiles = {};

      // First ingestion
      const first = await ingestTranscriptFile(
        filePath,
        'session-dup',
        mockLLM.embedText.bind(mockLLM),
        vectorStore,
        ingestedFiles
      );

      // Second ingestion (should be skipped)
      const second = await ingestTranscriptFile(
        filePath,
        'session-dup',
        mockLLM.embedText.bind(mockLLM),
        vectorStore,
        ingestedFiles
      );

      expect(first).toBeGreaterThan(0);
      expect(second).toBe(0);
      expect(ingestedFiles[filePath]).toBeDefined();
    });

    test('handles non-existent file gracefully', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.txt');

      await expect(
        ingestTranscriptFile(
          filePath,
          'session-404',
          mockLLM.embedText.bind(mockLLM),
          vectorStore,
          {}
        )
      ).rejects.toThrow();
    });

    test('includes correct metadata', async () => {
      const filePath = path.join(tmpDir, 'metadata-test.txt');
      fs.writeFileSync(filePath, 'Metadata test content');

      await ingestTranscriptFile(
        filePath,
        'session-meta',
        mockLLM.embedText.bind(mockLLM),
        vectorStore,
        {}
      );

      const vectors = vectorStore.listVectors({ offset: 0, limit: 10 });
      const firstVector = vectors.vectors[0];

      expect(firstVector.metadata.source).toBe('transcript');
      expect(firstVector.metadata.sessionId).toBe('session-meta');
      expect(firstVector.metadata.filename).toContain('metadata-test.txt');
    });
  });

  describe('Transcript Chunking Edge Cases', () => {
    const { splitIntoChunks } = require('../../src/server').__test__ || {};

    test('handles chunk size smaller than overlap', () => {
      const text = 'A'.repeat(500);
      const chunks = splitIntoChunks(text, 100, 120);

      // Overlap larger than chunk size should still work
      expect(chunks.length).toBeGreaterThan(0);
    });

    test('handles zero overlap', () => {
      const text = 'B'.repeat(2000);
      const chunks = splitIntoChunks(text, 800, 0);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify no overlap
      const end = chunks[0].slice(-10);
      expect(chunks[1].startsWith(end)).toBe(false);
    });

    test('handles very small chunk size', () => {
      const text = 'Small chunk test';
      const chunks = splitIntoChunks(text, 5, 2);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(5);
      });
    });
  });
});
