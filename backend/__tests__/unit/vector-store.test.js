const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureDir, loadJson, saveJson, createLocalVectorStore } = require('../src/vector-store');

describe('vector-store utilities', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- ensureDir ---
  describe('ensureDir', () => {
    test('creates a new directory', () => {
      const dir = path.join(tmpDir, 'a', 'b', 'c');
      ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    test('is idempotent on existing directory', () => {
      ensureDir(tmpDir);
      expect(fs.existsSync(tmpDir)).toBe(true);
    });
  });

  // --- loadJson ---
  describe('loadJson', () => {
    test('returns fallback when file does not exist', () => {
      const result = loadJson(path.join(tmpDir, 'nope.json'), { x: 1 });
      expect(result).toEqual({ x: 1 });
    });

    test('loads valid JSON file', () => {
      const filePath = path.join(tmpDir, 'data.json');
      fs.writeFileSync(filePath, JSON.stringify({ hello: 'world' }));
      const result = loadJson(filePath, {});
      expect(result).toEqual({ hello: 'world' });
    });

    test('returns fallback on malformed JSON', () => {
      const filePath = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(filePath, '{ not valid json');
      const result = loadJson(filePath, []);
      expect(result).toEqual([]);
    });
  });

  // --- saveJson ---
  describe('saveJson', () => {
    test('writes JSON to file', () => {
      const filePath = path.join(tmpDir, 'out.json');
      saveJson(filePath, { a: 1, b: [2, 3] });
      const raw = fs.readFileSync(filePath, 'utf8');
      expect(JSON.parse(raw)).toEqual({ a: 1, b: [2, 3] });
    });

    test('overwrites existing file', () => {
      const filePath = path.join(tmpDir, 'over.json');
      saveJson(filePath, { first: true });
      saveJson(filePath, { second: true });
      const raw = fs.readFileSync(filePath, 'utf8');
      expect(JSON.parse(raw)).toEqual({ second: true });
    });
  });
});

describe('createLocalVectorStore', () => {
  let tmpDir;
  let store;

  // Simple mock embed function that returns deterministic vectors
  function mockEmbed(text) {
    const vec = new Array(4).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 4] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return Promise.resolve(vec.map(v => v / norm));
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-store-'));
    store = createLocalVectorStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('starts with empty vectors', () => {
    expect(store.getVectors()).toEqual([]);
  });

  test('addDocuments stores vectors and persists them', async () => {
    const docs = [
      { id: 'doc1', text: 'hello world', metadata: { source: 'test' } },
      { id: 'doc2', text: 'foo bar baz', metadata: { source: 'test' } }
    ];
    const added = await store.addDocuments(docs, mockEmbed);
    expect(added).toHaveLength(2);
    expect(store.getVectors()).toHaveLength(2);

    // Check persistence
    const raw = fs.readFileSync(store.vectorsPath, 'utf8');
    const persisted = JSON.parse(raw);
    expect(persisted).toHaveLength(2);
    expect(persisted[0].id).toBe('doc1');
  });

  test('addDocuments skips empty text', async () => {
    const docs = [
      { id: 'empty1', text: '', metadata: {} },
      { id: 'empty2', text: '   ', metadata: {} },
      { id: 'valid', text: 'actual content', metadata: {} }
    ];
    const added = await store.addDocuments(docs, mockEmbed);
    expect(added).toHaveLength(1);
    expect(added[0].id).toBe('valid');
  });

  test('addDocuments handles empty array', async () => {
    const added = await store.addDocuments([], mockEmbed);
    expect(added).toEqual([]);
  });

  test('addDocuments handles null/undefined input', async () => {
    const added = await store.addDocuments(null, mockEmbed);
    expect(added).toEqual([]);
  });

  test('search returns ranked results', async () => {
    await store.addDocuments([
      { id: 'd1', text: 'machine learning algorithms', metadata: {} },
      { id: 'd2', text: 'cooking recipe for pasta', metadata: {} },
      { id: 'd3', text: 'deep learning neural networks', metadata: {} }
    ], mockEmbed);

    const results = await store.search('machine learning', mockEmbed, 2);
    expect(results).toHaveLength(2);
    // Results should have score property
    expect(results[0]).toHaveProperty('score');
    expect(results[0]).toHaveProperty('text');
    expect(results[0]).toHaveProperty('id');
  });

  test('search returns empty for empty query', async () => {
    await store.addDocuments([{ id: 'd1', text: 'hello', metadata: {} }], mockEmbed);
    const results = await store.search('', mockEmbed, 5);
    expect(results).toEqual([]);
  });

  test('search returns empty for whitespace query', async () => {
    await store.addDocuments([{ id: 'd1', text: 'hello', metadata: {} }], mockEmbed);
    const results = await store.search('   ', mockEmbed, 5);
    expect(results).toEqual([]);
  });

  test('listVectors with pagination', async () => {
    await store.addDocuments([
      { id: 'd1', text: 'first', metadata: {} },
      { id: 'd2', text: 'second', metadata: {} },
      { id: 'd3', text: 'third', metadata: {} }
    ], mockEmbed);

    const page1 = await store.listVectors({ offset: 0, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.offset).toBe(0);
    expect(page1.limit).toBe(2);
    // listVectors strips embedding
    expect(page1.items[0]).not.toHaveProperty('embedding');

    const page2 = await store.listVectors({ offset: 2, limit: 2 });
    expect(page2.items).toHaveLength(1);
  });

  test('deleteVector removes and persists', async () => {
    await store.addDocuments([
      { id: 'keep', text: 'stays', metadata: {} },
      { id: 'remove', text: 'goes away', metadata: {} }
    ], mockEmbed);

    const deleted = await store.deleteVector('remove');
    expect(deleted).toBe(true);
    expect(store.getVectors()).toHaveLength(1);
    expect(store.getVectors()[0].id).toBe('keep');
  });

  test('deleteVector returns false for missing id', async () => {
    const deleted = await store.deleteVector('nonexistent');
    expect(deleted).toBe(false);
  });

  test('clear empties the store', async () => {
    await store.addDocuments([
      { id: 'd1', text: 'data', metadata: {} }
    ], mockEmbed);
    expect(store.getVectors()).toHaveLength(1);

    store.clear();
    expect(store.getVectors()).toHaveLength(0);
  });

  test('generates id when document has no id', async () => {
    const added = await store.addDocuments([
      { text: 'no id here', metadata: {} }
    ], mockEmbed);
    expect(added).toHaveLength(1);
    expect(added[0].id).toBeDefined();
    expect(typeof added[0].id).toBe('string');
  });
});
