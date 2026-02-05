# Meeting Assistant - Pulse Edition

**Meeting Assistant** is a specialized, local-first **Technical Interview Copilot** designed to provide real-time, context-aware coaching during live meetings. It leverages the **Pulse Architecture** to deliver low-latency transcription and AI responses grounded in your specific profile.

## 🎯 Project Goal

To create the ultimate **"AI Wingman" for Software Engineers**. Unlike generic meeting bots, this assistant is aware of:
1.  **Your Resume**: It reads your actual experience (PDF/Docx) to answer behavioral questions authentically.
2.  **Your Tech Stack**: It tailors technical answers to your preferred languages and frameworks (e.g., React vs. Angular, Python vs. Go).
3.  **Real-Time Context**: It listens live and identifies the *exact* question being asked, providing instant, copy-pasteable code or spoken answers.

## ⚡ Pulse Architecture

The app uses a hybrid, high-performance pipeline:

*   **Audio**:
    *   **Primary**: Browser-native `Web Speech API` for zero-latency, free transcription.
    *   **Fallback**: Integrated **Deepgram Nova-2** stream for high-fidelity backup when needed.
*   **Intelligence**:
    *   **Model**: **Google Gemini 2.0 Flash** (via API) for sub-second token streaming.
    *   **Context**: Local RAG (Retrieval-Augmented Generation) pipeline chunks and vectorizes your resume/transcripts locally.
*   **Application**:
    *   **Frontend**: Electron + Vanilla JS (Lightweight, floating overlay).
    *   **Backend**: Node.js + Socket.IO (Handles API streams and state).

## ✨ Key Features

### 1. Assistant Personas
Create multiple "Assistants" for different scenarios (e.g., "Senior Frontend Role", "DevOps Architect").
- **Name**: Custom identity.
- **Technologies**: Defines the scope of technical answers.
- **Resume Integation**: Upload your `.pdf` or `.docx` resume. The AI will prioritize your actual projects and tenure when generating responses.

### 2. Live "Pulse" Interface
- **Floating Overlay**: Designed to sit on top of Zoom/Teams/Meet without blocking your view.
- **Instant Answers**: Q&A format ("Q: What is a closure?", "A: A closure is...").
- **Edit on the Fly**: Hot-swap assistants or edit settings mid-meeting using the **Top-Right Edit Button**.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- **Gemini API Key** (Google AI Studio)
- **Deepgram API Key** (Optional, for enhanced audio)

### Installation

1.  **Clone & Install**:
    ```bash
    # Backend
    cd backend
    npm install

    # Frontend (Resource App)
    cd ../resources/app
    npm install
    ```

2.  **Configuration**:
    Create a `.env` file in `backend/`:
    ```env
    GEMINI_API_KEY=your_key_here
    DEEPGRAM_API_KEY=your_key_here
    PORT=3000
    ```

3.  **Run**:
    ```bash
    # Start Backend
    cd backend
    npm run dev
    ```
    *The Electron app is currently launched via the provided `Meeting Assistant.exe` or development scripts mapping to `resources/app`.*

## 🔒 Privacy & Architecture
- **Local-First**: Embeddings and Vector Indices are stored locally in `backend/storage/`.
- **Ephemeral Audio**: Audio is streamed for transcription and immediately discarded; never stored unless recording is explicitly enabled.
