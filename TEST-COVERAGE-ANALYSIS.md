# Test Coverage Analysis

## Current State

**95 tests across 7 suites — all passing.**

| File | Statements | Branches | Functions | Lines | Notes |
|---|---|---|---|---|---|
| `admin-html.js` | 100% | 100% | 100% | 100% | Fully covered |
| `vector-store.js` | 89.47% | 63.26% | 94.11% | 88.73% | Well covered |
| `rerank.js` | 57.5% | 52.77% | 63.63% | 58.97% | Pure logic covered, remote call missing |
| `speech-service.js` | 46.66% | 46.34% | 62.96% | 46.66% | Deepgram WebSocket untested |
| `session-service.js` | 43.58% | 55.81% | 50% | 44.73% | connectToBackend untested |
| `llm.js` | 31.74% | 27.27% | 60% | 31.35% | All API/streaming code untested |
| `qdrant-store.js` | 22.66% | 15.38% | 33.33% | 23.61% | Only guards tested, HTTP ops untested |
| **server.js** | **0%** | **0%** | **0%** | **0%** | **Not tested at all** |
| **All backend** | **46.4%** | **39.87%** | **60.78%** | **46.65%** | |
| **Frontend (31 files)** | **0%** | **0%** | **0%** | **0%** | **No test infrastructure** |

Overall effective coverage across the full codebase (~6,200 lines) is approximately **15-20%**.

---

## Priority 1 — Critical Gaps

### 1. `server.js` has zero test coverage (599 lines)

This is the application's core — the Express server, Socket.IO handler, and full RAG pipeline. It contains multiple pure functions and API routes that are highly testable.

**What to test:**

- **Pure helper functions** (`extractTranscriptText`, `splitIntoChunks`) — these have complex conditional logic and are easy to unit test with no mocking required.
  - `extractTranscriptText` handles 8+ data formats (lines 76-89) with zero coverage.
  - `splitIntoChunks` implements chunking with overlap (lines 91-106) — this is the foundation of the RAG ingestion pipeline and should be verified for correctness on edge cases (empty text, text shorter than chunk size, overlap larger than size, etc.).

- **REST API routes** — use `supertest` to test all 15+ endpoints without starting a real server:
  - `GET /health`
  - `GET /api/topics` with search/pagination
  - `GET /api/topics/:id` including 404 case
  - `POST /api/topics` including validation (missing name → 400)
  - `POST /api/sessions`
  - `GET /api/services/get-ask`
  - `POST /api/document/create-upload-url`
  - `PUT /uploads/:fileKey`
  - `GET /api/document/:id` including 404
  - `GET /api/admin/vectors`
  - `DELETE /api/admin/vectors/:id`
  - `GET /api/admin/transcripts`
  - `POST /api/admin/transcripts/reingest`
  - `POST /api/admin/transcripts/scan`
  - `POST /api/ingest`
  - `POST /api/search`

- **Socket.IO event handling** — use `socket.io-client` to test:
  - Connection handshake and `session-update` emission
  - `recognized_item` → transcript buffering and re-emission
  - `recognizing_item` relay
  - `question` → `response_start` / `answer` / `response_end` lifecycle
  - `disconnect` → `finalizeSessionTranscript` execution

- **`handleQuestion`** (lines 461-533) — the RAG orchestration function. Test with mocked vector store and LLM:
  - Empty question returns `response_end` immediately
  - Question with image attachments
  - Missing attachment files
  - LLM error propagation

- **`ingestTranscriptFile`** and **`ingestTranscriptText`** — transcript ingestion pipeline:
  - JSON array format, JSON object with `.text`, `.lines`, and fallback
  - Plain text files
  - Already-ingested files are skipped
  - Error handling for unreadable files

### 2. Frontend has zero test infrastructure (31 files, 4,051 lines)

The entire Electron renderer/main process code has no tests and no test framework configured. The highest-value targets:

- **`services/speech-manager.js`** (254 lines) — speech orchestration with complex state management.
- **`ipc/session-handlers.js`** (321 lines) and **`ipc/settings-handlers.js`** (382 lines) — the two largest IPC handler files, containing business logic that dispatches between windows and services.
- **`utils/error-parser.js`** (81 lines) — pure parsing logic, trivially testable.
- **`utils/navigation-guards.js`** (154 lines) — navigation/routing decision logic.
- **`services/local-assistant-store.js`** (132 lines) — CRUD operations for local assistant data.
- **`services/api-service.js`** (109 lines) — Backend HTTP client.

---

## Priority 2 — Improve Coverage on Partially-Tested Modules

### 3. `llm.js` — 31% statement coverage

**Currently tested:** `hashEmbedding` (via `embedText`), `streamCompletion` error fallback.

**Missing (mockable with `jest.fn()` on global `fetch`):**

- `geminiStreamAPI` — mock `fetch` to return an SSE stream. Verify:
  - Correct URL construction with API key
  - Image attachment serialization into `parts`
  - SSE parsing (multi-chunk, malformed JSON tolerance)
  - Token-by-token `onToken` callback invocation
  - Error response handling (non-200 status)

- `geminiAPI` — mock `fetch` for non-streaming response. Verify:
  - Response parsing (`candidates[0].content.parts[0].text`)
  - `onToken` called with full text

- `ollamaEmbed` — mock `fetch` for embeddings endpoint. Verify:
  - Fallback to `hashEmbedding` when response lacks `.embedding`
  - Error status handling

- `ollamaStream` — mock `fetch` for generate endpoint. Verify:
  - NDJSON stream parsing
  - `payload.done` terminates reading
  - `onToken` called per chunk

- `streamCompletion` — test provider switching:
  - Gemini streaming fallback to non-streaming
  - Ollama provider path
  - Unknown provider defaults to Gemini

### 4. `qdrant-store.js` — 23% statement coverage

**Currently tested:** Factory function, empty-input guards.

**Missing (mockable with `fetch` mocking):**

- `request()` helper — test HTTP method routing, error handling, 404 tolerance, 204 handling
- `ensureCollection()` — test collection existence check, creation, and metadata persistence
- `addDocuments()` with actual documents — test embedding calls, point construction, Qdrant PUT
- `search()` — test query embedding, Qdrant POST, result mapping
- `listVectors()` — test pagination with scroll API
- `deleteVector()` — test point deletion
- `clear()` — test collection deletion and metadata reset

### 5. `session-service.js` — 44% statement coverage

**Currently tested:** State management, request tracking, mock socket send/receive.

**Missing (mockable with `jest.mock('socket.io-client')`):**

- `connectToBackend()` — mock `io()` to return a mock socket. Test:
  - `connect` event → sets `backendConnection`
  - `connect_error` → rejects promise
  - `disconnect` → sets `connected = false`, emits `backend-disconnected`
  - `reconnect` → emits `backend-reconnected`
  - `answer` / `response_start` / `response_end` / `clear` → request relevance check and event re-emission
  - `transcript` → event re-emission

- `startSession()` happy path — mock `connectToBackend`, verify state transitions and `session-started` emission.
- `stopSession()` when active — verify cleanup and `session-stopped` emission.

### 6. `speech-service.js` — 47% statement coverage

**Currently tested:** Provider status, availability checks, config, basic start/stop.

**Missing (mockable with `jest.mock('ws')`):**

- `DeepgramProvider.start()` — mock `WebSocket`. Test:
  - Status transitions (IDLE → CONNECTING → ACTIVE)
  - `open` event → emits `connected`
  - `message` event → parses Deepgram response, emits `transcript` with `isFinal`/confidence
  - `error` event → sets ERROR status, emits `error`
  - `close` event → sets IDLE, emits `disconnected`

- `DeepgramProvider.sendAudio()` — test with mock WebSocket in OPEN state

- `SpeechService._attemptFallback()` — test:
  - Successful fallback to Deepgram
  - Failed fallback → `all-providers-failed` emission
  - No fallback available → `all-providers-failed`

- Provider event propagation through `SpeechService`:
  - `transcript` → `recognized` (final) vs `recognizing` (interim)
  - `error` → `provider-error` + fallback trigger

### 7. `rerank.js` — 58% statement coverage

**Currently tested:** `lexicalRerank`, `rerankCandidates` with lexical fallback.

**Missing:**

- `remoteRerank()` — mock `fetch` for the reranker endpoint. Test:
  - Successful rerank response mapping
  - Candidates not in response are preserved unchanged
  - Error response handling

- `rerankCandidates` with `RERANKER_URL` set — test remote-then-fallback path

### 8. `vector-store.js` — 89% statements (good, but branch coverage is 63%)

**Missing branches:**

- `createVectorStore` factory with `QDRANT_URL` set (lines 147-157) — verify Qdrant store creation
- `saveJson` error path (line 25) — test with invalid path
- `loadJson` edge case with file that exists but throws on read (line 31)

---

## Priority 3 — Integration and End-to-End Tests

### 9. RAG pipeline integration test

Currently there is no test that exercises the full retrieval-augmented generation flow:

```
ingest document → embed → store → query → search → rerank → prompt assembly → LLM stream → socket emit
```

An integration test should:
1. Start the Express/Socket.IO server on a random port
2. Ingest a known document via `POST /api/ingest`
3. Connect a Socket.IO client
4. Send a `question` event
5. Collect `response_start`, `answer` (tokens), `response_end` events
6. Verify the answer references the ingested document context

This can use the hash embedding (no external services needed) and a mocked `streamCompletion`.

### 10. Transcript lifecycle integration test

Test the full transcript flow:
1. Connect Socket.IO client with a `sessionId`
2. Emit multiple `recognized_item` events
3. Disconnect
4. Verify transcript file is written to `data/transcripts/`
5. Verify the transcript is auto-ingested into the vector store

### 11. WebSocket reconnection behavior

The session service has reconnection config (`reconnectionAttempts: 20`, `reconnectionDelay: 3000`). This should be tested to verify:
- Reconnection attempts are bounded
- Events after reconnection are correctly routed
- State is consistent after reconnect

---

## Recommendations

### Immediate actions (highest ROI)

1. **Add tests for `server.js` pure functions** — `extractTranscriptText` and `splitIntoChunks` can be tested today with zero mocking. These implement critical parsing/chunking logic.

2. **Add `supertest`-based API route tests** — extract the Express `app` into a testable module (separate from `server.listen()`), then write route tests for all REST endpoints. This alone would cover a large portion of the 599-line file.

3. **Mock `fetch` to test `llm.js` streaming** — the SSE parser in `geminiStreamAPI` is the most complex piece of parsing logic in the codebase and has zero coverage.

4. **Mock `socket.io-client` to test `session-service.js` connection lifecycle** — the `connectToBackend` method has important event routing logic (request relevance filtering, stale answer dropping).

### Framework and tooling

- The backend already uses Jest. No changes needed there.
- For the frontend (Electron), consider adding `@electron/test` or `electron-mocha`, or test the pure-logic modules (services, utils) with Jest by mocking Electron APIs.
- Add a `npm run test:coverage` script that enforces a minimum coverage threshold (suggest starting at 60%, raising to 80% over time).
- Consider adding coverage reporting to CI (e.g., Codecov or Coveralls).

### Coverage targets

| Timeframe | Statement Target | Focus |
|---|---|---|
| Near-term | 60% | server.js routes, pure functions, fetch mocking |
| Mid-term | 75% | Socket.IO integration, frontend services |
| Long-term | 85%+ | Full E2E, Electron window tests, edge cases |
