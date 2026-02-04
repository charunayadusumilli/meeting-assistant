const path = require('path');

function createAssistantWindow({ windowManager, BrowserWindow }) {
  const existing = windowManager.getWindow('assistant');
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const assistantWindow = windowManager.createChildWindow('assistant', {
    title: 'Create Assistant | Meeting Assistant',
    width: 460,
    height: 420,
    show: false,
    frame: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#0b0b0b',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const isDev = process.env.ELECTRON_DEV === 'true';
  if (isDev) {
    const assistantUrl = new URL('http://localhost:5000');
    assistantUrl.searchParams.set('window', 'assistant');
    assistantWindow.loadURL(assistantUrl.toString());
  } else {
    const pagePath = path.join(__dirname, '..', 'public', 'create-assistant.html');
    assistantWindow.loadFile(pagePath);
  }

  assistantWindow.once('ready-to-show', () => {
    if (!assistantWindow.isDestroyed()) {
      assistantWindow.show();
      assistantWindow.focus();
    }
  });

  return assistantWindow;
}

module.exports = {
  createAssistantWindow
};
