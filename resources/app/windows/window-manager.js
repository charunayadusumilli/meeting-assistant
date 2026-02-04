const { BrowserWindow } = require('electron');
const { setupNavigationGuards } = require('../utils/navigation-guards');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.mainWindow = null;
    this.alwaysOnTopIntervals = new Map();
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  getMainWindow() {
    return this.mainWindow;
  }

  createChildWindow(windowName, options) {
    if (this.windows.has(windowName)) {
      const existingWindow = this.windows.get(windowName);
      if (existingWindow && !existingWindow.isDestroyed()) {
        return existingWindow;
      }
    }

    const childWindow = new BrowserWindow(options);
    setupNavigationGuards(childWindow);

    this.windows.set(windowName, childWindow);

    childWindow.on('closed', () => {
      this.windows.delete(windowName);
      this.clearWindowInterval(windowName);
    });

    return childWindow;
  }

  getWindow(windowName) {
    return this.windows.get(windowName);
  }

  closeWindow(windowName) {
    const window = this.windows.get(windowName);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  closeAllChildWindows() {
    this.windows.forEach((window) => {
      if (window && !window.isDestroyed()) {
        window.close();
      }
    });
    this.windows.clear();
    this.clearAllIntervals();
  }

  hasWindow(windowName) {
    const window = this.windows.get(windowName);
    return window && !window.isDestroyed();
  }

  setWindowInterval(windowName, intervalId) {
    this.alwaysOnTopIntervals.set(windowName, intervalId);
  }

  clearWindowInterval(windowName) {
    const intervalId = this.alwaysOnTopIntervals.get(windowName);
    if (intervalId) {
      clearInterval(intervalId);
      this.alwaysOnTopIntervals.delete(windowName);
      console.log(`Cleared interval for window: ${windowName}`);
    }
  }

  clearAllIntervals() {
    this.alwaysOnTopIntervals.forEach((intervalId, windowName) => {
      clearInterval(intervalId);
      console.log(`Cleared interval for window: ${windowName}`);
    });
    this.alwaysOnTopIntervals.clear();
  }
}

module.exports = {
  WindowManager,
  windowManager: new WindowManager()
};

