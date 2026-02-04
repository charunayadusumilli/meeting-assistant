const { app } = require('electron');

/**
 * Apply stealth mode settings to a window
 * @param {BrowserWindow} window - The window to apply stealth settings to
 * @param {boolean} isStealthMode - Whether stealth mode should be enabled
 */
function applyStealthToWindow(window, isStealthMode) {
  if (!window || window.isDestroyed()) {
    return;
  }

  // Content protection (prevents screen sharing/recording)
  window.setContentProtection(isStealthMode);

  // Skip taskbar (Windows/Linux)
  window.setSkipTaskbar(isStealthMode);

  console.log(`Stealth mode ${isStealthMode ? 'enabled' : 'disabled'} for ${window.title || 'unnamed window'}`);
}

/**
 * Apply stealth mode settings to the entire app
 * @param {boolean} isStealthMode - Whether stealth mode should be enabled
 * @param {WindowManager} windowManager - The window manager instance
 */
function applyStealthToApp(isStealthMode, windowManager) {
  // macOS: Hide/show from dock
  if (process.platform === 'darwin' && app.dock) {
    if (isStealthMode) {
      app.dock.hide();
      console.log('App hidden from macOS dock');
    } else {
      app.dock.show();
      console.log('App shown in macOS dock');
    }
  }

  // Apply to main window
  const mainWindow = windowManager.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyStealthToWindow(mainWindow, isStealthMode);
  }

  // Apply to all child windows
  const childWindows = ['session', 'settings'];
  childWindows.forEach((windowName) => {
    const window = windowManager.getWindow(windowName);
    if (window && !window.isDestroyed()) {
      applyStealthToWindow(window, isStealthMode);
    }
  });

  console.log(`Stealth mode ${isStealthMode ? 'enabled' : 'disabled'} for all windows`);
}

/**
 * Ensure a window is always on top
 * This should be called regardless of stealth mode
 * @param {BrowserWindow} window - The window to keep on top
 */
function ensureAlwaysOnTop(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.setAlwaysOnTop(true, 'screen-saver');
  console.log(`Always on top enforced for ${window.title || 'unnamed window'}`);
}

/**
 * Initialize stealth mode for a window during creation
 * @param {BrowserWindow} window - The window to initialize
 * @param {boolean} isStealthMode - Whether stealth mode should be enabled
 */
function initializeWindowStealth(window, isStealthMode) {
  if (!window || window.isDestroyed()) {
    return;
  }

  // Always on top (regardless of stealth mode)
  ensureAlwaysOnTop(window);

  // Apply stealth settings
  applyStealthToWindow(window, isStealthMode);
}

module.exports = {
  applyStealthToWindow,
  applyStealthToApp,
  ensureAlwaysOnTop,
  initializeWindowStealth
};

