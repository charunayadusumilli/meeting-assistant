const { BrowserWindow } = require('electron');

const GLOBAL_SHORTCUT_QUICK_QUESTION = 'CommandOrControl+Enter';
const GLOBAL_SHORTCUT_SCREENSHOT = 'CommandOrControl+Shift+S';

function registerGlobalShortcuts({ globalShortcut, sessionService }) {
  try {
    if (!globalShortcut.isRegistered(GLOBAL_SHORTCUT_QUICK_QUESTION)) {
      const success = globalShortcut.register(GLOBAL_SHORTCUT_QUICK_QUESTION, () => {
        if (!sessionService.isActive) {
          console.log('Global shortcut ignored: session is not active');
          return;
        }

        const sent = sessionService.sendToBackend('question', {});
        if (!sent) {
          console.error('Failed to send question event via global shortcut');
        }
      });

      if (success) {
        console.log(`Global shortcut registered: ${GLOBAL_SHORTCUT_QUICK_QUESTION}`);
      } else {
        console.error(`Failed to register global shortcut: ${GLOBAL_SHORTCUT_QUICK_QUESTION}`);
      }
    }

    if (!globalShortcut.isRegistered(GLOBAL_SHORTCUT_SCREENSHOT)) {
      const success = globalShortcut.register(GLOBAL_SHORTCUT_SCREENSHOT, () => {
        if (!sessionService.isActive) {
          console.log('Screenshot shortcut ignored: session is not active');
          return;
        }

        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('trigger-screenshot-capture');
          }
        });
      });

      if (success) {
        console.log(`Global shortcut registered: ${GLOBAL_SHORTCUT_SCREENSHOT}`);
      } else {
        console.error(`Failed to register global shortcut: ${GLOBAL_SHORTCUT_SCREENSHOT}`);
      }
    }
  } catch (error) {
    console.error('Error registering global shortcuts:', error);
  }
}

function unregisterGlobalShortcuts({ globalShortcut } = {}) {
  try {
    if (!globalShortcut) {
      console.warn('Global shortcuts unavailable during unregister. Skipping.');
      return;
    }

    globalShortcut.unregisterAll();
    console.log('Global shortcuts unregistered');
  } catch (error) {
    console.error('Error unregistering global shortcuts:', error);
  }
}

module.exports = {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts,
  GLOBAL_SHORTCUT_QUICK_QUESTION,
  GLOBAL_SHORTCUT_SCREENSHOT
};
