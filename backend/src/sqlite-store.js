/**
 * SQLite Vector Store
 *
 * Persistent vector storage using better-sqlite3 with FTS5 full-text search.
 * Implements the same interface as the local JSON vector store.
 */

const path = require('path');
const { ensureDir } = require('./vector-store');

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function float32ToBuffer(arr) {
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) {
    buf.writeFloatLE(arr[i], i * 4);
  }
  return buf;
}

function bufferToFloat32(buf) {
  const arr = new Array(buf.length / 4);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = buf.readFloatLE(i * 4);
  }
  return arr;
}

function createSqliteVectorStore(storageDir) {
  ensureDir(storageDir);
  const dbPath = path.join(storageDir, 'vectors.db');

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    throw new Error('better-sqlite3 is required for SQLite vector store. Run: npm install better-sqlite3');
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      embedding BLOB
    )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vectors_fts USING fts5(
      id, text, content='vectors', content_rowid='rowid'
    )
  `);

  // Keep FTS index in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS vectors_ai AFTER INSERT ON vectors BEGIN
      INSERT INTO vectors_fts(id, text) VALUES (new.id, new.text);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS vectors_ad AFTER DELETE ON vectors BEGIN
      INSERT INTO vectors_fts(vectors_fts, id, text) VALUES ('delete', old.id, old.text);
    END
  `);

  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO vectors (id, text, metadata, embedding) VALUES (?, ?, ?, ?)'
  );
  const selectAllStmt = db.prepare('SELECT id, text, metadata, embedding FROM vectors');
  const selectPageStmt = db.prepare('SELECT id, text, metadata FROM vectors LIMIT ? OFFSET ?');
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM vectors');
  const deleteStmt = db.prepare('DELETE FROM vectors WHERE id = ?');

  async function addDocuments(documents, embedFn) {
    if (!Array.isArray(documents) || documents.length === 0) return [];

    const added = [];
    const insertMany = db.transaction((docs) => {
      for (const doc of docs) {
        const text = (doc && doc.text) ? String(doc.text) : '';
        if (!text.trim()) continue;
        const entry = {
          id: doc.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          metadata: doc.metadata || {},
          embedding: doc._embedding
        };
        insertStmt.run(
          entry.id,
          entry.text,
          JSON.stringify(entry.metadata),
          entry.embedding ? float32ToBuffer(entry.embedding) : null
        );
        added.push(entry);
      }
    });

    // Embed documents first (outside transaction since it's async)
    for (const doc of documents) {
      const text = (doc && doc.text) ? String(doc.text) : '';
      if (!text.trim()) continue;
      doc._embedding = await embedFn(text);
    }

    insertMany(documents);
    return added;
  }

  async function search(query, embedFn, topK = 5) {
    const queryText = query ? String(query) : '';
    if (!queryText.trim()) return [];

    const queryEmbedding = await embedFn(queryText);
    const rows = selectAllStmt.all();

    const scored = rows.map((row) => {
      const embedding = row.embedding ? bufferToFloat32(row.embedding) : [];
      return {
        id: row.id,
        text: row.text,
        metadata: JSON.parse(row.metadata || '{}'),
        embedding,
        score: cosineSimilarity(queryEmbedding, embedding)
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async function listVectors({ offset = 0, limit = 50 } = {}) {
    const { total } = countStmt.get();
    const items = selectPageStmt.all(limit, offset).map((row) => ({
      id: row.id,
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}')
    }));
    return { items, total, offset, limit };
  }

  async function deleteVector(id) {
    const result = deleteStmt.run(id);
    return result.changes > 0;
  }

  function clear() {
    db.exec('DELETE FROM vectors');
    db.exec("INSERT INTO vectors_fts(vectors_fts) VALUES('rebuild')");
  }

  function getVectors() {
    return selectAllStmt.all().map((row) => ({
      id: row.id,
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}'),
      embedding: row.embedding ? bufferToFloat32(row.embedding) : []
    }));
  }

  function close() {
    db.close();
  }

  return {
    dbPath,
    getVectors,
    clear,
    addDocuments,
    search,
    listVectors,
    deleteVector,
    close
  };
}

module.exports = { createSqliteVectorStore };
