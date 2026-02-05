# Meeting Assistant - Pulse Architecture

## Overview
This document outlines the **Pulse Real-Time Streaming Architecture** implemented in the Meeting Assistant. The system leverages cost-effective, modern components (Gemini 2.0 Flash, Web Speech API, Deepgram).

## Core Principles
1. **Real-Time by Default**: All data pipelines (Audio, Text, AI Tokens) are streamed.
2. **Hybrid Intelligence**:
   - **STT**: Browser-native (free) prioritized over Cloud (paid).
   - **LLM**: Cloud-native (Gemini) with local fallback capability (Ollama).
3. **Cost Optimization**: Default operation path costs $0.

## System Architecture

mermaid
graph TD
    User[User / Microphone] -->|Audio Stream| SM[SpeechManager (Frontend)]
    
    subgraph Frontend [Electron Renderer]
        SM -->|1. Browser STT| WebSpeech[Web Speech API]
        SM -->|2. Audio Chunks| SocketIO_C[Socket.IO Client]
        WebSpeech -->|Recognizing| SM
        WebSpeech -->|Recognized| SM
    end
    
    subgraph Backend [Node.js Server]
        SocketIO_S[Socket.IO Server] -- Audio Stream --> SpeechSvc[SpeechService]
        SocketIO_c -->|Text Events| SocketIO_S
        
        SpeechSvc -->|Deepgram fallback| DG[Deepgram API]
        DG -->|Transcript Stream| SpeechSvc
        
        SocketIO_S -->|Context + Prompt| LLM_Mod[llm.js]
        LLM_Mod -->|SSE Stream| Gemini[Gemini 2.0 API]
        Gemini -->|Token Stream| LLM_Mod
    end
    
    SM -->|Transcript| UILog[UI Transcript Log]
    LLM_Mod -->|Token Stream| SocketIO_S
    SocketIO_S -->|Token Stream| SocketIO_C
    SocketIO_C -->|Streaming Text| UILog


## Data Flow

### 1. Speech-to-Text (Pulse)
- **Primary (Free)**: `SpeechManager` uses `window.SpeechRecognition`. Interim results are sent immediately to the backend via `recognizing_item` events for "live" feel.
- **Fallback (High Accuracy)**: If Web Speech fails or is disabled:
  1. `SpeechManager` captures `MediaRecorder` chunks (100ms).
  2. Emits `audio_data` to backend.
  3. Backend `SpeechService` pipes audio to Deepgram WebSocket.
  4. Deepgram returns transcripts to backend -> frontend.

### 2. AI Processing (Pulse)
- User asks a question (voice or text).
- Backend retrieves context (RAG) + System Prompt.
- **Gemini 2.0 Flash** is called via `streamGenerateContent`.
- Tokens are streamed back to the frontend immediately via Socket.IO events (`answer`).

## Component Breakdown

### Frontend Services
- **`speech-manager.js`** (`resources/app/services/`): Orchestrator. Handles mic access, provider switching logic (Web Speech vs Deepgram), and Socket.IO events.
- **`web-speech-provider.js`** (`resources/app/services/`): Wrapper for browser native STT.

### Backend Services
- **`server.js`**: Entry point. Manages Socket.IO connections and RAG pipeline.
- **`speech-service.js`**: Abstraction layer. Manages API keys and WebSocket connections to Deepgram.
- **`llm.js`**: Handles Gemini API interactions, specifically Server-Sent Events (SSE) parsing for streaming.

## Configuration
- **`.env`**: Stores `GEMINI_API_KEY` and `DEEPGRAM_API_KEY`.
- **`assistants.json`**: Defines persona and system prompts.
