const path = require('path');
const { ensureDir, loadJson, saveJson } = require('./vector-store');

const DEFAULT_DISTANCE = 'Cosine';

function normalizeUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function getVectorSizeFromInfo(info) {
  return (
    info?.result?.config?.params?.vectors?.size ||
    info?.result?.config?.params?.vectors?.default?.size ||
    null
  );
}

function createQdrantStore({ url, collection, storageDir }) {
  const baseUrl = normalizeUrl(url || 'http://localhost:6333');
  const collectionName = collection || 'meeting_assistant';
  ensureDir(storageDir);

  const metaPath = path.join(storageDir, 'qdrant.json');
  let meta = loadJson(metaPath, { collection: collectionName, vectorSize: null });

  async function request(method, route, body, { allow404 = false } = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      if (allow404 && response.status === 404) {
        return null;
      }
      const message = await response.text();
      throw new Error(`Qdrant request failed (${response.status}): ${message}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  function persistMeta() {
    saveJson(metaPath, meta);
  }

  async function ensureCollection(vectorSize) {
    if (meta.vectorSize) {
      return meta.vectorSize;
    }

    const info = await request('GET', `/collections/${collectionName}`, null, { allow404: true });
    const existingSize = getVectorSizeFromInfo(info);

    if (existingSize) {
      meta.vectorSize = existingSize;
      persistMeta();
      return existingSize;
    }

    if (!vectorSize) {
      throw new Error('Vector size is required to create Qdrant collection');
    }

    await request('PUT', `/collections/${collectionName}`, {
      vectors: {
        size: vectorSize,
        distance: DEFAULT_DISTANCE
      }
    });

    meta.vectorSize = vectorSize;
    persistMeta();
    return vectorSize;
  }

  async function addDocuments(documents, embedFn) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    const points = [];

    for (const doc of documents) {
      const text = (doc && doc.text) ? String(doc.text) : '';
      if (!text.trim()) {
        continue;
      }

      const embedding = await embedFn(text);
      await ensureCollection(embedding.length);

      points.push({
        id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        vector: embedding,
        payload: {
          text,
          metadata: doc.metadata || {}
        }
      });
    }

    if (!points.length) {
      return [];
    }

    await request('PUT', `/collections/${collectionName}/points?wait=true`, {
      points
    });

    return points.map((point) => ({
      id: point.id,
      text: point.payload.text,
      metadata: point.payload.metadata
    }));
  }

  async function search(query, embedFn, topK = 5) {
    const queryText = query ? String(query) : '';
    if (!queryText.trim()) {
      return [];
    }

    const embedding = await embedFn(queryText);
    await ensureCollection(embedding.length);

    const payload = await request('POST', `/collections/${collectionName}/points/search`, {
      vector: embedding,
      limit: topK,
      with_payload: true,
      with_vector: false
    });

    const results = payload?.result || [];
    return results.map((item) => ({
      id: item.id,
      text: item.payload?.text || '',
      metadata: item.payload?.metadata || {},
      score: item.score
    }));
  }

  async function listVectors({ offset = 0, limit = 50 } = {}) {
    const info = await request('GET', `/collections/${collectionName}`, null, { allow404: true });
    if (!info) {
      return { items: [], total: null, offset, limit };
    }

    const fetchLimit = Math.max(limit + offset, limit);
    const payload = await request('POST', `/collections/${collectionName}/points/scroll`, {
      limit: fetchLimit,
      with_payload: true,
      with_vector: false
    });

    const points = payload?.result?.points || [];
    const items = points.slice(offset, offset + limit).map((item) => ({
      id: item.id,
      text: item.payload?.text || '',
      metadata: item.payload?.metadata || {}
    }));

    return { items, total: null, offset, limit };
  }

  async function deleteVector(id) {
    await request('POST', `/collections/${collectionName}/points/delete?wait=true`, {
      points: [id]
    });
    return true;
  }

  async function clear() {
    await request('DELETE', `/collections/${collectionName}`, null, { allow404: true });
    meta.vectorSize = null;
    persistMeta();
  }

  return {
    vectorsPath: metaPath,
    getVectors: () => [],
    clear,
    addDocuments,
    search,
    listVectors,
    deleteVector
  };
}

module.exports = {
  createQdrantStore
};
