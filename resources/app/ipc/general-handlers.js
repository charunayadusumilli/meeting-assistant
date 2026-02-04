const { desktopCapturer, screen: electronScreen, app } = require('electron');
const fs = require('fs');
const path = require('path');

function registerGeneralHandlers({
  ipcMain,
  windowManager,
  store,
  config,
  createSessionWindow,
  createSettingsWindow,
  positionSessionWindow,
  updateSessionWindowStateFromBounds,
  BrowserWindow,
  screen,
  apiService
}) {
  ipcMain.on('open-session-window', () => {
    createSessionWindow({ store, windowManager, BrowserWindow });
  });

  ipcMain.on('open-settings-window', () => {
    createSettingsWindow({ windowManager, BrowserWindow, screen, store });
  });

  ipcMain.on('close-child-window', (event, windowName) => {
    windowManager.closeWindow(windowName);
  });

  ipcMain.on('hide-session-window', () => {
    const sessionWindow = windowManager.getWindow('session');
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      const bounds = sessionWindow.getBounds();
      updateSessionWindowStateFromBounds(bounds);
      sessionWindow.hide();
      console.log('Session window hidden');
    }
  });

  ipcMain.on('show-session-window', () => {
    const sessionWindow = windowManager.getWindow('session');
    const mainWindow = windowManager.getMainWindow();

    if (sessionWindow && !sessionWindow.isDestroyed()) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        positionSessionWindow(sessionWindow, mainWindow);
        const alignedBounds = sessionWindow.getBounds();
        updateSessionWindowStateFromBounds(alignedBounds);
        console.log('Session window repositioned to:', alignedBounds);
      }

      sessionWindow.show();
      console.log('Session window shown');
    }
  });

  ipcMain.handle('get-window-bounds', (event, windowName) => {
    const window = windowName === 'main'
      ? windowManager.getMainWindow()
      : windowManager.getWindow(windowName);

    if (window && !window.isDestroyed()) {
      return window.getBounds();
    }
    return null;
  });

  ipcMain.on('resize-session-window', (event, bounds) => {
    const sessionWindow = windowManager.getWindow('session');
    if (sessionWindow && !sessionWindow.isDestroyed()) {
      sessionWindow.setBounds(bounds, false);
      updateSessionWindowStateFromBounds(bounds);
    }
  });

  ipcMain.on('broadcast-state', (event, stateUpdate) => {
    const allWindows = BrowserWindow.getAllWindows();

    allWindows.forEach((window) => {
      if (window.webContents !== event.sender) {
        window.webContents.send('state-update', stateUpdate);
      }
    });
  });

  const getSpeechTokenPayload = async () => {
    if (!apiService || typeof apiService.fetchSpeechToken !== 'function') {
      throw new Error('Speech token service is not available');
    }

    const tokenInfo = await apiService.fetchSpeechToken();
    const region = typeof tokenInfo.region === 'string' ? tokenInfo.region.trim() : '';

    if (!region) {
      throw new Error('Speech token did not include a region');
    }

    return {
      region,
      mode: 'token',
      token: tokenInfo.token,
      expiresAt: tokenInfo.expiresAt,
      expiresIn: tokenInfo.expiresIn
    };
  };

  ipcMain.handle('get-speech-config', async () => {
    console.log('Providing token-based speech config to renderer');
    return getSpeechTokenPayload();
  });

  ipcMain.handle('get-create-assistant-url', async () => {
    return 'meetingassistant://create-assistant';
  });

  ipcMain.handle('get-sentry-config', async () => {
    return config.sentry || null;
  });

  ipcMain.handle('capture-and-upload-screenshot', async () => {
    try {
      console.log('Starting screenshot capture and local save...');

      const primaryDisplay = electronScreen.getPrimaryDisplay();
      const { size, scaleFactor } = primaryDisplay;

      const thumbnailSize = {
        width: Math.floor(size.width * scaleFactor),
        height: Math.floor(size.height * scaleFactor)
      };

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize
      });

      const source = sources[0];
      if (!source.thumbnail || source.thumbnail.isEmpty()) {
        throw new Error('Failed to capture screen thumbnail');
      }

      const maxWidth = 1920;
      const maxHeight = 1080;
      const quality = 0.85;

      let resizedThumbnail = source.thumbnail;
      const originalSize = source.thumbnail.getSize();

      if (originalSize.width > maxWidth || originalSize.height > maxHeight) {
        const resizeScale = Math.min(
          maxWidth / originalSize.width,
          maxHeight / originalSize.height
        );
        const newWidth = Math.floor(originalSize.width * resizeScale);
        const newHeight = Math.floor(originalSize.height * resizeScale);

        resizedThumbnail = source.thumbnail.resize({
          width: newWidth,
          height: newHeight,
          quality: 'good'
        });
        console.log(`Resized screenshot from ${originalSize.width}x${originalSize.height} to ${newWidth}x${newHeight}`);
      }

      const jpegBuffer = resizedThumbnail.toJPEG(Math.floor(quality * 100));
      const dataURL = resizedThumbnail.toDataURL();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const originalFilename = `screenshot-${timestamp}.jpg`;
      const name = `Screenshot ${timestamp}`;
      const fileSize = jpegBuffer.length;

      const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
      fs.mkdirSync(attachmentsDir, { recursive: true });

      const filePath = path.join(attachmentsDir, originalFilename);
      fs.writeFileSync(filePath, jpegBuffer);

      const fileUrl = 'file://' + filePath.replace(/\\/g, '/');

      return {
        success: true,
        attachment: {
          id: `screenshot-${Date.now()}`,
          name,
          originalFilename,
          type: 'image/jpeg',
          size: fileSize,
          fileKey: null,
          fileUrl,
          documentId: null,
          previewUrl: fileUrl || dataURL,
          localPath: filePath,
          uploadedAt: Date.now(),
          status: 'ready'
        }
      };
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to capture screenshot'
      };
    }
  });
}

module.exports = {
  registerGeneralHandlers
};
