const { BrowserWindow, powerMonitor } = require('electron');

function registerSystemEvents({ app, authService, windowManager }) {

  powerMonitor.on('resume', async () => {
    console.log('System resumed from sleep, checking authentication status...');

    try {
      const isAuthenticated = await authService.isAuthenticatedAsync();
      console.log('Authentication status after resume:', isAuthenticated);

      if (!isAuthenticated) {
        console.log('Token expired/invalid after system sleep, broadcasting logged-out event');
        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('state-update', {
              type: 'AUTH_STATUS_CHANGED',
              payload: { authenticated: false }
            });
          }
        });

        authService.emit('logged-out');
      } else {
        console.log('Token valid or successfully refreshed after system resume');
      }
    } catch (error) {
      console.error('Error checking auth status after resume:', error);
    }
  });

  powerMonitor.on('suspend', () => {
    console.log('System is going to sleep...');
  });

  app.on('second-instance', (event, commandLine) => {
    console.log('🔔 second-instance event triggered!');
    console.log('Command line:', commandLine);

    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
    }

    const url = commandLine.find(arg => arg.startsWith('meetingassistant://'));
    if (url) {
      console.log('✅ OAuth callback detected in second instance!');
      console.log('Received OAuth callback from second instance:', url);
      authService.handleCallback(url);
    }
  });
}

module.exports = {
  registerSystemEvents
};

