const { BrowserWindow } = require('electron');

function registerAppEvents({
  app,
  windowManager,
  stopTokenValidationTimer,
  unregisterGlobalShortcuts,
  globalShortcut,
  sessionService,
  authService,
  serviceListeners,
  createMainWindow
}) {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    stopTokenValidationTimer();
    unregisterGlobalShortcuts({ globalShortcut });
  });

  app.on('before-quit', async () => {
    const log = require('../bootstrap/logger');
    log.info('App is closing, cleaning up services...');

    stopTokenValidationTimer();
    unregisterGlobalShortcuts({ globalShortcut });
    log.info('Token validation timer stopped');

    sessionService.off('answer', serviceListeners.sessionAnswer);
    sessionService.off('clear', serviceListeners.sessionClear);
    authService.off('authenticated', serviceListeners.authAuthenticated);
    authService.off('logged-out', serviceListeners.authLoggedOut);
    authService.off('auth-error', serviceListeners.authError);
    log.info('Service event listeners removed');

    windowManager.clearAllIntervals();
    log.info('Window intervals cleared');

    await sessionService.cleanup();

    log.info('='.repeat(80));
    log.info('Meeting Assistant Application Shutdown Complete');
    log.info('='.repeat(80));
  });
}

module.exports = {
  registerAppEvents
};

