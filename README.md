# Meeting Assistant

A local-first desktop application for real-time meeting assistance. Provides live transcription, LLM-powered Q&A, and persona-based responses through a lightweight floating overlay.

## Overview

Meeting Assistant is a specialized Technical Interview Copilot designed to provide real-time, context-aware coaching during live meetings. Unlike generic meeting bots, it is aware of:

1. **Your Resume** - Reads your actual experience (PDF/Docx) to answer behavioral questions authentically.
2. **Your Tech Stack** - Tailors technical answers to your preferred languages and frameworks.
3. **Real-Time Context** - Listens live and identifies the exact question being asked, providing instant answers.

### Key Features

- **Assistant Personas** - Create multiple assistants for different scenarios (e.g., "Senior Frontend Role", "DevOps Architect") with custom technologies and uploaded resumes.
- **Floating Overlay** - Sits on top of Zoom/Teams/Meet without blocking your view.
- **Instant Answers** - Q&A format with real-time token streaming.
- **Hot-swap** - Edit assistants or settings mid-meeting.

## Architecture

### Core Principles

1. **Real-Time by Default** - All data pipelines (Audio, Text, AI Tokens) are streamed.
2. **Hybrid Intelligence** - Browser-native STT (free) prioritized over cloud STT (paid). Cloud LLM with local fallback capability.
3. **Cost Optimization** - Default operation path costs $0.

### Data Flow

```
Microphone
    |
    v
+------------------+    fallback    +------------------+
| Web Speech API   |-------------->| Cloud STT         |
| (free, primary)  |               | (paid, high-fi)   |
+--------+---------+               +--------+----------+
         | recognized_item / recognizing_item|
         +---------------+------------------+
                         | Socket.IO
                         v
+-------------------------------------------------------------+
|                  INTELLIGENCE LAYER (Backend)                |
|                                                             |
|  server.js --> RAG Pipeline --> vector-store (JSON/Qdrant)  |
|  (Express +    Chunk > Embed    reranker (BGE model)        |
|  Socket.IO)    > Search > Rank                              |
|       |                                                     |
|       v                                                     |
|    llm.js                                                   |
|    Cloud LLM (primary) | Ollama (local)                     |
|       | SSE token stream                                    |
+-------+-----------------------------------------------------+
        | Socket.IO (answer events)
        v
+-------------------------------------------------------------+
|                APPLICATION LAYER (Electron)                  |
|                                                             |
|  Window Manager                                             |
|  [Main Window] [Session Window (Overlay)] [Settings Window] |
|                                                             |
|  [IPC Handlers] [Services] [Shortcuts] [Lifecycle]          |
+-------------------------------------------------------------+
```

### Runtime Flow

1. Electron UI sends events to the main process via IPC.
2. Main process connects to the backend via Socket.IO for live sessions.
3. Backend uses local RAG to retrieve relevant chunks from the vector store.
4. A reranker scores candidates and the LLM streams answers back.
5. UI renders tokens in real-time.

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop App | Electron + Vanilla JS |
| Backend | Node.js + Express + Socket.IO |
| LLM | Cloud LLM (primary) / Ollama (local) |
| STT | Web Speech API / Cloud STT provider |
| Vector Store | Local JSON / Qdrant |
| Reranker | FastAPI + BAAI/bge-reranker-base |
| RAG | Local chunking + embedding pipeline |

## Getting Started

### Prerequisites

- Node.js 18+
- LLM API Key (e.g., Google AI Studio)
- Cloud STT API Key (optional, for enhanced audio)
- (Optional) Ollama for local LLM: `ollama pull llama3.2:3b` and `ollama pull nomic-embed-text`

### Installation

```bash
# Backend
cd backend
npm install

# Frontend (Electron app)
cd ../resources/app
npm install
```

### Configuration

Create a `.env` file in `backend/`:

```env
# LLM Provider (gemini, ollama, openai)
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
GEMINI_API_KEY=your_key_here

# Speech-to-text (optional cloud fallback)
DEEPGRAM_API_KEY=your_key_here

# Server
PORT=3000

# Ollama (if using local LLM)
LLM_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text

# OpenAI-compatible provider (if using openai provider)
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# Vector store backend (json or sqlite)
VECTOR_BACKEND=json

# Qdrant (optional, for production vector DB)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=meeting_assistant

# Reranker (optional, for improved search quality)
RERANKER_URL=http://localhost:8001
RERANKER_MODEL=BAAI/bge-reranker-base

# Transcript settings
CHUNK_SIZE=500
CHUNK_OVERLAP=50
TRANSCRIPT_SCAN_INTERVAL=30000
```

### Run

```bash
# Start Backend
cd backend
npm run dev
```

The Electron app is launched via the provided `Meeting Assistant.exe` or development scripts mapping to `resources/app`.

## Developer Guide

### Project Structure

```
meeting-assistant/
|
+-- README.md
|
+--- backend/                          [Node.js Server]
|    +-- package.json
|    +-- .env
|    |
|    +-- src/
|    |   +-- server.js                 <- Express + Socket.IO entry point
|    |   +-- llm.js                    <- LLM provider abstraction
|    |   +-- speech-service.js         <- STT (Web Speech + cloud provider)
|    |   +-- vector-store.js           <- Local JSON vector search
|    |   +-- qdrant-store.js           <- Qdrant vector DB integration
|    |   +-- rerank.js                 <- BGE / lexical reranking
|    |   +-- admin-html.js             <- Admin UI generator
|    |
|    +-- data/
|    |   +-- transcripts/              <- Auto-ingested transcripts
|    |   +-- assistants.json           <- Persona definitions
|    |
|    +-- reranker/                     [Python Microservice]
|        +-- server.py                 <- FastAPI reranker
|        +-- requirements.txt
|
+--- resources/app/                    [Electron Frontend]
     +-- package.json
     +-- config.json
     +-- index.js                      <- Electron main process
     |
     +-- services/
     |   +-- speech-manager.js         <- Speech orchestration
     |   +-- web-speech-provider.js    <- Browser Speech API
     |   +-- session-service.js        <- Session management
     |   +-- auth-service.js           <- Auth token handling
     |   +-- api-service.js            <- HTTP client
     |   +-- local-assistant-store.js  <- Local persistence
     |
     +-- windows/
     |   +-- main-window.js            <- Primary app window
     |   +-- session-window.js         <- Floating overlay
     |   +-- settings-window.js        <- Config UI
     |   +-- assistant-window.js       <- Assistant management
     |   +-- window-manager.js
     |
     +-- ipc/
     |   +-- auth-handlers.js
     |   +-- session-handlers.js
     |   +-- settings-handlers.js
     |   +-- general-handlers.js
     |   +-- api-handlers.js
     |
     +-- lifecycle/
     |   +-- app-events.js
     |   +-- system-events.js
     |   +-- protocol-handler.js
     |
     +-- shortcuts/
     |   +-- global-shortcuts.js
     |
     +-- timers/
     |   +-- token-validation-timer.js
     |
     +-- utils/
     |   +-- stealth-mode.js
     |   +-- navigation-guards.js
     |   +-- error-parser.js
     |
     +-- public/                       <- Bundled frontend assets
```

### Key Backend Components

- **`server.js`** - Entry point. Manages Socket.IO connections, REST API, RAG pipeline, and transcript ingestion.
- **`llm.js`** - Multi-provider LLM adapter with SSE streaming support.
- **`speech-service.js`** - STT abstraction layer with automatic fallback.
- **`vector-store.js`** - Local JSON-based vector search with cosine similarity.
- **`rerank.js`** - Lexical and remote BGE reranking.

### Key Frontend Components

- **`speech-manager.js`** - Speech orchestration. Handles mic access, provider switching, and Socket.IO events.
- **`web-speech-provider.js`** - Wrapper for browser-native Web Speech API.
- **`session-service.js`** - Main process to backend bridge via Socket.IO.

### Debug Tips

- Backend health check: `http://localhost:3000/health`
- Vector admin UI: `http://localhost:3000/admin/vectors`
- Transcript admin UI: `http://localhost:3000/admin/transcripts`

## API Reference

### REST Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Health check |
| `/api/topics` | GET | List topics (supports search/pagination) |
| `/api/topics/:id` | GET | Get topic by ID |
| `/api/topics` | POST | Create topic |
| `/api/sessions` | POST | Create session |
| `/api/services/get-ask` | GET | Query handler |
| `/api/document/create-upload-url` | POST | Document upload initiation |
| `/api/document/:id` | GET | Retrieve document |
| `/uploads/:fileKey` | PUT | Upload files |
| `/api/ingest` | POST | Ingest documents to vector store |
| `/api/search` | POST | Vector search |
| `/api/admin/vectors` | GET | View all vectors |
| `/api/admin/vectors/:id` | DELETE | Delete vector |
| `/api/admin/transcripts` | GET | View transcripts |
| `/api/admin/transcripts/reingest` | POST | Re-ingest transcripts |
| `/api/admin/transcripts/scan` | POST | Trigger transcript scan |

### Socket.IO Events

**Client -> Server:**

| Event | Description |
|---|---|
| `recognized_item` | Final transcript segment |
| `recognizing_item` | Interim transcript segment |
| `question` | User question for LLM |
| `message` | General message |

**Server -> Client:**

| Event | Description |
|---|---|
| `response_start` | LLM response beginning |
| `answer` | Token stream chunk |
| `response_end` | LLM response complete |
| `transcript` | Transcript data |
| `session-update` | Session state change |

### Transcript Ingestion

The backend collects `recognized_item` events per Socket.IO session, writes a transcript file on disconnect, and ingests it into the vector store automatically. It also scans `data/transcripts/` at a configurable interval for `.txt` or `.json` files and ingests anything new.

Drop-in ingestion: add `.txt` or `.json` files to `backend/data/transcripts/` to ingest without a live session.

```bash
# Test ingest
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"documents":[{"text":"Project Alpha kickoff is Friday at 10am","metadata":{"source":"notes"}}]}'
```

## Testing

### Current Coverage

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `admin-html.js` | 100% | 100% | 100% | 100% |
| `vector-store.js` | 89% | 63% | 94% | 89% |
| `rerank.js` | 58% | 53% | 64% | 59% |
| `speech-service.js` | 47% | 46% | 63% | 47% |
| `llm.js` | 32% | 27% | 60% | 31% |
| `qdrant-store.js` | 23% | 15% | 33% | 24% |
| **All backend** | **46%** | **40%** | **61%** | **47%** |

### Running Tests

```bash
cd backend
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

### Priority Test Targets

1. `server.js` - Pure functions (`extractTranscriptText`, `splitIntoChunks`) and supertest-based API route tests.
2. `llm.js` - Mock `fetch` to test SSE streaming parser and provider switching.
3. `qdrant-store.js` - Mock `fetch` for HTTP operations.

## Optional Services

### Qdrant (Vector DB)

```bash
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

Set `QDRANT_URL=http://localhost:6333` in `.env`. If not set, the backend uses the local JSON vector store.

### Local Reranker (BGE)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r reranker/requirements.txt
python reranker/server.py
```

Set `RERANKER_URL=http://localhost:8001` in `.env`. If not set, the backend falls back to lexical reranking.

### Ollama (Local LLM)

```bash
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

Set `LLM_PROVIDER=ollama` in `.env`.

## Privacy

- **Local-First** - Embeddings and vector indices are stored locally in `backend/storage/`.
- **Ephemeral Audio** - Audio is streamed for transcription and immediately discarded; never stored unless recording is explicitly enabled.
