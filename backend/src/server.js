const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ensureDir, loadJson, saveJson, createVectorStore } = require('./vector-store');
const { embedText, streamCompletion } = require('./llm');
const { rerankCandidates } = require('./rerank');
const { SpeechService } = require('./speech-service');
const { createAssistantHtml, vectorAdminHtml, transcriptAdminHtml } = require('./admin-html');

const speechService = new SpeechService({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/log', (req, res) => {
  console.log('[remote-log]', req.body);
  res.sendStatus(200);
});

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const TOP_K = Number(process.env.TOP_K || 5);
const RERANK_WEIGHT = Number(process.env.RERANK_WEIGHT || 0.25);
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 800);
const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP || 120);
const TRANSCRIPT_SCAN_INTERVAL = Number(process.env.TRANSCRIPT_SCAN_INTERVAL || 30000);
const AUTO_DETECT_COOLDOWN_MS = Number(process.env.AUTO_DETECT_COOLDOWN || 15000);
const AUTO_DETECT_CONTEXT_LINES = 20;
const AUTO_DETECT_MIN_WORDS = 5;

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const TRANSCRIPTS_DIR = path.join(DATA_DIR, 'transcripts');

ensureDir(DATA_DIR);
ensureDir(STORAGE_DIR);
ensureDir(UPLOAD_DIR);
ensureDir(TRANSCRIPTS_DIR);

const assistantsPath = path.join(DATA_DIR, 'assistants.json');
const defaultAssistants = [
  {
    id: 'assistant-general',
    name: 'Meeting Assistant',
    description: 'General meeting copilot for summaries, Q&A, and action items.',
    systemPrompt: 'You are Meeting Assistant, a concise and helpful meeting copilot. Provide clear, actionable answers.',
    createdAt: new Date().toISOString()
  }
];

let assistants = loadJson(assistantsPath, defaultAssistants);
if (!fs.existsSync(assistantsPath)) {
  saveJson(assistantsPath, assistants);
}

const uploadsMetaPath = path.join(STORAGE_DIR, 'uploads.json');
let uploadsMeta = loadJson(uploadsMetaPath, {});

function persistUploads() {
  saveJson(uploadsMetaPath, uploadsMeta);
}

const ingestedPath = path.join(STORAGE_DIR, 'ingested.json');
let ingestedFiles = loadJson(ingestedPath, {});

function persistIngested() {
  saveJson(ingestedPath, ingestedFiles);
}

const vectorStore = createVectorStore(STORAGE_DIR);
const sessionBuffers = new Map();
const autoDetectState = new Map();
let lastTranscriptScan = null;
let lastTranscriptScanCount = 0;

function extractTranscriptText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data.text === 'string') return data.text;
  if (typeof data.displayText === 'string') return data.displayText;
  if (typeof data.transcript === 'string') return data.transcript;
  if (typeof data.utterance === 'string') return data.utterance;
  if (typeof data.content === 'string') return data.content;
  const alt = data.alternatives && data.alternatives[0];
  if (alt && typeof alt.transcript === 'string') return alt.transcript;
  const best = data.nBest && data.nBest[0];
  if (best && typeof best.display === 'string') return best.display;
  if (best && typeof best.lexical === 'string') return best.lexical;
  return '';
}

function isQuestion(text) {
  const trimmed = text.trim();
  if (!trimmed) return { isQuestion: false, type: null };

  const hasQuestionMark = trimmed.endsWith('?');
  const questionWordPattern = /^(what|how|why|when|where|who|which|can you|could you|would you|will you|do you|does|did|is it|are there|have you|has anyone|should|shall|tell me|explain|describe|walk me through)\b/i;
  const codingTaskPattern = /\b(write a|implement|create a|build a|design a|code a|fix the|debug|refactor|optimize|solve|find the bug|what's wrong|what is wrong|correct this|modify|update the|add a|remove the)\b/i;

  const startsWithQuestionWord = questionWordPattern.test(trimmed);
  const isCodingTask = codingTaskPattern.test(trimmed);

  const detected = hasQuestionMark || startsWithQuestionWord || isCodingTask;
  return {
    isQuestion: detected,
    type: isCodingTask ? 'coding' : (detected ? 'question' : null)
  };
}

async function detectAndAutoAnswer(socket, sessionId, text) {
  const state = autoDetectState.get(sessionId);
  if (!state || !state.enabled) return;

  const now = Date.now();
  if (state.lastTriggeredAt && (now - state.lastTriggeredAt) < AUTO_DETECT_COOLDOWN_MS) return;

  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < AUTO_DETECT_MIN_WORDS) return;

  const detection = isQuestion(text);
  if (!detection.isQuestion) return;

  state.lastTriggeredAt = now;
  autoDetectState.set(sessionId, state);

  console.log(`[auto-detect] Detected (${detection.type}) in session ${sessionId}: "${text.substring(0, 80)}"`);

  if (detection.type === 'coding') {
    socket.emit('auto-capture-screenshot', {
      reason: 'Coding question detected',
      detectedQuestion: text
    });
    return;
  }

  socket.emit('auto-answer-start', { detectedQuestion: text, type: detection.type });

  const buffer = sessionBuffers.get(sessionId);
  const recentLines = buffer ? buffer.lines.slice(-AUTO_DETECT_CONTEXT_LINES) : [];
  const transcriptContext = recentLines.join('\n');

  const contextualQuestion = transcriptContext
    ? `[RECENT CONVERSATION]\n${transcriptContext}\n\n[DETECTED QUESTION]\n${text}`
    : text;

  await handleQuestion(socket, {
    question: contextualQuestion,
    sessionId,
    assistantId: state.assistantId || 'assistant-general',
    _autoDetected: true,
    _detectionType: detection.type
  });

  socket.emit('auto-answer-end', { detectedQuestion: text });
}

function splitIntoChunks(text, size, overlap) {
  const input = String(text || '').trim();
  if (!input) return [];
  const chunks = [];
  let start = 0;
  const limit = Math.max(size, 50);
  const overlapSize = Math.max(overlap, 0);
  while (start < input.length) {
    const end = Math.min(start + limit, input.length);
    const chunk = input.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= input.length) break;
    start = Math.max(0, end - overlapSize);
  }
  return chunks;
}

async function ingestTranscriptText(text, metadata, idPrefix) {
  const chunks = splitIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP);
  if (!chunks.length) return 0;

  const documents = chunks.map((chunk, index) => ({
    id: `${idPrefix}-${index + 1}`,
    text: chunk,
    metadata: {
      ...metadata,
      chunk: index + 1,
      chunkCount: chunks.length
    }
  }));

  const added = await vectorStore.addDocuments(documents, embedText);
  return added.length;
}

async function ingestTranscriptFile(filePath, sessionId) {
  if (ingestedFiles[filePath]) return 0;

  let text = '';
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.json') {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        text = parsed.map((item) => String(item || '')).join('\n');
      } else if (parsed && typeof parsed.text === 'string') {
        text = parsed.text;
      } else if (parsed && Array.isArray(parsed.lines)) {
        text = parsed.lines.map((item) => String(item || '')).join('\n');
      } else {
        text = JSON.stringify(parsed, null, 2);
      }
    } else {
      text = fs.readFileSync(filePath, 'utf8');
    }
  } catch (error) {
    console.warn('[transcript] Failed to read', filePath, error.message);
    return 0;
  }

  const filename = path.basename(filePath);
  const meta = {
    source: 'transcript',
    sessionId: sessionId || 'unknown',
    filename,
    ingestedAt: new Date().toISOString()
  };

  const added = await ingestTranscriptText(text, meta, `transcript-${sessionId || 'unknown'}-${Date.now()}`);
  if (added > 0) {
    ingestedFiles[filePath] = new Date().toISOString();
    persistIngested();
  }
  return added;
}

async function scanTranscriptDir() {
  let files = [];
  try {
    files = fs.readdirSync(TRANSCRIPTS_DIR)
      .filter((name) => name.endsWith('.txt') || name.endsWith('.json'))
      .map((name) => path.join(TRANSCRIPTS_DIR, name));
  } catch (error) {
    return;
  }

  let ingestedCount = 0;
  for (const filePath of files) {
    if (!ingestedFiles[filePath]) {
      ingestedCount += await ingestTranscriptFile(filePath);
    }
  }
  lastTranscriptScan = new Date().toISOString();
  lastTranscriptScanCount = ingestedCount;
}

async function finalizeSessionTranscript(sessionId) {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer || !buffer.lines.length) {
    sessionBuffers.delete(sessionId);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `session-${sessionId}-${timestamp}.txt`;
  const filePath = path.join(TRANSCRIPTS_DIR, filename);
  const payload = buffer.lines.join('\n');

  try {
    fs.writeFileSync(filePath, payload, 'utf8');
  } catch (error) {
    console.warn('[transcript] Failed to write transcript', error.message);
    sessionBuffers.delete(sessionId);
    return;
  }

  await ingestTranscriptFile(filePath, sessionId);
  sessionBuffers.delete(sessionId);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/assistants/new', (req, res) => {
  res.type('html').send(createAssistantHtml);
});

app.get('/admin/vectors', (req, res) => {
  res.type('html').send(vectorAdminHtml);
});

app.get('/admin/transcripts', (req, res) => {
  res.type('html').send(transcriptAdminHtml);
});

app.get('/api/topics', (req, res) => {
  const search = String(req.query.search || '').toLowerCase();
  const page = Number(req.query.page || 0);
  const pageSize = Number(req.query.pageSize || 10);

  let filtered = assistants;
  if (search) {
    filtered = assistants.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const description = String(item.description || '').toLowerCase();
      return name.includes(search) || description.includes(search);
    });
  }

  const total = filtered.length;
  const start = page * pageSize;
  const items = filtered.slice(start, start + pageSize);

  res.json({
    items,
    data: items,
    topics: items,
    page,
    pageSize,
    total
  });
});

app.get('/api/topics/:id', (req, res) => {
  const topic = assistants.find((item) => item.id === req.params.id);
  if (!topic) {
    res.status(404).json({ error: 'Assistant not found' });
    return;
  }
  res.json(topic);
});

app.post('/api/topics', (req, res) => {
  const { name, description, systemPrompt, resumeContent, technologies } = req.body || {};
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const assistant = {
    id: `assistant-${uuidv4()}`,
    name,
    description: description || '',
    systemPrompt: systemPrompt || 'You are Meeting Assistant, a concise and helpful meeting copilot.',
    resumeContent: resumeContent || '',
    technologies: technologies || '',
    createdAt: new Date().toISOString()
  };
  assistants.push(assistant);
  saveJson(assistantsPath, assistants);
  res.json(assistant);
});

app.put('/api/topics/:id', (req, res) => {
  const { id } = req.params;
  const index = assistants.findIndex(a => a.id === id);
  if (index < 0) {
    return res.status(404).json({ error: 'Assistant not found' });
  }

  const current = assistants[index];
  const updated = {
    ...current,
    ...req.body,
    id: current.id, // Immutable
    updatedAt: new Date().toISOString()
  };

  assistants[index] = updated;
  saveJson(assistantsPath, assistants);
  res.json(updated);
});

app.post('/api/sessions', (req, res) => {
  const id = uuidv4();
  res.json({ _id: id, id, sessionId: id, status: 'created' });
});

app.get('/api/services/get-ask', (req, res) => {
  res.json({
    token: 'local-speech-token',
    region: 'local',
    ttl: 600
  });
});

app.post('/api/document/create-upload-url', (req, res) => {
  const { originalFilename, name, type, size } = req.body || {};
  const docId = uuidv4();
  const extension = originalFilename ? path.extname(originalFilename) : '';
  const fileKey = `${docId}${extension}`;
  const fileUrl = `${BASE_URL}/uploads/${fileKey}`;

  uploadsMeta[docId] = {
    id: docId,
    fileKey,
    fileUrl,
    name: name || originalFilename || 'upload',
    originalFilename: originalFilename || '',
    type: type || 'application/octet-stream',
    size: size || 0,
    createdAt: new Date().toISOString()
  };
  persistUploads();

  res.json({
    presignedUrl: fileUrl,
    fileKey,
    document: {
      _id: docId,
      id: docId,
      fileKey,
      fileUrl
    }
  });
});

app.put('/uploads/:fileKey', express.raw({ type: '*/*', limit: '25mb' }), (req, res) => {
  const { fileKey } = req.params;
  if (!req.body || !fileKey) {
    res.status(400).send('Missing upload payload');
    return;
  }
  const filePath = path.join(UPLOAD_DIR, fileKey);
  fs.writeFileSync(filePath, req.body);
  res.status(200).end();
});

app.get('/api/document/:id', (req, res) => {
  const doc = uploadsMeta[req.params.id];
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({
    id: doc.id,
    fileKey: doc.fileKey,
    fileUrl: doc.fileUrl,
    presignedUrl: doc.fileUrl
  });
});

app.get('/api/admin/vectors', async (req, res) => {
  try {
    const offset = Number(req.query.offset || 0);
    const limit = Number(req.query.limit || 25);
    const payload = await vectorStore.listVectors({ offset, limit });
    res.json({
      items: payload.items || [],
      total: payload.total ?? null,
      offset,
      limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/vectors/:id', async (req, res) => {
  try {
    const ok = await vectorStore.deleteVector(req.params.id);
    res.json({ ok });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/transcripts', (req, res) => {
  try {
    const entries = fs.readdirSync(TRANSCRIPTS_DIR)
      .filter((name) => name.endsWith('.txt') || name.endsWith('.json'))
      .map((name) => {
        const filePath = path.join(TRANSCRIPTS_DIR, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          ingested: Boolean(ingestedFiles[filePath])
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));

    res.json({
      files: entries,
      lastScan: lastTranscriptScan,
      lastScanCount: lastTranscriptScanCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/transcripts/reingest', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const safeName = path.basename(name);
    const filePath = path.join(TRANSCRIPTS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    delete ingestedFiles[filePath];
    persistIngested();
    const added = await ingestTranscriptFile(filePath);
    res.json({ ok: true, added });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/transcripts/scan', async (req, res) => {
  try {
    await scanTranscriptDir();
    res.json({ ok: true, lastScan: lastTranscriptScan, lastScanCount: lastTranscriptScanCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ingest', async (req, res) => {
  try {
    const documents = req.body?.documents || req.body?.chunks || [];
    const added = await vectorStore.addDocuments(documents, embedText);
    res.json({ added: added.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search', async (req, res) => {
  try {
    const query = req.body?.query || '';
    const topK = Number(req.body?.topK || TOP_K);
    const candidates = await vectorStore.search(query, embedText, topK);
    const ranked = await rerankCandidates(candidates, query, RERANK_WEIGHT);
    res.json({ results: ranked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

async function handleQuestion(socket, data) {
  console.log(`[server] Handling question from socket ${socket.id}:`, data?.content || data?.question || '(no text)');
  const requestId = data?.requestId ?? null;
  const question = data?.content || data?.message || data?.question || '';
  const assistantId = data?.assistantId || data?.huddleId || data?.topicId || 'assistant-general';

  // Extract attachments (images)
  const attachments = data?.attachments || [];
  const images = [];

  if (attachments.length > 0) {
    console.log(`[server] Processing ${attachments.length} attachments for question`);
    for (const att of attachments) {
      // att: { fileUrl, type, ... }
      // fileUrl might be http://localhost:3000/uploads/uuid.png
      // We need the local path
      try {
        if (att.fileUrl && att.fileUrl.includes('/uploads/')) {
          const filename = att.fileUrl.split('/uploads/').pop();
          const filePath = path.join(UPLOAD_DIR, filename);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase().replace('.', '');
            const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/jpeg';

            const fileBuffer = fs.readFileSync(filePath);
            const base64Data = fileBuffer.toString('base64');

            images.push({
              mimeType: mimeType,
              data: base64Data
            });
            console.log(`[server] Added image attachment: ${filename} (${mimeType})`);
          } else {
            console.warn(`[server] Attachment file not found: ${filePath}`);
          }
        }
      } catch (attError) {
        console.error('[server] Failed to process attachment:', attError.message);
      }
    }
  }

  if (!question.trim() && images.length === 0) {
    socket.emit('response_end', { requestId });
    return;
  }

  socket.emit('response_start', { requestId });

  try {
    const candidates = await vectorStore.search(question, embedText, TOP_K * 3);
    const ranked = await rerankCandidates(candidates, question, RERANK_WEIGHT);
    const context = ranked.slice(0, TOP_K).map((item, idx) => `[${idx + 1}] ${item.text}`).join('\n');
    const assistant = assistants.find((item) => item.id === assistantId) || assistants[0];

    // Recent transcript context
    const sessionId = data?.sessionId || socket.handshake?.query?.sessionId;
    const buffer = sessionBuffers.get(sessionId);
    const recentTranscript = buffer ? buffer.lines.slice(-AUTO_DETECT_CONTEXT_LINES).join('\n') : '';

    // Code-aware instructions when images are present
    let codeInstructions = '';
    if (images.length > 0) {
      const technologies = assistant?.technologies || '';
      codeInstructions = [
        '[CODE ANALYSIS INSTRUCTIONS]',
        'Screenshots have been provided. Analyze any visible code, errors, or UI elements.',
        technologies ? `Expected technologies: ${technologies}` : '',
        '1. Identify the programming language and framework visible in the screenshot',
        '2. Quote the specific code or error message you see',
        '3. Provide corrected code in markdown code blocks with the appropriate language tag',
        '4. If you see a terminal/console, analyze the error output',
        '5. Be specific about line numbers or code locations when visible',
        '[END CODE INSTRUCTIONS]'
      ].filter(Boolean).join('\n');
    }

    // Auto-detect note
    const autoDetectNote = data?._autoDetected
      ? '[AUTO-DETECTED] This question was automatically detected from the conversation. Focus on the most recent question or request.\n'
      : '';

    const promptParts = [
      assistant?.systemPrompt || 'You are Meeting Assistant, a concise and helpful meeting copilot.',
      autoDetectNote,
      assistant?.resumeContent ? `[RESUME CONTEXT START]\n${assistant.resumeContent}\n[RESUME CONTEXT END]` : '',
      recentTranscript ? `[RECENT CONVERSATION]\n${recentTranscript}` : '',
      codeInstructions,
      context ? `[RAG CONTEXT]\n${context}` : '',
      `User: ${question}`,
      'Assistant:'
    ].filter(Boolean);

    const prompt = promptParts.join('\n\n');

    await streamCompletion(prompt, images, (token) => {
      socket.emit('answer', { requestId, content: token });
    });
  } catch (error) {
    socket.emit('answer', { requestId, content: `Error: ${error.message}` });
  }

  socket.emit('response_end', { requestId });
}

io.on('connection', (socket) => {
  const sessionId = socket.handshake.query?.sessionId || uuidv4();
  console.log(`[server] New connection: ${socket.id} (Session: ${sessionId})`);
  sessionBuffers.set(sessionId, { lines: [], startedAt: new Date().toISOString() });
  autoDetectState.set(sessionId, {
    lastTriggeredAt: null,
    enabled: process.env.AUTO_DETECT_ENABLED !== 'false',
    assistantId: socket.handshake.query?.assistantId || 'assistant-general'
  });
  socket.emit('session-update', { sessionId, status: 'connected' });

  socket.on('question', (data) => handleQuestion(socket, { ...data, sessionId }));
  socket.on('message', (data) => handleQuestion(socket, { ...data, sessionId }));

  socket.on('recognized_item', (data) => {
    console.log(`[server] recognized_item from ${socket.id}:`, data?.content || data?.text);
    const text = extractTranscriptText(data);
    if (text) {
      const buffer = sessionBuffers.get(sessionId);
      if (buffer) buffer.lines.push(text);

      detectAndAutoAnswer(socket, sessionId, text).catch(err => {
        console.warn('[auto-detect] Error:', err.message);
      });
    }
    socket.emit('transcript', { ...data, sessionId });
  });

  socket.on('recognizing_item', (data) => {
    socket.emit('transcript', { ...data, sessionId });
  });

  socket.on('client_log', (data) => {
    console.log(`[client-log][${socket.id}]`, data);
  });

  socket.on('client_error', (data) => {
    console.error(`[client-error][${socket.id}]`, data);
  });

  socket.on('toggle-auto-detect', (data) => {
    const state = autoDetectState.get(sessionId) || {};
    state.enabled = data?.enabled ?? !state.enabled;
    if (data?.assistantId) state.assistantId = data.assistantId;
    autoDetectState.set(sessionId, state);
    socket.emit('auto-detect-status', { enabled: state.enabled });
    console.log(`[auto-detect] ${state.enabled ? 'Enabled' : 'Disabled'} for session ${sessionId}`);
  });

  socket.on('disconnect', () => {
    autoDetectState.delete(sessionId);
    void finalizeSessionTranscript(sessionId);
  });

  socket.on('start_deepgram_session', async () => {
    try {
      console.log(`[server] Starting Deepgram for session ${sessionId}`);
      const dg = await speechService.startWithProvider('deepgram');

      dg.on('transcript', (data) => {
        socket.emit('transcript', { ...data, sessionId, provider: 'Deepgram' });
        if (data.isFinal) {
          const text = extractTranscriptText(data);
          if (text) {
            const buffer = sessionBuffers.get(sessionId);
            if (buffer) buffer.lines.push(text);
          }
        }
      });
      socket.emit('deepgram_ready');
    } catch (err) {
      console.error('[server] Deepgram failed:', err.message);
      socket.emit('error', { message: 'Deepgram start failed' });
    }
  });

  socket.on('audio_data', (data) => {
    if (speechService.activeProvider?.name === 'Deepgram') {
      speechService.activeProvider.sendAudio(data);
    }
  });

  socket.on('stop_session', async () => {
    await speechService.stop();
  });
});

setInterval(() => {
  scanTranscriptDir();
}, TRANSCRIPT_SCAN_INTERVAL).unref();

server.listen(PORT, () => {
  console.log(`[backend] Listening on ${BASE_URL}`);
});

// Export testable functions for integration tests
if (process.env.NODE_ENV === 'test') {
  module.exports.__test__ = {
    extractTranscriptText,
    splitIntoChunks,
    ingestTranscriptText,
    ingestTranscriptFile,
    finalizeSessionTranscript,
    isQuestion,
    detectAndAutoAnswer,
    sessionBuffers,
    autoDetectState,
    ingestedFiles
  };
}
