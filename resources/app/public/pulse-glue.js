/**
 * UI Integration Layer
 * Connects the frontend to speech and backend services
 *
 * Bridges Web Speech API transcripts into the React bundle's SpeechService
 * so the UI displays them natively.
 */

const { SpeechManager } = require('../services/speech-manager');
const { ipcRenderer } = require('electron');
const EventEmitter = require('events').EventEmitter;

// Intercept EventEmitter to capture the bundle's SpeechService singleton.
// pulse-glue.js loads before bundle.js (both deferred), so this intercept
// runs before the React bundle registers listeners on SpeechService.
const _origOn = EventEmitter.prototype.on;
EventEmitter.prototype.on = function (event, listener) {
  if (event === 'recognized' && !window.__bundleSpeechService) {
    if ('recognizer' in this && 'speechConfig' in this) {
      window.__bundleSpeechService = this;
      console.log('[Pulse] Captured bundle SpeechService singleton');
    }
  }
  return _origOn.call(this, event, listener);
};
// Restore original after bundle has loaded
setTimeout(() => { EventEmitter.prototype.on = _origOn; }, 10000);

const speechManager = new SpeechManager({
  backendUrl: 'http://localhost:3000',
  preferDeepgram: true,
  autoFallback: true
});

window.speechManager = speechManager;

const remoteLog = (msg, data = null) => {
  console.log(`[Pulse] ${msg}`, data || '');
  try { ipcRenderer.send('client-log', { msg, data }); } catch (e) { }
  fetch('http://localhost:3000/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'info', msg, data })
  }).catch(() => { });
  if (speechManager.socket?.connected) {
    speechManager.socket.emit('client_log', { msg, data });
  }
};

const remoteError = (msg, error = null) => {
  console.error(`[Pulse] ${msg}`, error || '');
  const errStr = error?.message || error || 'Unknown error';
  try { ipcRenderer.send('client-log', { msg: `ERROR: ${msg}`, error: errStr }); } catch (e) { }
  fetch('http://localhost:3000/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'error', msg, error: errStr })
  }).catch(() => { });
  if (speechManager.socket?.connected) {
    speechManager.socket.emit('client_error', { msg, error: errStr });
  }
};

(async () => {
  try {
    const query = new URLSearchParams(window.location.search);
    const windowType = query.get('window') || 'main';

    remoteLog(`Initializing in ${windowType} window...`);

    // Status indicator for session window - defined early so it's available during init
    const addStatusIndicator = () => {
      if (document.getElementById('pulse-status-indicator')) return;

      const indicator = document.createElement('div');
      indicator.id = 'pulse-status-indicator';
      Object.assign(indicator.style, {
        position: 'fixed', top: '10px', right: '10px', zIndex: 9999,
        padding: '8px 16px', borderRadius: '20px', fontSize: '12px',
        fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px',
        backgroundColor: '#1f2937', color: '#10b981', border: '1px solid #10b981',
        transition: 'all 0.3s ease'
      });

      const dot = document.createElement('div');
      Object.assign(dot.style, {
        width: '8px', height: '8px', borderRadius: '50%',
        backgroundColor: '#10b981', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      });

      indicator.appendChild(dot);
      indicator.appendChild(document.createTextNode('Listening'));
      document.body.appendChild(indicator);

      if (!document.getElementById('pulse-keyframes')) {
        const style = document.createElement('style');
        style.id = 'pulse-keyframes';
        style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }';
        document.head.appendChild(style);
      }
    };

    if (windowType === 'session') {
      remoteLog('Initializing SpeechManager (Session Window)...');

      try {
        await speechManager.init();
        remoteLog('SpeechManager initialized');

        await speechManager.connect();
        remoteLog('Connected to backend');

        ipcRenderer.send('session-window-speech-ready');

        // Small delay to ensure UI is ready
        await new Promise(resolve => setTimeout(resolve, 500));

        remoteLog('Starting transcription...');
        speechManager.start();

        // Add visual status indicator
        addStatusIndicator();

        // Verify speech started
        setTimeout(() => {
          const status = speechManager.getStatus();
          remoteLog('Speech Status:', status);
          if (!status.isActive) {
            remoteError('Speech failed to start', status);

            // Update indicator to error state
            const indicator = document.getElementById('pulse-status-indicator');
            if (indicator) {
              indicator.style.backgroundColor = '#991b1b';
              indicator.style.color = '#fca5a5';
              indicator.style.borderColor = '#fca5a5';
              indicator.textContent = '⚠ Mic Error';
            }

            // Try to restart
            setTimeout(() => {
              remoteLog('Attempting to restart speech...');
              speechManager.start();
            }, 1000);
          } else {
            remoteLog('✓ Transcription active');
          }
        }, 2000);

      } catch (error) {
        remoteError('Failed to initialize speech', error);
        // Show user-friendly error
        const errorDiv = document.createElement('div');
        Object.assign(errorDiv.style, {
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#ef4444', color: 'white', padding: '12px 24px',
          borderRadius: '8px', zIndex: 10000, fontSize: '14px', fontWeight: '500'
        });
        errorDiv.textContent = 'Microphone Error: ' + (error.message || 'Please allow microphone access');
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
      }
    } else {
      remoteLog('Connecting SpeechManager for questions/answers (Main Window)...');
      await speechManager.connect();
      remoteLog('Connected to backend (Main Window)');
    }

    speechManager.onTranscript((text) => {
      console.log('[Pulse] Final Transcript:', text);
      window.dispatchEvent(new CustomEvent('pulse-transcript', { detail: { text, isFinal: true } }));

      // Flash the indicator green on transcript
      const indicator = document.getElementById('pulse-status-indicator');
      if (indicator) {
        indicator.style.backgroundColor = '#059669';
        setTimeout(() => { indicator.style.backgroundColor = '#1f2937'; }, 200);
      }

      // Bridge into bundle's SpeechService so React UI renders natively
      const svc = window.__bundleSpeechService;
      if (svc) {
        svc.emit('recognized', {
          type: 'final',
          content: text,
          timestamp: Date.now(),
          displayTimestamp: new Date().toLocaleTimeString()
        });
      }
    });

    speechManager.onInterim((text) => {
      console.log('[Pulse] Interim:', text);
      window.dispatchEvent(new CustomEvent('pulse-transcript', { detail: { text, isFinal: false } }));
      const svc = window.__bundleSpeechService;
      if (svc) {
        svc.emit('recognizing', {
          type: 'interim',
          content: text,
          timestamp: Date.now(),
          displayTimestamp: new Date().toLocaleTimeString()
        });
      }
    });

    speechManager.onStatusChange((status) => {
      remoteLog('Status Change:', status);
      // When Web Speech starts listening, signal the bundle's SpeechService
      if (status === 'listening') {
        const svc = window.__bundleSpeechService;
        if (svc) {
          svc.emit('ready');
          svc.emit('sessionStarted', { timestamp: Date.now() });
        }
      }
    });

    speechManager.onError((err) => {
      remoteError('SpeechManager Error:', err);
    });

    speechManager.onAnswer((data) => {
      console.log('[Pulse] Answer Received:', data);
      window.dispatchEvent(new CustomEvent('pulse-answer', { detail: data }));
    });

    ipcRenderer.on('session-answer', (event, data) => {
      console.log('[Pulse] IPC Session Answer Received:', data);
      window.dispatchEvent(new CustomEvent('pulse-answer', { detail: data }));
    });

    ipcRenderer.on('session-transcript', (event, data) => {
      console.log('[Pulse] IPC Transcript Received:', data);
      window.dispatchEvent(new CustomEvent('pulse-transcript', { detail: { text: data.content || data.text, isFinal: true } }));
    });

    const showCreateAssistantModal = async (preSelectedAssistant = null) => {
      const existing = document.getElementById('pulse-assistant-modal');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      let currentAssistantId = preSelectedAssistant ? (preSelectedAssistant.id || preSelectedAssistant._id) : null;
      const isEditMode = !!currentAssistantId;

      const close = () => {
        try {
          const el = document.getElementById('pulse-assistant-modal');
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        } catch (e) { console.warn(e); }
      };

      const backdrop = document.createElement('div');
      backdrop.id = 'pulse-assistant-modal';
      Object.assign(backdrop.style, {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      });

      const card = document.createElement('div');
      Object.assign(card.style, {
        backgroundColor: '#1E1E1E', padding: '0', borderRadius: '8px',
        width: '600px', maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid #333', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      });

      const header = document.createElement('div');
      Object.assign(header.style, {
        padding: '20px 24px', borderBottom: '1px solid #333',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      });
      const title = document.createElement('h2');
      title.textContent = isEditMode ? 'Edit Assistant' : 'Create New Assistant';
      Object.assign(title.style, { margin: 0, fontSize: '18px', fontWeight: '600', color: '#fff' });
      header.appendChild(title);
      card.appendChild(header);

      const body = document.createElement('div');
      Object.assign(body.style, { padding: '24px' });

      const createSectionHeader = (text) => {
        const el = document.createElement('h3');
        el.textContent = text.toUpperCase();
        Object.assign(el.style, {
          fontSize: '12px', color: '#888', letterSpacing: '0.05em',
          marginTop: '0', marginBottom: '16px', fontWeight: '600'
        });
        return el;
      };

      const createField = (label, type = 'text', placeholder = '', rows = 1) => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '20px';
        const lbl = document.createElement('label');
        lbl.innerHTML = label;
        Object.assign(lbl.style, {
          display: 'block', marginBottom: '8px', fontSize: '14px',
          fontWeight: '500', color: '#e5e5e5'
        });
        let input;
        if (rows > 1) {
          input = document.createElement('textarea');
          input.rows = rows;
        } else {
          input = document.createElement('input');
          input.type = type;
        }
        Object.assign(input.style, {
          width: '100%', padding: '10px 12px', borderRadius: '6px',
          border: '1px solid #404040', backgroundColor: '#262626', color: '#fff',
          fontSize: '14px', boxSizing: 'border-box', outline: 'none'
        });
        input.onfocus = () => input.style.borderColor = '#3b82f6';
        input.onblur = () => input.style.borderColor = '#404040';
        if (placeholder) input.placeholder = placeholder;
        wrapper.appendChild(lbl);
        wrapper.appendChild(input);
        return { wrapper, input };
      };

      body.appendChild(createSectionHeader('Basics'));
      const nameField = createField('Assistant Name <span style="color:#ef4444">*</span>', 'text', '');
      nameField.input.value = preSelectedAssistant?.name || 'Senior Engineer Interviewer';

      const techField = createField('Technologies', 'text', 'e.g., React, Node.js, AWS, Python');
      techField.input.value = preSelectedAssistant?.technologies || '';

      const resumeWrapper = document.createElement('div');
      resumeWrapper.style.marginBottom = '20px';
      const resumeLabel = document.createElement('label');
      resumeLabel.innerHTML = 'Resume (Optional) <span style="color:#888; font-weight:400; font-size:12px; margin-left:8px">Updates context automatically</span>';
      Object.assign(resumeLabel.style, { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#e5e5e5' });

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf,.docx,.txt,.md,.json,.js,.py,.html';
      Object.assign(fileInput.style, {
        width: '100%', padding: '10px', borderRadius: '6px',
        border: '1px solid #404040', backgroundColor: '#262626', color: '#fff',
        fontSize: '14px', boxSizing: 'border-box'
      });
      resumeWrapper.appendChild(resumeLabel);
      resumeWrapper.appendChild(fileInput);

      body.appendChild(nameField.wrapper);
      body.appendChild(techField.wrapper);
      body.appendChild(resumeWrapper);

      body.appendChild(createSectionHeader('Configuration'));

      const getPrompt = (technologies = '') => {
        const techStr = technologies ? technologies : '(None specified)';
        return `You are acting as **me** during a live technical interview.

### Dynamic Context Sources
- **Technologies field**: ${techStr}
  - This field defines the primary **technical domain**, **tools**, **languages**, and **frameworks**.
- **Resume (optional)**:
  - If a resume is provided, treat it as the **source of truth** for my experience.

### Input You Will Receive
I may provide:
- real-time interview transcription
- screenshots of code, logs, or system output
- raw code copied from an IDE

### Your Responsibilities
1. **Identify the last question, task, or problem being discussed**.
2. Respond in **first person**, as if I am speaking live in an interview.
3. Keep the tone **natural, confident, and professional**.
4. Adapt dynamically to the **Technologies provided**.

### Output Format (STRICT)
\`\`\`md
Q: {identified question or task}

A: {first-person, spoken-style answer in clear paragraphs}

\`\`\`{language}
{corrected or generated code}
\`\`\`
`.trim();
      };

      const promptField = createField('System Prompt', 'text', '', 12);
      promptField.input.style.fontFamily = 'monospace';
      promptField.input.style.fontSize = '12px';
      promptField.input.value = preSelectedAssistant?.systemPrompt || getPrompt(preSelectedAssistant?.technologies);

      techField.input.addEventListener('input', (e) => {
        if (promptField.input.value.includes('You are acting as **me**')) {
          promptField.input.value = getPrompt(e.target.value);
        }
      });

      body.appendChild(promptField.wrapper);
      card.appendChild(body);

      const footer = document.createElement('div');
      Object.assign(footer.style, {
        padding: '16px 24px', borderTop: '1px solid #333', backgroundColor: '#1E1E1E',
        display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 8px 8px'
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      Object.assign(cancelBtn.style, {
        padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '500',
        cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#e5e5e5'
      });
      cancelBtn.onclick = close;

      const launchBtn = document.createElement('button');
      launchBtn.textContent = isEditMode ? 'Update & Launch' : 'Create & Launch';
      Object.assign(launchBtn.style, {
        padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '500',
        cursor: 'pointer', border: '1px solid #3b82f6', backgroundColor: 'transparent', color: '#3b82f6'
      });

      const saveBtn = document.createElement('button');
      saveBtn.textContent = isEditMode ? 'Update' : 'Create';
      Object.assign(saveBtn.style, {
        padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '500',
        cursor: 'pointer', border: 'none', backgroundColor: '#2563eb', color: 'white'
      });

      const handleSave = async (shouldLaunch) => {
        const name = nameField.input.value.trim();
        const tech = techField.input.value.trim();
        const prompt = promptField.input.value.trim();
        if (!name) return;

        saveBtn.innerText = 'Saving...';
        saveBtn.disabled = true; launchBtn.disabled = true;

        let resumeFilePath = null;
        if (fileInput.files.length > 0) resumeFilePath = fileInput.files[0].path;

        const payload = {
          name,
          technologies: tech,
          systemPrompt: prompt,
          resumeFilePath
        };

        try {
          let result;
          if (isEditMode) {
            console.log('Editing Assistant:', currentAssistantId);
            result = await ipcRenderer.invoke('settings-update-assistant', currentAssistantId, payload);
          } else {
            console.log('Creating New Assistant');
            payload.id = 'assistant-' + Date.now();
            payload.createdAt = Date.now();
            result = await ipcRenderer.invoke('settings-add-assistant', payload);
          }

          if (result.success) {
            if (!currentAssistantId && !isEditMode) {
              await ipcRenderer.invoke('settings-save-assistant', result.data, result.data.name);
            }
            if (shouldLaunch) {
              const launchId = result.data.id || result.data._id || currentAssistantId;
              await ipcRenderer.invoke('session-start', { assistantId: launchId });
            }
            close();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (e) {
          console.error('Save failed:', e);
          alert('Failed to save');
        } finally {
          saveBtn.innerText = isEditMode ? 'Update' : 'Create';
          saveBtn.disabled = false; launchBtn.disabled = false;
        }
      };

      saveBtn.onclick = () => handleSave(false);
      launchBtn.onclick = () => handleSave(true);
      footer.appendChild(cancelBtn);
      if (!isEditMode) footer.appendChild(launchBtn);
      footer.appendChild(saveBtn);
      card.appendChild(footer);
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
    };

    const patchUI = () => {
      const query = new URLSearchParams(window.location.search);
      const windowType = query.get('window') || 'main';

      if (!window.__pulseUIVersion) {
        window.__pulseUIVersion = '2.0';
        console.log('[Pulse] UI Patcher v2.0 initialized for window type:', windowType);
      }

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      let textChanges = 0;
      while (node = walker.nextNode()) {
        const val = node.nodeValue.trim();
        if (val === 'Create Meeting Assistant in Meeting Assistant') {
          node.nodeValue = 'Create New Assistant';
          textChanges++;
        }
        if (val === 'Pick the meeting assistant you want Meeting Assistant to use') {
          node.nodeValue = 'Select Assistant Persona';
          textChanges++;
        }
        if (node.nodeValue && /\bTrial\b/i.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/\bTrial\b/gi, '').replace(/\s{2,}/g, ' ').trim();
          textChanges++;
        }
        // Replace all "HuddleMate" / "Huddle Mate" branding with "Meeting Assistant"
        if (node.nodeValue && /huddle\s*mate/i.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/huddle\s*mate/gi, 'Meeting Assistant');
          textChanges++;
        }
      }

      if (textChanges > 0 && !window.__pulseTextPatched) {
        console.log(`[Pulse] Applied ${textChanges} text replacements`);
        window.__pulseTextPatched = true;
      }

      const buttons = Array.from(document.querySelectorAll('button'));

      // Find and handle buttons in settings window
      if (windowType === 'settings' || windowType === 'main') {
        // Hide "Start Trial Session" button - multiple methods for robustness
        buttons.forEach(btn => {
          const text = btn.textContent.trim();
          const html = btn.innerHTML;

          // Method 1: Check for "Trial" text
          if (text.includes('Trial') && text.includes('Session')) {
            btn.style.display = 'none';
            btn.style.visibility = 'hidden';
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';
            btn.style.position = 'absolute';
            btn.style.left = '-9999px';
            console.log('[Pulse] Hid Trial Session button via text match');
          }

          // Method 2: Check for lightning bolt icon
          if (html.includes('fa-bolt') || html.includes('⚡') || html.includes('bolt')) {
            if (text.includes('Trial') || text.includes('Start')) {
              btn.style.display = 'none';
              btn.style.visibility = 'hidden';
              btn.style.opacity = '0';
              btn.style.pointerEvents = 'none';
              console.log('[Pulse] Hid Trial Session button via icon match');
            }
          }

          // Method 3: Check for specific button structure (blue outlined button)
          if (text === 'Start Trial Session' || text === '⚡ Start Trial Session') {
            btn.style.display = 'none';
            btn.style.visibility = 'hidden';
            console.log('[Pulse] Hid Trial Session button via exact text match');
          }
        });

        // Find and reposition "Create Meeting Assistant" button
        const createAssistantBtn = buttons.find(btn =>
          btn.textContent.includes('Create') &&
          (btn.textContent.includes('Assistant') || btn.textContent.includes('Meeting'))
        );

        if (createAssistantBtn) {
          // Update button text if needed
          const currentText = createAssistantBtn.textContent.trim();
          if (currentText.includes('Create Meeting Assistant in Meeting Assistant')) {
            createAssistantBtn.textContent = 'Create New Assistant';
            console.log('[Pulse] Updated Create button text');
          }

          // Hook into the button to show our custom modal
          if (!createAssistantBtn.dataset.pulsePatched) {
            createAssistantBtn.dataset.pulsePatched = 'true';
            const origOnClick = createAssistantBtn.onclick;
            createAssistantBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              showCreateAssistantModal(null);
            };
            console.log('[Pulse] Hooked Create button click handler');
          }
        }
      }

      // Handle duplicate "Start Session" buttons
      let startSessionBtns = buttons.filter(btn => btn.textContent.includes('Start Session'));
      if (startSessionBtns.length > 1) {
        startSessionBtns.forEach((btn, idx) => {
          if (idx > 0 || btn.innerHTML.includes('fa-bolt') || btn.textContent.includes('⚡')) {
            btn.style.display = 'none';
          }
        });
      }

      // Aggressively hide "Connecting" overlays in session window
      if (windowType === 'session') {
        const status = speechManager?.getStatus?.();
        const isActive = status?.isActive || speechManager?.isActive;
        const isConnected = status?.backendConnected || speechManager?.socket?.connected;

        if (isActive || isConnected) {
          // Hide any element containing "Connecting", "Correcting", or similar text
          document.querySelectorAll('div, h1, h2, h3, span, p, section').forEach(el => {
            const text = el.textContent.trim().toLowerCase();
            if (text === 'connecting' || text === 'connecting...' || text === 'correcting' || text.includes('connecting')) {
              let container = el;
              // Traverse up to 10 levels to find the overlay container
              for (let i = 0; i < 10; i++) {
                if (container.parentElement) {
                  container = container.parentElement;
                  const style = window.getComputedStyle(container);
                  // Hide if it's a fixed/absolute positioned overlay
                  if ((style.position === 'fixed' || style.position === 'absolute') &&
                      (parseInt(style.zIndex) > 100 || style.zIndex === 'auto')) {
                    container.style.display = 'none';
                    container.style.visibility = 'hidden';
                    container.style.opacity = '0';
                    container.style.pointerEvents = 'none';
                    console.log('[Pulse] Hid Connecting overlay');
                    break;
                  }
                }
              }
            }
          });
        }
      }

      document.querySelectorAll('div').forEach(div => { if (div.textContent.includes('Updates disabled in local build')) div.style.display = 'none'; });

      const editBtnId = 'pulse-edit-btn';
      const existingEditBtn = document.getElementById(editBtnId);

      if (windowType === 'settings' || windowType === 'main') {
        const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span'));
        const assistantHeader = headers.find(el => el.textContent.trim() === 'ASSISTANT');

        if (assistantHeader) {
          const parent = assistantHeader.parentElement;
          if (parent && !parent.querySelector(`#${editBtnId}`)) {
            parent.style.display = 'flex';
            parent.style.justifyContent = 'space-between';
            parent.style.alignItems = 'center';
            parent.style.position = 'relative';
            parent.style.gap = '12px';

            const editBtn = document.createElement('button');
            editBtn.id = editBtnId;
            editBtn.innerHTML = '✏️ Edit';
            Object.assign(editBtn.style, {
              backgroundColor: '#262626',
              border: '1px solid #404040',
              color: '#e5e5e5',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              marginLeft: 'auto',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            });
            editBtn.onmouseenter = () => {
              editBtn.style.backgroundColor = '#333';
              editBtn.style.borderColor = '#3b82f6';
            };
            editBtn.onmouseleave = () => {
              editBtn.style.backgroundColor = '#262626';
              editBtn.style.borderColor = '#404040';
            };
            editBtn.onclick = async (e) => {
              e.preventDefault(); e.stopPropagation();
              try {
                const { assistant } = await ipcRenderer.invoke('settings-get-assistant');
                if (assistant) showCreateAssistantModal(assistant);
                else alert('No assistant selected to edit.');
              } catch (err) { console.error('Failed to get assistant:', err); }
            };
            parent.appendChild(editBtn);
          }
        } else if (!existingEditBtn && windowType === 'main') {
          // Fallback: Add edit button as fixed position in main window if header not found
          const editBtn = document.createElement('button');
          editBtn.id = editBtnId;
          editBtn.innerHTML = '✏️ Edit';
          Object.assign(editBtn.style, {
            position: 'fixed', top: '80px', right: '30px', zIndex: 9000,
            backgroundColor: '#262626', border: '1px solid #404040', color: '#e5e5e5',
            borderRadius: '6px', padding: '8px 12px', fontSize: '13px',
            fontWeight: '500', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          });
          editBtn.onclick = async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
              const { assistant } = await ipcRenderer.invoke('settings-get-assistant');
              if (assistant) showCreateAssistantModal(assistant);
              else alert('No assistant selected to edit.');
            } catch (err) { console.error('Failed to get assistant:', err); }
          };
          document.body.appendChild(editBtn);
        }
      } else if (existingEditBtn) {
        existingEditBtn.remove();
      }
    };

    setInterval(patchUI, 1000);

  } catch (e) {
    console.error('[Pulse] Init failed:', e);
  }
})();
