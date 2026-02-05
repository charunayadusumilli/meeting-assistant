# Meeting Assistant Local Backend

Local, zero-cost backend for the Meeting Assistant app. Provides REST APIs, Socket.IO streaming, lightweight vector search, transcript ingestion, and an optional Ollama-based LLM runtime.

## Quick Start
1. Install Node.js 18+
2. (Optional) Install Ollama and pull models:
   - `ollama pull llama3.2:3b`
   - `ollama pull nomic-embed-text`
3. Install deps: `npm install`
4. Run: `npm run dev`

The server listens on port 3000 by default.

## Transcript Ingestion
The backend collects `recognized_item` events per Socket.IO session, writes a transcript file on disconnect, and ingests it into the vector store automatically. It also scans `data/transcripts` every interval for `.txt` or `.json` files and ingests anything new.

Controls:
- `CHUNK_SIZE` and `CHUNK_OVERLAP` control transcript chunking.
- `TRANSCRIPT_SCAN_INTERVAL` controls how often the folder is scanned.

Drop-in ingestion: add `.txt` or `.json` files to `backend/data/transcripts` to ingest without a live session.

## Vector Admin UI
Open `http://localhost:3000/admin/vectors` to view and delete vectors.

## Test Ingest
```
curl -X POST http://localhost:3000/api/ingest   -H "Content-Type: application/json"   -d '{"documents":[{"text":"Project Alpha kickoff is Friday at 10am","metadata":{"source":"notes"}}]}'
```

## API Overview
- `GET /api/topics`
- `GET /api/topics/:id`
- `POST /api/topics`
- `POST /api/sessions`
- `GET /api/services/get-ask`
- `POST /api/document/create-upload-url`
- `GET /api/document/:id`
- `PUT /uploads/:fileKey`
- `POST /api/ingest`
- `POST /api/search`
- `GET /api/admin/vectors`
- `DELETE /api/admin/vectors/:id`

## Socket.IO Events
Client -> Server: `question`, `message`, `recognized_item`, `recognizing_item`
Server -> Client: `response_start`, `answer`, `response_end`, `transcript`, `session-update`

## Qdrant (Local Vector DB)
Run Qdrant locally (Docker):
```
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```
Then set:
```
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=meeting_assistant
```
If `QDRANT_URL` is not set, the backend uses the local JSON vector store.

## Local Reranker (BGE)
You can run a local BGE reranker and point the backend to it.

1. Create a venv and install:
```
python -m venv .venv
.venv\Scripts\activate
pip install -r reranker/requirements.txt
```

2. Run the reranker:
```
python reranker/server.py
```

3. Set in `.env`:
```
RERANKER_URL=http://localhost:8001
RERANKER_MODEL=BAAI/bge-reranker-base
```

If `RERANKER_URL` is not set, the backend falls back to lexical reranking.
