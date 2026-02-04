function registerSessionHandlers({ ipcMain, sessionService, apiService, authService, windowManager, createSessionWindow, BrowserWindow, Notification }) {
  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.ELECTRON_DEV === true;

  const showSessionFailureNotification = (message) => {
    try {
      if (Notification?.isSupported?.()) {
        const notification = new Notification({
          title: 'Session start failed',
          body: message
        });
        notification.show();
      }
    } catch (notificationError) {
      console.error('Failed to display session failure notification:', notificationError);
    }
  };

  const broadcastSessionFailure = (payload) => {
    const allWindows = BrowserWindow.getAllWindows();

    allWindows.forEach((window) => {
      if (window.isDestroyed()) {
        return;
      }

      try {
        window.webContents.send('cleanup-speech-service');
      } catch (error) {
        console.error('Error sending cleanup-speech-service event:', error);
      }

      window.webContents.send('state-update', {
        type: 'SESSION_FAILED',
        payload
      });
    });
  };

  const handleSessionStartFailure = async ({ message, errorType }) => {
    const failureMessage = message || 'Failed to start session. Please try again.';
    const failureType = errorType || 'general';

    try {
      await sessionService.cleanup();
    } catch (cleanupError) {
      console.error('Error during session failure cleanup:', cleanupError);
    }

    const sessionWindow = windowManager.getWindow('session');
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      try {
        sessionWindow.webContents.send('cleanup-speech-service');
      } catch (error) {
        console.error('Error sending cleanup-speech-service to session window:', error);
      }

      if (sessionWindow.speechTimeout) {
        clearTimeout(sessionWindow.speechTimeout);
        sessionWindow.speechTimeout = null;
      }

      sessionWindow.close();
    }

    const payload = {
      status: 'failed',
      error: failureMessage,
      errorType: failureType
    };

    broadcastSessionFailure(payload);
    showSessionFailureNotification(failureMessage);
  };

  let stopInProgress = false;

  const performSessionStop = async ({ source = 'manual', payload } = {}) => {
    if (stopInProgress) {
      console.warn(`Session stop already in progress (source: ${source})`);
      return { success: false, error: 'Session stop already in progress' };
    }

    stopInProgress = true;

    try {
      const sessionWindow = windowManager.getWindow('session');

      if (sessionWindow && !sessionWindow.isDestroyed()) {
        console.log(`[${source}] Sending cleanup signal to session window...`);
        sessionWindow.webContents.send('cleanup-speech-service');

        if (sessionWindow.speechTimeout) {
          clearTimeout(sessionWindow.speechTimeout);
          sessionWindow.speechTimeout = null;
          console.log('Cleared speech timeout');
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const success = await sessionService.stopSession();

      if (success) {
        const refreshedSessionWindow = windowManager.getWindow('session');
        if (refreshedSessionWindow && !refreshedSessionWindow.isDestroyed()) {
          refreshedSessionWindow.close();
          console.log('Session window closed');
        }

        const broadcastPayload = payload === undefined ? null : payload;

        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('state-update', {
              type: 'SESSION_STOPPED',
              payload: broadcastPayload
            });
          }
        });
      }

      return { success };
    } catch (error) {
      console.error('Error performing session stop:', error);
      return { success: false, error: error.message };
    } finally {
      stopInProgress = false;
    }
  };

  ipcMain.handle('session-start', async (event, sessionData) => {
    try {
      const isAuthenticated = await authService.isAuthenticatedAsync();

      if (!isAuthenticated) {
        console.error('Cannot start session: User is not authenticated or token refresh failed');
        await handleSessionStartFailure({ message: 'User is not authenticated', errorType: 'auth' });
        return { success: false, error: 'User is not authenticated', errorType: 'auth' };
      }

      const accessToken = authService.getToken();

      if (!accessToken) {
        console.error('Cannot start session: No access token available');
        await handleSessionStartFailure({ message: 'No access token available', errorType: 'auth' });
        return { success: false, error: 'No access token available', errorType: 'auth' };
      }

      const huddleId = sessionData.assistantId;
      const isTrial = sessionData?.isTrial;
      if (!huddleId) {
        console.error('Cannot start session: assistantId is required');
        await handleSessionStartFailure({ message: 'Assistant ID is required', errorType: 'validation' });
        return { success: false, error: 'Assistant ID is required', errorType: 'validation' };
      }

      console.log('Creating session via API for huddle:', huddleId);

      let sessionResponse;
      try {
        sessionResponse = await apiService.createSession(huddleId, { isTrial });
        console.log('Session created via API:', sessionResponse);
      } catch (apiError) {
        console.error('Failed to create session via API:', apiError);

        if (apiError?.status === 401 || (apiError.message && apiError.message.includes('401'))) {
          await handleSessionStartFailure({ message: 'Authentication failed', errorType: 'auth' });
          return { success: false, error: 'Authentication failed', errorType: 'auth' };
        }

        const cleanedMessage = typeof apiError?.message === 'string' && apiError.message.trim()
          ? apiError.message.trim()
          : 'Failed to create session. Please try again.';

        await handleSessionStartFailure({ message: cleanedMessage, errorType: 'api' });
        return {
          success: false,
          error: cleanedMessage,
          errorType: 'api',
          errorCode: apiError?.code || null
        };
      }

      const sessionId = sessionResponse._id || sessionResponse.id || sessionResponse.sessionId;
      if (!sessionId) {
        console.error('API did not return a valid sessionId');
        await handleSessionStartFailure({ message: 'Invalid session response from API', errorType: 'api' });
        return { success: false, error: 'Invalid session response from API', errorType: 'api' };
      }

      console.log('Starting session with sessionId:', sessionId);
      const success = await sessionService.startSession(sessionData, accessToken, sessionId);

      if (success) {
        console.log('Session started, now creating session window...');

        const sessionWindow = createSessionWindow();
        if (sessionWindow) {
          if (isDev) {
            sessionWindow.webContents.openDevTools({ mode: 'detach' });
          }
        }

        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send('state-update', {
            type: 'SESSION_CONNECTING',
            payload: { ...sessionData, sessionId, status: 'connecting' }
          });
        });

        console.log('Session window created (hidden), waiting for speech service to initialize...');

        if (sessionWindow) {
          const timeoutId = setTimeout(() => {
            console.warn('Speech initialization timeout, showing window anyway');
            if (sessionWindow && !sessionWindow.isDestroyed()) {
              sessionWindow.show();

              BrowserWindow.getAllWindows().forEach((window) => {
                window.webContents.send('state-update', {
                  type: 'SESSION_STARTED',
                  payload: { ...sessionData, sessionId, status: 'ready' }
                });
              });
            }
          }, 10000);

          sessionWindow.speechTimeout = timeoutId;
        }
      }

      if (!success) {
        await handleSessionStartFailure({ message: 'Failed to start session. Please try again.' });
      }
      return { success, sessionId };
    } catch (error) {
      console.error('Error starting session:', error);
      await handleSessionStartFailure({ message: error.message });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('session-stop', async () => {
    try {
      console.log('Stopping session and cleaning up...');
      const result = await performSessionStop({ source: 'manual', payload: null });
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('Error stopping session:', error);
      return { success: false, error: error.message };
    }
  });

  sessionService.on('session_ended', async (data) => {
    console.log('Received session_ended event from backend socket, stopping session...', data);

    const normalizedPayload = (data && typeof data === 'object')
      ? { source: 'backend', ...data }
      : { source: 'backend', reason: data };

    const result = await performSessionStop({
      source: 'backend',
      payload: normalizedPayload
    });

    if (!result.success) {
      console.warn('Failed to perform session stop after backend session_ended event:', result.error);
    }
  });

  ipcMain.handle('session-status', async () => {
    return sessionService.getSessionStatus();
  });

  ipcMain.on('session-window-speech-ready', () => {
    console.log('✅ Speech service initialized in session window');
    const sessionWindow = windowManager.getWindow('session');

    if (sessionWindow && !sessionWindow.isDestroyed()) {
      if (sessionWindow.speechTimeout) {
        clearTimeout(sessionWindow.speechTimeout);
        sessionWindow.speechTimeout = null;
      }

      sessionWindow.show();
      console.log('Session window shown');

      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('state-update', {
          type: 'SESSION_STARTED',
          payload: { status: 'ready' }
        });
      });
    }
  });

  ipcMain.handle('session-send-message', async (event, message) => {
    try {
      const success = sessionService.sendMessageToBackend(message);
      return { success };
    } catch (error) {
      console.error('Error sending message to backend:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('session-send-event', async (event, eventName, data) => {
    try {
      const success = sessionService.sendToBackend(eventName, data);
      return { success };
    } catch (error) {
      console.error('Error sending event to backend:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerSessionHandlers
};

