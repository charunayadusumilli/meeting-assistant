const { BrowserWindow } = require('electron');
const { applyStealthToApp } = require('../utils/stealth-mode');
const { localAssistantStore } = require('../services/local-assistant-store');
const path = require('path');

let mainPackageJson = null;
try {
  mainPackageJson = require(path.join(__dirname, '..', 'package.json'));
} catch (error) {
  console.warn('Failed to load main package.json:', error);
}

function registerSettingsHandlers({ ipcMain, windowManager, store, app }) {
  ipcMain.handle('settings-get-visibility', async () => {
    try {
      const visibility = store.get('visibility', 'invisible');
      return { visibility };
    } catch (error) {
      console.error('Error getting visibility:', error);
      return { visibility: 'invisible' };
    }
  });

  ipcMain.handle('settings-get-opacity', async () => {
    try {
      const opacity = store.get('opacity', 0.75);
      return { opacity };
    } catch (error) {
      console.error('Error getting opacity:', error);
      return { opacity: 0.75 };
    }
  });

  ipcMain.handle('settings-save-opacity', async (event, opacity) => {
    try {
      console.log('Saving opacity:', opacity);
      store.set('opacity', opacity);

      const mainWindow = windowManager.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setOpacity(1.0);
        console.log('Applied opacity to main window: 1.0 (full opacity for text readability)');
      }

      const sessionWindow = windowManager.getWindow('session');
      if (sessionWindow && !sessionWindow.isDestroyed()) {
        sessionWindow.setOpacity(1.0);
        console.log('Applied opacity to session window: 1.0 (full opacity for text readability)');
      }

      const settingsWindow = windowManager.getWindow('settings');
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.setOpacity(1.0);
        console.log('Settings window kept at full opacity (excluded from transparency)');
      }

      BrowserWindow.getAllWindows().forEach((window) => {
        const windowTitle = window.getTitle();
        if (windowTitle && windowTitle.includes('Settings')) {
          return;
        }
        window.webContents.send('opacity-updated', { opacity });
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving opacity:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-save-visibility', async (event, visibility) => {
    try {
      console.log('Saving visibility:', visibility);
      store.set('visibility', visibility);

      const isStealthMode = visibility === 'invisible';
      applyStealthToApp(isStealthMode, windowManager);

      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('visibility-updated', { visibility });
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving visibility:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-get-theme', async () => {
    try {
      const theme = store.get('theme', 'dark');
      return { theme };
    } catch (error) {
      console.error('Error getting theme:', error);
      return { theme: 'dark' };
    }
  });

  ipcMain.handle('settings-save-theme', async (event, theme) => {
    try {
      console.log('Saving theme:', theme);
      store.set('theme', theme);

      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('theme-updated', { theme });
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving theme:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-get-assistant', async () => {
    try {
      const assistant = store.get('selectedAssistant', null);
      let displayName = store.get('assistantDisplayName', null);

      if (!displayName && assistant && assistant.name) {
        displayName = assistant.name;
      }

      return {
        assistant: assistant || null,
        displayName: displayName || null
      };
    } catch (error) {
      console.error('Error getting stored assistant:', error);
      return {
        assistant: null,
        displayName: null
      };
    }
  });

  ipcMain.handle('settings-save-assistant', async (event, assistant, displayName) => {
    try {
      console.log('Saving assistant:', 'Display name:', displayName);
      store.set('selectedAssistant', assistant || null);

      if (displayName) {
        store.set('assistantDisplayName', displayName);
      } else if (assistant && assistant.name) {
        store.set('assistantDisplayName', assistant.name);
      } else {
        store.delete('assistantDisplayName');
      }

      BrowserWindow.getAllWindows().forEach((window) => {
        if (window.webContents !== event.sender) {
          window.webContents.send('assistant-updated');
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving assistant:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-clear-assistant', async () => {
    try {
      store.set('selectedAssistant', null);
      store.delete('assistantDisplayName');

      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('assistant-updated');
      });

      return { success: true };
    } catch (error) {
      console.error('Error clearing assistant:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-get-assistants', async (event, search = '', page = 0, pageSize = 25) => {
    try {
      const result = localAssistantStore.list({ search, page, pageSize });
      return { success: true, data: result };
    } catch (error) {
      console.error('Error getting assistants:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-add-assistant', async (event, assistant = {}) => {
    try {
      const created = localAssistantStore.create(assistant);
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('assistant-updated');
      });
      return { success: true, data: created };
    } catch (error) {
      console.error('Error adding assistant:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-update-assistant', async (event, assistantId, updates = {}) => {
    try {
      const updated = localAssistantStore.update(assistantId, updates);
      if (!updated) {
        return { success: false, error: 'Assistant not found' };
      }
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('assistant-updated');
      });
      return { success: true, data: updated };
    } catch (error) {
      console.error('Error updating assistant:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-delete-assistant', async (event, assistantId) => {
    try {
      const removed = localAssistantStore.remove(assistantId);
      if (!removed) {
        return { success: false, error: 'Assistant not found' };
      }
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('assistant-updated');
      });
      return { success: true };
    } catch (error) {
      console.error('Error deleting assistant:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-quit-app', async () => {
    try {
      console.log('Settings requested app quit');

      setImmediate(() => {
        windowManager.closeAllChildWindows();

        const mainWindow = windowManager.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        }

        app.quit();
      });

      return { success: true };
    } catch (error) {
      console.error('Error quitting app from settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-get-version', async () => {
    try {
      const version = app.getVersion();
      return { version };
    } catch (error) {
      console.error('Error getting app version:', error);
      if (mainPackageJson && mainPackageJson.version) {
        return { version: mainPackageJson.version };
      }
      return { version: '0.0.2' };
    }
  });

  ipcMain.handle('updates-get-status', async () => {
    return {
      status: 'disabled',
      downloaded: false,
      version: null,
      releaseNotes: null,
      downloadedAt: null,
      downloadProgress: null,
      error: 'Updates disabled in local build'
    };
  });

  ipcMain.handle('updates-install', async () => {
    return { success: false, error: 'Updates disabled in local build' };
  });
}

module.exports = {
  registerSettingsHandlers
};
