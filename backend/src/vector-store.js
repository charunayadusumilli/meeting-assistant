const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[vector-store] Failed to read ${filePath}:`, error.message);
    return fallback;
  }
}

function saveJson(filePath, payload) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(`[vector-store] Failed to write ${filePath}:`, error.message);
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function createLocalVectorStore(storageDir) {
  ensureDir(storageDir);
  const vectorsPath = path.join(storageDir, 'vectors.json');
  let vectors = loadJson(vectorsPath, []);

  function persist() {
    saveJson(vectorsPath, vectors);
  }

  function getVectors() {
    return vectors;
  }

  function clear() {
    vectors = [];
    persist();
  }

  async function addDocuments(documents, embedFn) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    const added = [];
    for (const doc of documents) {
      const text = (doc && doc.text) ? String(doc.text) : '';
      if (!text.trim()) {
        continue;
      }
      const embedding = await embedFn(text);
      const entry = {
        id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        metadata: doc.metadata || {},
        embedding
      };
      vectors.push(entry);
      added.push(entry);
    }

    if (added.length) {
      persist();
    }

    return added;
  }

  async function search(query, embedFn, topK = 5) {
    const queryText = query ? String(query) : '';
    if (!queryText.trim()) {
      return [];
    }

    const queryEmbedding = await embedFn(queryText);
    const scored = vectors.map((entry) => ({
      id: entry.id,
      text: entry.text,
      metadata: entry.metadata,
      embedding: entry.embedding,
      score: cosineSimilarity(queryEmbedding, entry.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async function listVectors({ offset = 0, limit = 50 } = {}) {
    const total = vectors.length;
    const items = vectors.slice(offset, offset + limit).map((entry) => ({
      id: entry.id,
      text: entry.text,
      metadata: entry.metadata
    }));
    return { items, total, offset, limit };
  }

  async function deleteVector(id) {
    const index = vectors.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return false;
    }
    vectors.splice(index, 1);
    persist();
    return true;
  }

  return {
    vectorsPath,
    getVectors,
    clear,
    addDocuments,
    search,
    listVectors,
    deleteVector
  };
}

function createVectorStore(storageDir, options = {}) {
  const qdrantUrl = options.qdrantUrl || process.env.QDRANT_URL;
  if (qdrantUrl) {
    const { createQdrantStore } = require('./qdrant-store');
    return createQdrantStore({
      storageDir,
      url: qdrantUrl,
      collection: options.collection || process.env.QDRANT_COLLECTION || 'meeting_assistant'
    });
  }

  return createLocalVectorStore(storageDir);
}

module.exports = {
  ensureDir,
  loadJson,
  saveJson,
  createVectorStore,
  createLocalVectorStore
};
