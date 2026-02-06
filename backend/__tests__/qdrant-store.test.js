const { createQdrantStore } = require('../src/qdrant-store');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('createQdrantStore', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qdrant-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates store object with expected methods', () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test_collection',
      storageDir: tmpDir
    });

    expect(typeof store.addDocuments).toBe('function');
    expect(typeof store.search).toBe('function');
    expect(typeof store.listVectors).toBe('function');
    expect(typeof store.deleteVector).toBe('function');
    expect(typeof store.clear).toBe('function');
    expect(typeof store.getVectors).toBe('function');
  });

  test('getVectors returns empty array', () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test_collection',
      storageDir: tmpDir
    });
    expect(store.getVectors()).toEqual([]);
  });

  test('vectorsPath points to qdrant.json in storage dir', () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test_collection',
      storageDir: tmpDir
    });
    expect(store.vectorsPath).toBe(path.join(tmpDir, 'qdrant.json'));
  });

  test('addDocuments returns empty for empty input', async () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test',
      storageDir: tmpDir
    });
    const result = await store.addDocuments([], async () => [1, 2, 3]);
    expect(result).toEqual([]);
  });

  test('addDocuments returns empty for null input', async () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test',
      storageDir: tmpDir
    });
    const result = await store.addDocuments(null, async () => [1, 2, 3]);
    expect(result).toEqual([]);
  });

  test('search returns empty for empty query', async () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test',
      storageDir: tmpDir
    });
    const result = await store.search('', async () => [1, 2, 3]);
    expect(result).toEqual([]);
  });

  test('search returns empty for whitespace query', async () => {
    const store = createQdrantStore({
      url: 'http://localhost:6333',
      collection: 'test',
      storageDir: tmpDir
    });
    const result = await store.search('   ', async () => [1, 2, 3]);
    expect(result).toEqual([]);
  });
});
