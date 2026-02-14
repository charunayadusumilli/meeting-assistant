const { app, BrowserWindow, ipcMain, globalShortcut, screen, Notification, session, desktopCapturer } = require('electron');

const { bootstrapApp } = require('./bootstrap');
const { windowManager } = require('./windows/window-manager');
const { createMainWindow } = require('./windows/main-window');
const {
  createSessionWindow,
  positionSessionWindow,
  updateSessionWindowStateFromBounds
} = require('./windows/session-window');
const { createSettingsWindow } = require('./windows/settings-window');
const { createAssistantWindow } = require('./windows/assistant-window');
const { registerGlobalShortcuts, unregisterGlobalShortcuts } = require('./shortcuts/global-shortcuts');
const { startTokenValidationTimer, stopTokenValidationTimer } = require('./timers/token-validation-timer');
const { registerSessionHandlers } = require('./ipc/session-handlers');
const { registerAuthHandlers } = require('./ipc/auth-handlers');
const { registerSettingsHandlers } = require('./ipc/settings-handlers');
const { registerGeneralHandlers } = require('./ipc/general-handlers');
const { registerApiHandlers } = require('./ipc/api-handlers');
const { registerAppEvents } = require('./lifecycle/app-events');
const { registerSystemEvents } = require('./lifecycle/system-events');
const { registerProtocolHandler } = require('./lifecycle/protocol-handler');

const { sessionService } = require('./services/session-service');
const { authService } = require('./services/auth-service');
const { apiService } = require('./services/api-service');

const path = require('path');
const { fork } = require('child_process');

app.setAppUserModelId('MeetingAssistant');

// Override branding from compiled .exe (was "HuddleMate")
app.setName('Meeting Assistant');
if (app.setProductName) app.setProductName('Meeting Assistant');

let backendProcess = null;

function startBackend() {
  return new Promise((resolve) => {
    const serverPath = path.resolve(__dirname, '..', '..', 'backend', 'src', 'server.js');
    console.log('[Backend] Starting:', serverPath);

    backendProcess = fork(serverPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' }
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trimEnd()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend] ${data.toString().trimEnd()}`);
    });

    backendProcess.on('error', (err) => {
      console.error('[Backend] Failed to start:', err.message);
      backendProcess = null;
      resolve();
    });

    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Exited with code ${code}`);
      backendProcess = null;
    });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    let attempts = 0;
    const maxAttempts = 20;
    const pollInterval = 500;

    const poll = setInterval(() => {
      attempts++;
      fetch(`${backendUrl}/health`)
        .then((res) => {
          if (res.ok) {
            clearInterval(poll);
            console.log(`[Backend] Ready after ${attempts * pollInterval}ms`);
            resolve();
          }
        })
        .catch(() => {
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            console.warn(`[Backend] Health check timed out after ${maxAttempts * pollInterval}ms, continuing anyway`);
            resolve();
          }
        });
    }, pollInterval);
  });
}

function stopBackend() {
  if (backendProcess) {
    console.log('[Backend] Stopping...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

const { config, store } = bootstrapApp(path.resolve(__dirname));

sessionService.initialize(config);
authService.initialize(config);
apiService.initialize(config, authService);
sessionService.setAuthService(authService);

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const serviceListeners = {
    sessionAnswer: (data) => {
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('session-answer', data);
      });
    },

    sessionResponseStart: (data) => {
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('session-response-start', data);
      });
    },

    sessionResponseEnd: (data) => {
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('session-response-end', data);
      });
    },

    sessionClear: (data) => {
      console.log('Forwarding clear event to renderer windows:', data);
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('session-clear', data);
      });
    },

    authAuthenticated: (data) => {
      console.log('Forwarding authenticated event to renderer windows:', data);

      if (data.accessToken) {
        sessionService.updateAccessToken(data.accessToken);
      }

      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('auth-state-changed', { authenticated: true });
      });
    },

    authLoggedOut: () => {
      console.log('Forwarding logged-out event to renderer windows');
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('auth-state-changed', { authenticated: false });
      });
    },

    authError: (error) => {
      console.error('Auth error:', error);
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        window.webContents.send('auth-error', error);
      });
    },

    sessionTranscript: (data) => {
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send('session-transcript', data);
        }
      });
    }
  };

  sessionService.on('answer', serviceListeners.sessionAnswer);
  sessionService.on('response_start', serviceListeners.sessionResponseStart);
  sessionService.on('response_end', serviceListeners.sessionResponseEnd);
  sessionService.on('clear', serviceListeners.sessionClear);
  sessionService.on('transcript', serviceListeners.sessionTranscript);
  authService.on('authenticated', serviceListeners.authAuthenticated);
  authService.on('logged-out', serviceListeners.authLoggedOut);
  authService.on('auth-error', serviceListeners.authError);

  authService.on('logged-out', async () => {
    console.log('User logged out, cleaning up active sessions...');

    try {
      if (sessionService.isActive) {
        console.log('Active session detected, stopping...');
        await sessionService.stopSession();

        const sessionWindow = windowManager.getWindow('session');
        if (sessionWindow && !sessionWindow.isDestroyed()) {
          sessionWindow.close();
          console.log('Session window closed');
        }

        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('state-update', {
              type: 'SESSION_STOPPED',
              payload: null
            });
          }
        });
      }

      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send('state-update', {
            type: 'AUTH_STATUS_CHANGED',
            payload: { authenticated: false }
          });
        }
      });

      console.log('Session cleanup on logout completed');
    } catch (error) {
      console.error('Error cleaning up sessions on logout:', error);
    }
  });

  function createAppMainWindow() {
    return createMainWindow({
      config,
      store,
      BrowserWindow,
      windowManager
    });
  }

  app.on('before-quit', () => stopBackend());

  app.whenReady().then(async () => {
    await startBackend();
    createAppMainWindow();

    if (config.auth?.disabled) {
      const localToken = authService.getToken() || 'local-dev-token';
      sessionService.updateAccessToken(localToken);

      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send('auth-state-changed', { authenticated: true });
          window.webContents.send('state-update', {
            type: 'AUTH_STATUS_CHANGED',
            payload: { authenticated: true }
          });
        }
      });
    }

    console.log('Updates disabled in local build');

    startTokenValidationTimer({ authService });

    registerGlobalShortcuts({ globalShortcut, sessionService });

    session.defaultSession.setDisplayMediaRequestHandler(async (event, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window']
        });

        if (!sources || sources.length === 0) {
          callback({ video: null, audio: null });
          return;
        }

        callback({
          video: sources[0],
          audio: 'loopback'
        });
      } catch (error) {
        console.error('Error getting sources for system audio loopback capture:', error);
        try {
          callback({ video: null, audio: null });
        } catch (_) {
          // ignore
        }
      }
    });

    console.log('Checking for protocol URL in argv...');
    console.log('Process argv:', process.argv);
    const protocolUrl = process.argv.find(arg => arg.startsWith('meetingassistant://'));
    const openAssistantWindow = () => createAssistantWindow({ windowManager, BrowserWindow });
    if (protocolUrl) {
      console.log('✅ App opened with protocol URL:', protocolUrl);

      if (protocolUrl.startsWith('meetingassistant://create-assistant')) {
        setTimeout(() => openAssistantWindow(), 300);
      } else {
        setTimeout(() => {
          authService.handleCallback(protocolUrl);
        }, 1000);
      }
    } else {
      console.log('No protocol URL found in argv');
    }

    registerSystemEvents({ app, authService, windowManager, BrowserWindow });
    registerAppEvents({
      app,
      windowManager,
      stopTokenValidationTimer,
      unregisterGlobalShortcuts,
      sessionService,
      authService,
      serviceListeners,
      createMainWindow: createAppMainWindow,
      BrowserWindow
    });
    registerProtocolHandler({ app, authService, windowManager, BrowserWindow, createAssistantWindow: () => createAssistantWindow({ windowManager, BrowserWindow }) });

    registerSessionHandlers({
      ipcMain,
      sessionService,
      apiService,
      authService,
      windowManager,
      BrowserWindow,
      createSessionWindow: () => createSessionWindow({ store, windowManager, BrowserWindow }),
      Notification
    });

    registerAuthHandlers({
      ipcMain,
      authService,
      sessionService,
      windowManager
    });

    registerSettingsHandlers({
      ipcMain,
      windowManager,
      store,
      app
    });

    registerGeneralHandlers({
      ipcMain,
      windowManager,
      store,
      config,
      createSessionWindow: () => createSessionWindow({ store, windowManager, BrowserWindow }),
      createSettingsWindow: () => createSettingsWindow({ windowManager, BrowserWindow, screen, store }),
      createAssistantWindow: () => createAssistantWindow({ windowManager, BrowserWindow }),
      positionSessionWindow,
      updateSessionWindowStateFromBounds,
      BrowserWindow,
      screen,
      apiService
    });

    registerApiHandlers({
      ipcMain,
      apiService
    });

    ipcMain.on('client-log', (event, data) => {
      console.log(`[RendererLog][${event.sender.getTitle() || 'Unknown'}]`, data);
      // Forward to backend for server-side logging
      fetch('http://localhost:3000/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'info', msg: `Renderer[${event.sender.getTitle()}]`, data })
      }).catch(() => { });
    });
  });
}

process.on('uncaughtException', (error) => {
  const log = require('./bootstrap/logger');
  log.error('Uncaught Exception:', error);
  log.error('Stack trace:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  const log = require('./bootstrap/logger');
  log.error('Unhandled Promise Rejection:', reason);
  log.error('Promise:', promise);
});