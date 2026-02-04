const path = require('path');
const { screen, app } = require('electron');
const { initializeWindowStealth, ensureAlwaysOnTop } = require('../utils/stealth-mode');
const { setupNavigationGuards } = require('../utils/navigation-guards');

function createMainWindow({ config, store, BrowserWindow, windowManager }) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const windowWidth = config.window.width || Math.floor(screenWidth / config.window.widthDivisor);
  const windowHeight = config.window.height;
  let x = Math.floor((screenWidth - windowWidth) / 2);
  let y = config.window.topOffset;

  // Window opacity set to 1.0 - transparency handled via CSS variables
  const mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    title: 'Meeting Assistant',
    type: 'panel',
    frame: false,
    transparent: true,
    opacity: 1.0,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: false,
    visibleOnAllWorkspaces: true,
    roundedCorners: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  setupNavigationGuards(mainWindow);

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // mainWindow.setResizable(false);

  if (process.platform === 'linux') {
    const intervalId = setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        ensureAlwaysOnTop(mainWindow);
      }
    }, 1000);
    windowManager.setWindowInterval('main', intervalId);
  }

  // Load from dev server in development mode, otherwise load from file
  const isDev = process.env.ELECTRON_DEV === 'true';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Ensure always on top after load
    ensureAlwaysOnTop(mainWindow);
    
    // Apply stealth mode settings
    const visibility = store.get('visibility', 'invisible');
    const isStealthMode = visibility === 'invisible';
    initializeWindowStealth(mainWindow, isStealthMode);
    
    // Sync opacity setting to renderer (background opacity via CSS)
    const opacity = store.get('opacity', 0.75);
    mainWindow.webContents.send('opacity-updated', { opacity });
    
    // Hide from dock on macOS if in stealth mode
    if (process.platform === 'darwin' && app.dock && isStealthMode) {
      app.dock.hide();
      console.log('App hidden from macOS dock');
    } else if (process.platform === 'darwin' && app.dock) {
      app.dock.show();
      console.log('App shown in macOS dock');
    }
  });

  windowManager.setMainWindow(mainWindow);

  mainWindow.on('move', () => {
    const sessionWindow = windowManager.getWindow('session');
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      const { positionSessionWindow } = require('./session-window');
      positionSessionWindow(sessionWindow, mainWindow);
    }
    const currentBounds = mainWindow.getBounds();
    x = currentBounds.x;
    y = currentBounds.y;
  });

  mainWindow.on('closed', () => {
    windowManager.clearWindowInterval('main');
    windowManager.closeAllChildWindows();
  });

  mainWindow.on('will-resize', (event, newBounds) => {
    event.preventDefault();
  });
  mainWindow.on('resize', (event, newBounds) => {
    const windowWidth = config.window.width || Math.floor(screenWidth / config.window.widthDivisor);
    const windowHeight = config.window.height;

    const { width: currentWidth, height: currentHeight } = mainWindow.getBounds() || newBounds || {};
    if (currentWidth !== windowWidth || currentHeight !== windowHeight) {
      mainWindow.setBounds({ x, y, width: windowWidth, height: windowHeight }, false);
    }
  });
  
  
  return mainWindow;
}

module.exports = {
  createMainWindow
};

