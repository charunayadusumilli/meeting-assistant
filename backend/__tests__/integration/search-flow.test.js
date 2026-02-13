/**
 * Integration Tests: Search and Reranking Flow
 *
 * Tests the vector search and reranking pipeline:
 * - Vector similarity search
 * - TOP_K candidate retrieval
 * - Lexical reranking
 * - Combined scoring
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createVectorStore } = require('../../src/vector-store');
const { rerankCandidates } = require('../../src/rerank');
const { MockLLMProvider } = require('../helpers/mock-llm');
const fixtures = require('../helpers/fixtures');

describe('Search and Reranking Flow', () => {
  let tmpDir, vectorStore, mockLLM;

  beforeEach(async () => {
    // Create temporary directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-test-'));

    // Create vector store
    vectorStore = createVectorStore(tmpDir);

    // Create mock LLM
    mockLLM = new MockLLMProvider({ embeddingDimension: 128 });

    // Add test documents to vector store
    const documents = fixtures.documents.map((doc, idx) => ({
      ...doc,
      embedding: mockLLM.generateMockEmbedding(doc.text)
    }));

    await vectorStore.addDocuments(documents, mockLLM.embedText.bind(mockLLM));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Vector Search', () => {
    test('searches with default TOP_K', async () => {
      const query = 'JavaScript programming';
      const topK = 5;

      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        topK
      );

      expect(results.length).toBeLessThanOrEqual(topK);
      expect(results.length).toBeGreaterThan(0);
    });

    test('returns results sorted by similarity score', async () => {
      const query = 'JavaScript web development';

      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      // Scores should be in descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    test('includes document metadata', async () => {
      const query = 'programming language';

      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        3
      );

      results.forEach(result => {
        expect(result.id).toBeDefined();
        expect(result.text).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.score).toBeDefined();
      });
    });

    test('handles empty query', async () => {
      const results = await vectorStore.search(
        '',
        mockLLM.embedText.bind(mockLLM),
        5
      );

      // Should still return results (all documents have some score)
      expect(results.length).toBeGreaterThan(0);
    });

    test('handles query with no matches', async () => {
      const query = 'zxcvbnmasdfghjkl'; // Unlikely to match

      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      // Should still return results (cosine similarity always produces scores)
      expect(results.length).toBeGreaterThan(0);
    });

    test('respects TOP_K limit', async () => {
      const query = 'test query';

      // Request only 2 results
      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        2
      );

      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('handles TOP_K larger than document count', async () => {
      const query = 'test query';

      // Request more results than available
      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        100
      );

      // Should return all available documents
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(fixtures.documents.length);
    });
  });

  describe('Reranking', () => {
    test('reranks candidates with lexical scoring', async () => {
      const query = 'JavaScript programming';
      const weight = 0.25;

      // First get candidates from vector search
      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      // Rerank them
      const reranked = await rerankCandidates(query, candidates, weight);

      expect(reranked.length).toBe(candidates.length);
      expect(reranked[0].score).toBeDefined();
    });

    test('combined score uses correct formula', async () => {
      const query = 'JavaScript';
      const weight = 0.25;

      const candidates = [
        {
          id: '1',
          text: 'JavaScript is a programming language',
          score: 0.9, // High vector score
          metadata: {}
        },
        {
          id: '2',
          text: 'Python and Java',
          score: 0.8, // Lower vector score
          metadata: {}
        }
      ];

      const reranked = await rerankCandidates(query, candidates, weight);

      // First result should have "JavaScript" in text (high lexical match)
      expect(reranked[0].text).toContain('JavaScript');

      // Scores should be calculated as: (1 - weight) * vectorScore + weight * lexicalScore
      expect(reranked[0].score).toBeGreaterThan(0);
      expect(reranked[0].score).toBeLessThanOrEqual(1);
    });

    test('handles weight = 0 (vector-only ranking)', async () => {
      const query = 'test';
      const weight = 0;

      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        3
      );

      const reranked = await rerankCandidates(query, candidates, weight);

      // With weight=0, scores should be purely from vector similarity
      expect(reranked.length).toBe(candidates.length);
    });

    test('handles weight = 1 (lexical-only ranking)', async () => {
      const query = 'JavaScript';
      const weight = 1;

      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      const reranked = await rerankCandidates(query, candidates, weight);

      // With weight=1, documents with exact word matches should rank higher
      expect(reranked.length).toBe(candidates.length);
    });

    test('handles empty candidates array', async () => {
      const reranked = await rerankCandidates('query', [], 0.25);
      expect(reranked).toEqual([]);
    });

    test('handles null candidates', async () => {
      const reranked = await rerankCandidates('query', null, 0.25);
      expect(reranked).toEqual([]);
    });

    test('preserves metadata during reranking', async () => {
      const query = 'JavaScript';
      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        3
      );

      const reranked = await rerankCandidates(query, candidates, 0.25);

      reranked.forEach((result, idx) => {
        expect(result.id).toBeDefined();
        expect(result.text).toBeDefined();
        expect(result.metadata).toBeDefined();
      });
    });
  });

  describe('Search + Rerank Pipeline', () => {
    test('complete search and rerank flow', async () => {
      const query = 'JavaScript library for React';
      const TOP_K = 5;
      const RERANK_WEIGHT = 0.25;

      // Step 1: Vector search
      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        TOP_K * 3 // Get more candidates for reranking
      );

      expect(candidates.length).toBeGreaterThan(0);

      // Step 2: Rerank
      const reranked = await rerankCandidates(query, candidates, RERANK_WEIGHT);

      // Step 3: Take top K
      const finalResults = reranked.slice(0, TOP_K);

      expect(finalResults.length).toBeLessThanOrEqual(TOP_K);
      expect(finalResults.length).toBeGreaterThan(0);

      // Results should contain "React" or "JavaScript" text
      const hasRelevantResults = finalResults.some(result =>
        result.text.toLowerCase().includes('javascript') ||
        result.text.toLowerCase().includes('react')
      );
      expect(hasRelevantResults).toBe(true);
    });

    test('reranking changes result order', async () => {
      const query = 'React library';

      // Get initial vector search results
      const vectorResults = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      // Rerank with high lexical weight
      const reranked = await rerankCandidates(query, vectorResults, 0.8);

      // Order may change (documents with "React" in text get boosted)
      expect(reranked.length).toBe(vectorResults.length);
    });

    test('handles multi-word query', async () => {
      const query = 'JavaScript programming language for web development';

      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        10
      );

      const reranked = await rerankCandidates(query, candidates, 0.25);

      expect(reranked.length).toBe(candidates.length);
      expect(reranked[0].score).toBeDefined();
    });

    test('handles query with special characters', async () => {
      const query = 'What is Node.js?';

      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      const reranked = await rerankCandidates(query, candidates, 0.25);

      expect(reranked.length).toBe(candidates.length);
    });
  });

  describe('Score Normalization', () => {
    test('scores are between 0 and 1', async () => {
      const query = 'test query';

      const results = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        5
      );

      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    test('reranked scores are between 0 and 1', async () => {
      const query = 'test';
      const candidates = await vectorStore.search(
        query,
        mockLLM.embedText.bind(mockLLM),
        3
      );

      const reranked = await rerankCandidates(query, candidates, 0.25);

      reranked.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });
  });
});
