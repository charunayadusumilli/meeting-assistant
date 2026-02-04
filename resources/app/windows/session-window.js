const path = require('path');
const { initializeWindowStealth, ensureAlwaysOnTop } = require('../utils/stealth-mode');

const SESSION_WINDOW_MIN_WIDTH = 320;
const SESSION_WINDOW_MIN_HEIGHT = 200;

const sessionWindowState = {
  width: null,
  height: null
};

function updateSessionWindowStateFromBounds(bounds) {
  if (!bounds) {
    return;
  }
  sessionWindowState.width = Math.max(SESSION_WINDOW_MIN_WIDTH, bounds.width || SESSION_WINDOW_MIN_WIDTH);
  sessionWindowState.height = Math.max(SESSION_WINDOW_MIN_HEIGHT, bounds.height || SESSION_WINDOW_MIN_HEIGHT);
}

function getSessionWindowSize(mainBounds, currentBounds) {
  const fallbackWidth = mainBounds?.width ? Math.max(SESSION_WINDOW_MIN_WIDTH, mainBounds.width * 1.5) : SESSION_WINDOW_MIN_WIDTH;
  const fallbackHeight = Math.max(SESSION_WINDOW_MIN_HEIGHT, currentBounds?.height || SESSION_WINDOW_MIN_HEIGHT);
  const width = Math.max(SESSION_WINDOW_MIN_WIDTH, sessionWindowState.width || currentBounds?.width || fallbackWidth);
  const height = Math.max(SESSION_WINDOW_MIN_HEIGHT, sessionWindowState.height || currentBounds?.height || fallbackHeight);
  return { width, height };
}

function positionSessionWindow(sessionWindow, mainWindow) {
  if (!sessionWindow || sessionWindow.isDestroyed()) {
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const mainBounds = mainWindow.getBounds();
  const currentBounds = sessionWindow.getBounds();
  const { width, height } = getSessionWindowSize(mainBounds, currentBounds);

  updateSessionWindowStateFromBounds({ width, height });

  const newX = Math.round(mainBounds.x + (mainBounds.width - width) / 2);
  const newY = mainBounds.y + mainBounds.height + 5;

  sessionWindow.setBounds({
    x: newX,
    y: newY,
    width,
    height
  }, false);
}

function createSessionWindow({ store, windowManager, BrowserWindow }) {
  const mainWindow = windowManager.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.error('Main window not available');
    return;
  }

  const mainBounds = mainWindow.getBounds();

  const initialWidth = Math.max(SESSION_WINDOW_MIN_WIDTH, mainBounds.width * 1.5);
  const initialHeight = Math.max(SESSION_WINDOW_MIN_HEIGHT, 400);
  const sessionWindowWidth = sessionWindowState.width || initialWidth;
  const sessionWindowHeight = sessionWindowState.height || initialHeight;
  const sessionWindowX = Math.round(mainBounds.x + (mainBounds.width - sessionWindowWidth) / 2);
  const sessionWindowY = mainBounds.y + mainBounds.height + 5;

  // Window opacity set to 1.0 - transparency handled via CSS variables
  const sessionWindow = windowManager.createChildWindow('session', {
    width: sessionWindowWidth,
    height: sessionWindowHeight,
    x: sessionWindowX,
    y: sessionWindowY,
    title: 'Session | Meeting Assistant',
    show: false,
    frame: false,
    transparent: true,
    opacity: 1.0,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load from dev server in development mode, otherwise load from file
  const isDev = process.env.ELECTRON_DEV === 'true';
  if (isDev) {
    sessionWindow.loadURL('http://localhost:5000?window=session');
  } else {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    sessionWindow.loadFile(indexPath, { query: { window: 'session' } });
  }

  // Sync opacity setting to renderer after load (background opacity via CSS)
  sessionWindow.webContents.on('did-finish-load', () => {
    const opacity = store.get('opacity', 0.75);
    sessionWindow.webContents.send('opacity-updated', { opacity });
  });

  // Ensure always on top
  ensureAlwaysOnTop(sessionWindow);

  if (process.platform === 'linux') {
    const intervalId = setInterval(() => {
      if (sessionWindow && !sessionWindow.isDestroyed()) {
        ensureAlwaysOnTop(sessionWindow);
      }
    }, 1000);
    windowManager.setWindowInterval('session', intervalId);
  }

  // Apply stealth mode settings
  const visibility = store.get('visibility', 'invisible');
  const isStealthMode = visibility === 'invisible';
  initializeWindowStealth(sessionWindow, isStealthMode);

  updateSessionWindowStateFromBounds({ width: sessionWindowWidth, height: sessionWindowHeight });
  positionSessionWindow(sessionWindow, mainWindow);

  return sessionWindow;
}

module.exports = {
  SESSION_WINDOW_MIN_WIDTH,
  SESSION_WINDOW_MIN_HEIGHT,
  createSessionWindow,
  positionSessionWindow,
  updateSessionWindowStateFromBounds
};

