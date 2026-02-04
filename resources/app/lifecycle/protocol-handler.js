const path = require('path');

function registerProtocolHandler({ app, authService, windowManager, createAssistantWindow }) {
  console.log('Registering meetingassistant:// protocol handler...');

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const success = app.setAsDefaultProtocolClient('meetingassistant', process.execPath, [path.resolve(process.argv[1])]);
      console.log('Protocol handler registered (dev mode):', success);
    }
  } else {
    const success = app.setAsDefaultProtocolClient('meetingassistant');
    console.log('Protocol handler registered (production mode):', success);
  }

  console.log('Is default protocol client for meetingassistant:', app.isDefaultProtocolClient('meetingassistant'));

  app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('🔔 open-url event triggered!');
    console.log('Received custom protocol URL:', url);

    if (url.startsWith('meetingassistant://create-assistant')) {
      console.log('Opening local create-assistant window');

      const openWindow = () => {
        const win = createAssistantWindow && createAssistantWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
        }
      };

      if (!app.isReady()) {
        app.whenReady().then(openWindow);
      } else {
        openWindow();
      }
      return;
    }

    if (url.startsWith('meetingassistant://callback')) {
      console.log('✅ This is an OAuth callback!');

      if (!app.isReady()) {
        app.whenReady().then(() => {
          const mainWindow = windowManager.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
          }

          authService.handleCallback(url);
        });
      } else {
        const mainWindow = windowManager.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
        }

        authService.handleCallback(url);
      }
    }
  });
}

module.exports = {
  registerProtocolHandler
};

