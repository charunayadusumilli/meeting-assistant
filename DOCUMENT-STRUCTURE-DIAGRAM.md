# Meeting Assistant - Document Structure Diagram

> Auto-generated from README.md, ARCHITECTURE.md, and backend/README.md

## Documents Found

| File | Description |
|------|-------------|
| `/README.md` | Main project documentation |
| `/ARCHITECTURE.md` | Pulse Architecture specification |
| `/backend/README.md` | Backend-specific documentation |

---

## Project Structure Diagram

```
meeting-assistant/
│
├── README.md
├── ARCHITECTURE.md
├── .env / .env.example
│
├─── backend/                          [Node.js Server]
│    ├── README.md
│    ├── package.json (LFS)
│    ├── .env
│    │
│    ├── src/
│    │   ├── server.js                 <- Express + Socket.IO entry point
│    │   ├── llm.js                    <- Gemini / Ollama abstraction
│    │   ├── speech-service.js         <- STT (Web Speech + Deepgram)
│    │   ├── session-service.js        <- Session lifecycle
│    │   ├── vector-store.js           <- Local JSON vector search
│    │   ├── qdrant-store.js           <- Qdrant vector DB integration
│    │   ├── rerank.js                 <- BGE / lexical reranking
│    │   └── admin-html.js             <- Admin UI generator
│    │
│    ├── data/
│    │   ├── transcripts/              <- Auto-ingested transcripts
│    │   └── assistants.json (LFS)     <- Persona definitions
│    │
│    └── reranker/                     [Python Microservice]
│        ├── server.py                 <- FastAPI reranker
│        └── requirements.txt
│
└─── resources/app/                    [Electron Frontend]
     ├── package.json (LFS)
     ├── config.json (LFS)
     ├── index.js                      <- Electron main process
     ├── update-manager.js
     │
     ├── services/
     │   ├── speech-manager.js         <- Speech orchestration
     │   ├── web-speech-provider.js    <- Browser Speech API
     │   ├── session-service.js        <- Session management
     │   ├── auth-service.js           <- Auth token handling
     │   ├── api-service.js            <- HTTP client
     │   └── local-assistant-store.js  <- Local persistence
     │
     ├── windows/
     │   ├── main-window.js            <- Primary app window
     │   ├── session-window.js         <- Floating overlay
     │   ├── settings-window.js        <- Config UI
     │   ├── assistant-window.js       <- Assistant mgmt
     │   └── window-manager.js
     │
     ├── ipc/
     │   ├── auth-handlers.js
     │   ├── session-handlers.js
     │   ├── settings-handlers.js
     │   ├── general-handlers.js
     │   └── api-handlers.js
     │
     ├── lifecycle/
     │   ├── app-events.js
     │   ├── system-events.js
     │   └── protocol-handler.js
     │
     ├── shortcuts/
     │   └── global-shortcuts.js
     │
     ├── timers/
     │   └── token-validation-timer.js
     │
     ├── utils/
     │   ├── stealth-mode.js
     │   ├── navigation-guards.js
     │   └── error-parser.js
     │
     └── public/                       <- Bundled frontend assets
```

---

## Architecture Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUDIO LAYER                                  │
│                                                                     │
│   Microphone                                                        │
│       │                                                             │
│       v                                                             │
│   ┌──────────────────┐    fallback    ┌──────────────────┐         │
│   │  Web Speech API  │──────────────>│  Deepgram Nova-2  │         │
│   │  (free, primary) │               │  (paid, high-fi)  │         │
│   └────────┬─────────┘               └────────┬──────────┘         │
│            │ recognized_item / recognizing_item│                    │
│            └──────────────┬───────────────────┘                    │
└───────────────────────────┼─────────────────────────────────────────┘
                            │ Socket.IO
                            v
┌─────────────────────────────────────────────────────────────────────┐
│                     INTELLIGENCE LAYER (Backend)                    │
│                                                                     │
│   ┌──────────────┐     ┌──────────────────┐    ┌────────────────┐  │
│   │  server.js   │────>│   RAG Pipeline   │───>│  vector-store  │  │
│   │  (Express +  │     │                  │    │  (JSON/Qdrant) │  │
│   │  Socket.IO)  │     │  Chunk > Embed   │    └────────────────┘  │
│   └──────┬───────┘     │  > Search > Rank │                        │
│          │              └──────────────────┘    ┌────────────────┐  │
│          │                                     │  reranker/     │  │
│          v                                     │  (BGE model)   │  │
│   ┌──────────────┐                             └────────────────┘  │
│   │   llm.js     │                                                  │
│   │              │                                                  │
│   │  ┌────────┐  │    ┌────────┐                                   │
│   │  │Gemini  │  │    │Ollama  │                                   │
│   │  │2.0Flash│  │    │(local) │                                   │
│   │  └────┬───┘  │    └────┬───┘                                   │
│   │       │ SSE  │         │                                        │
│   └───────┼──────┘─────────┘                                       │
│           │ Token stream                                            │
└───────────┼─────────────────────────────────────────────────────────┘
            │ Socket.IO (answer events)
            v
┌─────────────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER (Electron)                      │
│                                                                     │
│   ┌────────────────────────────────────────────────────────┐       │
│   │                  Window Manager                         │       │
│   │                                                        │       │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │       │
│   │  │ Main Window │  │Session Window│  │Settings Window│  │       │
│   │  │             │  │(Floating     │  │              │  │       │
│   │  │             │  │ Overlay)     │  │              │  │       │
│   │  └─────────────┘  └──────────────┘  └──────────────┘  │       │
│   └────────────────────────────────────────────────────────┘       │
│                                                                     │
│   ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐    │
│   │   IPC    │  │  Services  │  │ Shortcuts│  │  Lifecycle   │    │
│   │ Handlers │  │ (auth,api, │  │ (global  │  │  (app/system │    │
│   │          │  │  session)  │  │  hotkeys)│  │   events)    │    │
│   └──────────┘  └────────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Socket.IO Event Flow

```
  Electron Client                          Node.js Server
  ──────────────                          ──────────────
       │                                        │
       │──── recognized_item ──────────────────>│
       │──── recognizing_item ─────────────────>│
       │──── question ─────────────────────────>│
       │──── message ──────────────────────────>│
       │                                        │
       │<──── response_start ──────────────────│
       │<──── answer (token stream) ───────────│
       │<──── response_end ────────────────────│
       │<──── transcript ──────────────────────│
       │<──── session-update ──────────────────│
       │                                        │
```

---

## Technology Stack

```
┌───────────────┬──────────────────────────────────────┐
│ Layer         │ Technology                           │
├───────────────┼──────────────────────────────────────┤
│ Desktop App   │ Electron + Vanilla JS                │
│ Backend       │ Node.js + Express + Socket.IO        │
│ LLM           │ Gemini 2.0 Flash (primary) / Ollama  │
│ STT           │ Web Speech API / Deepgram Nova-2     │
│ Vector Store  │ Local JSON / Qdrant                  │
│ Reranker      │ FastAPI + BAAI/bge-reranker-base     │
│ RAG           │ Local chunking + embedding pipeline  │
└───────────────┴──────────────────────────────────────┘
```

---

## Key Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/topics` | GET/POST | Topic management |
| `/api/sessions` | POST | Create session |
| `/api/services/get-ask` | GET | Query handler |
| `/api/document/create-upload-url` | POST | Document upload initiation |
| `/api/document/:id` | GET | Retrieve document |
| `/api/ingest` | POST | Ingest documents to vector store |
| `/api/search` | POST | Vector search |
| `/api/admin/vectors` | GET | View all vectors |
| `/api/admin/vectors/:id` | DELETE | Delete vector |
| `/uploads/:fileKey` | PUT | Upload files |
