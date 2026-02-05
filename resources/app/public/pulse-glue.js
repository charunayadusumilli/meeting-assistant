/**
 * Pulse Architecture Glue Code
 * Connects the Frontend UI to the SpeechManager (Audio Streaming)
 */

const { SpeechManager } = require('../services/speech-manager');
const { ipcRenderer } = require('electron');

// Initialize the Speech Manager
const speechManager = new SpeechManager({
    backendUrl: 'http://localhost:3000',
    preferDeepgram: false, // Default to Web Speech (Free)
    autoFallback: true
});

window.speechManager = speechManager;

// Connect immediately
(async () => {
    try {
        console.log('[Pulse] Initializing SpeechManager...');
        await speechManager.init();
        await speechManager.connect();
        console.log('[Pulse] Connected to backend');

        // Auto-start listening
        console.log('[Pulse] Auto-starting transcription...');
        speechManager.start();

        // Listen for transcripts to update UI (if we can find the element)
        speechManager.onTranscript((text) => {
            console.log('[Pulse] Transcript:', text);
            // Dispatch event for React app to pick up if it listens to window events
            window.dispatchEvent(new CustomEvent('pulse-transcript', { detail: text }));
        });

        speechManager.onAnswer((data) => {
            console.log('[Pulse] Answer:', data);
        });

        // === Inline Modal Logic ===
        const showCreateAssistantModal = async (preSelectedAssistant = null) => {
            // Remove existing if any (Safe Removal)
            const existing = document.getElementById('pulse-assistant-modal');
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

            // Logic State
            let currentAssistantId = preSelectedAssistant ? (preSelectedAssistant.id || preSelectedAssistant._id) : null;
            const isEditMode = !!currentAssistantId;

            // Safe remove helper
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

            // Header
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

            // Body
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

            // Section 1: BASICS
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

            // Section 2: CONFIGURATION
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

            // Auto-update
            techField.input.addEventListener('input', (e) => {
                if (promptField.input.value.includes('You are acting as **me**')) {
                    promptField.input.value = getPrompt(e.target.value);
                }
            });

            body.appendChild(promptField.wrapper);
            card.appendChild(body);

            // Footer
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

            // Save Handler
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

        // ... Global Click Listener (Already outside) ...

        // === UI Patcher ===
        const patchUI = () => {
            // ... Clean Text ...
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while (node = walker.nextNode()) {
                const val = node.nodeValue.trim();
                if (val === 'Create Meeting Assistant in Meeting Assistant') node.nodeValue = 'Create New Assistant';
                if (val === 'Pick the meeting assistant you want Meeting Assistant to use') node.nodeValue = 'Select Assistant Persona';
            }
            // ... Hide Elements ...
            document.querySelectorAll('button').forEach(btn => { if (btn.textContent.includes('Start Trial Session')) btn.style.display = 'none'; });
            document.querySelectorAll('div').forEach(div => { if (div.textContent.includes('Updates disabled in local build')) div.style.display = 'none'; });

            // 3. Inject "Edit Current" button (TOP RIGHT)
            // Strategy: Check if it exists. If not, create fixed positioned button.
            if (!document.getElementById('pulse-edit-btn')) {
                const editBtn = document.createElement('button');
                editBtn.id = 'pulse-edit-btn';
                editBtn.innerHTML = '&#9998; Edit Current'; // Pencil icon
                Object.assign(editBtn.style, {
                    position: 'fixed',
                    top: '80px', // Below title/header usually
                    right: '30px',
                    zIndex: 9000,
                    backgroundColor: '#262626',
                    border: '1px solid #404040',
                    color: '#e5e5e5',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                });
                editBtn.onmouseenter = () => editBtn.style.backgroundColor = '#333';
                editBtn.onmouseleave = () => editBtn.style.backgroundColor = '#262626';

                editBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Edit Current Clicked');
                    try {
                        const { assistant } = await ipcRenderer.invoke('settings-get-assistant');
                        if (assistant) {
                            showCreateAssistantModal(assistant);
                        } else {
                            alert('No assistant selected to edit. Select one first.');
                        }
                    } catch (err) {
                        console.error('Failed to get assistant:', err);
                    }
                };

                document.body.appendChild(editBtn);
            }
        };

        // Run periodically
        setInterval(patchUI, 1000);


    } catch (e) {
        console.error('[Pulse] Init failed:', e);
    }
})();
