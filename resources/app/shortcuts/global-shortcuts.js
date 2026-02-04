const GLOBAL_SHORTCUT_QUICK_QUESTION = 'CommandOrControl+Enter';

function registerGlobalShortcuts({ globalShortcut, sessionService }) {
  try {
    if (globalShortcut.isRegistered(GLOBAL_SHORTCUT_QUICK_QUESTION)) {
      console.log(`Global shortcut already registered: ${GLOBAL_SHORTCUT_QUICK_QUESTION}`);
      return;
    }

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

    globalShortcut.unregister(GLOBAL_SHORTCUT_QUICK_QUESTION);
    globalShortcut.unregisterAll();
    console.log('Global shortcuts unregistered');
  } catch (error) {
    console.error('Error unregistering global shortcuts:', error);
  }
}

module.exports = {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts,
  GLOBAL_SHORTCUT_QUICK_QUESTION
};

