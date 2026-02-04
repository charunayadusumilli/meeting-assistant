const path = require('path');
const { initializeWindowStealth, ensureAlwaysOnTop } = require('../utils/stealth-mode');

function createSettingsWindow({ windowManager, BrowserWindow, screen, store }) {
  const mainWindow = windowManager.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.error('Main window not available');
    return;
  }

  const storedTheme = store.get('theme', 'dark');
  const initialTheme = storedTheme === 'light' ? 'light' : 'dark';



  // Settings window always fully opaque - excluded from transparency
  const settingsWindow = windowManager.createChildWindow('settings', {
    title: 'Settings | Meeting Assistant',
    show: false,
    frame: false,
    transparent: true,
    opacity: 1.0,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: true,
    skipTaskbar: true,
    movable: true,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  settingsWindow.setAlwaysOnTop(true, 'screen-saver');
  // Load from dev server in development mode, otherwise load from file
  const isDev = process.env.ELECTRON_DEV === 'true';
  if (isDev) {
    const settingsUrl = new URL('http://localhost:5000');
    settingsUrl.searchParams.set('window', 'settings');
    settingsUrl.searchParams.set('theme', initialTheme);
    settingsWindow.loadURL(settingsUrl.toString());
  } else {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    settingsWindow.loadFile(indexPath, { query: { window: 'settings', theme: initialTheme } });
  }



  // Ensure always on top
  ensureAlwaysOnTop(settingsWindow);
  settingsWindow.once('ready-to-show', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
    }
  });
  if (process.platform === 'linux') {
    const intervalId = setInterval(() => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        ensureAlwaysOnTop(settingsWindow);
      }
    }, 1000);
    windowManager.setWindowInterval('settings', intervalId);
  }

  // Apply stealth mode settings
  const visibility = store.get('visibility', 'invisible');
  const isStealthMode = visibility === 'invisible';
  initializeWindowStealth(settingsWindow, isStealthMode);

  return settingsWindow;
}

module.exports = {
  createSettingsWindow
};

