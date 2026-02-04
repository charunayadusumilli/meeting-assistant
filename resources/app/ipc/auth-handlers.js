const { BrowserWindow } = require('electron');

function registerAuthHandlers({ ipcMain, authService, sessionService, windowManager }) {
  ipcMain.handle('auth-check', async () => {
    return {
      authenticated: authService.isAuthenticated()
    };
  });

  ipcMain.handle('auth-login', async () => {
    try {
      const success = await authService.login();
      return { success };
    } catch (error) {
      console.error('Error starting login:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth-logout', async () => {
    try {
      console.log('Logout initiated - stopping sessions and services...');

      if (sessionService.isActive) {
        console.log('Active session detected, stopping session...');

        await sessionService.stopSession();

        const sessionWindow = windowManager.getWindow('session');
        if (sessionWindow && !sessionWindow.isDestroyed()) {
          sessionWindow.close();
          console.log('Session window closed');
        }

        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('state-update', {
              type: 'SESSION_STOPPED',
              payload: null
            });
          }
        });
      }

      const success = await authService.logout();

      console.log('Logout completed successfully - user settings preserved');
      return { success };
    } catch (error) {
      console.error('Error during logout:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth-get-token', async () => ({
    token: authService.getToken()
  }));

  ipcMain.handle('auth-test-callback', async (event, callbackUrl) => {
    try {
      console.log('🧪 Manual callback test triggered');
      await authService.handleCallback(callbackUrl);
      return { success: true };
    } catch (error) {
      console.error('Error in manual callback test:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth-get-pending-state', async () => {
    try {
      const pendingAuth = authService.getPendingAuth();
      return pendingAuth ? { state: pendingAuth.state } : null;
    } catch (error) {
      console.error('Error getting pending auth state:', error);
      return null;
    }
  });
}

module.exports = {
  registerAuthHandlers
};

