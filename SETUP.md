# Meeting Assistant - Complete Setup Guide

## 🎯 Quick Start (5 Minutes)

### Step 1: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 2: Configure Backend (.env)

1. Get a **FREE** Gemini API key from https://aistudio.google.com/apikey

2. Create `backend/.env` file:
```env
# Copy from .env.example and add your key
GEMINI_API_KEY=your-actual-key-here
```

### Step 3: Launch the App
```bash
"Meeting Assistant.exe"
```

The app will automatically start the backend server and open the main window.

---

## ✅ Verification

### Backend is Running
Check console output when app starts:
```
[Backend] Starting: backend\src\server.js
[Backend] Listening on http://localhost:3000
[Backend] Ready after 500ms
```

### UI Changes Applied
1. Open Settings (gear icon)
2. Should see:
   - ✅ "Create New Assistant" button
   - ✅ "✏️ Edit" button next to Assistant dropdown
   - ❌ NO "Start Trial Session" button (hidden)

### Session Start Works
Click "Start Session" → Overlay window opens (no error)

---

## 🧪 Complete Flow Test

1. **Create Assistant**: Settings → "Create New Assistant" → Fill form → Create
2. **Start Session**: Select assistant → "Start Session"
3. **Live Transcript**: Speak into mic → See text appear in overlay
4. **Ask Question**: Type question → Get LLM response

---

## 🔧 Architecture (100% Local/Free)

| Component | Technology | Cost |
|---|---|---|
| Desktop App | Electron | Free |
| Backend | Node.js + Express | Free |
| LLM | Gemini 2.0 Flash | **Free Tier** |
| Embeddings | Gemini text-embedding | Free |
| STT | Web Speech API | Free |
| Vector Store | JSON files | Free |

**Gemini Free Tier:** 15 requests/min, 1500/day

---

## 🚀 Optional: Upgrade to Ollama (Unlimited Local)

For unlimited use without API limits:

1. Install Ollama: https://ollama.com/download
2. Pull models:
   ```bash
   ollama pull llama3.2:3b
   ollama pull nomic-embed-text
   ```

3. Update `backend/.env`:
   ```env
   LLM_PROVIDER=ollama
   LLM_MODEL=llama3.2:3b
   EMBEDDING_MODEL=nomic-embed-text
   ```

4. Restart app

---

## 🐛 Troubleshooting

### "Session start failed"
**Fix:** Install backend dependencies
```bash
cd backend
npm install
```

### "Cannot find module 'electron-log'"
**Fix:** Install Electron app dependencies
```bash
cd resources/app
npm install
```

### UI Changes Not Showing
**Fix:** Completely close and restart the app. UI patches run every second with logging to console.

### Backend Won't Start
**Fix:** Check if port 3000 is in use
```bash
netstat -ano | findstr :3000
# Or change PORT in backend/.env
```

---

## 📊 Backend Testing

```bash
cd backend

# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E Socket.IO tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

Expected: ~90 tests, ~60% coverage

---

## 📁 Project Structure

```
meeting-assistant/
├── backend/                # Node.js backend
│   ├── src/server.js      # Main server
│   ├── data/              # Assistants, transcripts
│   ├── storage/           # Vector DB
│   ├── __tests__/         # 90+ tests
│   └── .env               # Your config
├── resources/app/         # Electron app
│   ├── index.js           # Main process
│   ├── public/pulse-glue.js  # UI patches
│   └── ipc/               # IPC handlers
└── Meeting Assistant.exe  # Launcher
```

---

## 💡 Cost Optimization

**Current Setup (FREE):**
- ✅ Gemini: 1500 requests/day
- ✅ Web Speech API: Unlimited
- ✅ JSON Vector Store: Unlimited
- ✅ No reranker needed

**Production Upgrade:**
- Ollama: Unlimited local LLM
- SQLite: Better vector store performance
- Qdrant: For scale (only if needed)

---

## 🆘 Help

- **Issues:** https://github.com/charunayadusumilli/meeting-assistant/issues
- **Backend Logs:** Check console when running app
- **Frontend Logs:** Press F12 in any window
- **Tests:** `npm test` in backend/

---

**Ready!** 🎉

1. Add `GEMINI_API_KEY` to `backend/.env`
2. Restart the app
3. Test the flow: Create Assistant → Start Session → Speak → Ask → Answer
