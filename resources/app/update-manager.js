const { BrowserWindow } = require('electron');

const defaultState = {
  status: 'idle',
  downloaded: false,
  version: null,
  releaseNotes: null,
  downloadedAt: null,
  downloadProgress: null,
  error: null
};

let updateState = { ...defaultState };
let autoUpdater = null;
let initialized = false;

function cloneState() {
  return {
    ...updateState,
    downloadProgress: updateState.downloadProgress
      ? { ...updateState.downloadProgress }
      : null
  };
}

function broadcastUpdateState() {
  const state = cloneState();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('update-status-changed', state);
    }
  });
}

function setUpdateState(patch, { reset = false } = {}) {
  if (reset) {
    updateState = { ...defaultState, ...patch };
  } else {
    updateState = { ...updateState, ...patch };
  }

  broadcastUpdateState();
}

function sanitizeVersion(info) {
  if (!info) {
    return null;
  }

  return (
    info.version ||
    info.releaseVersion ||
    info.releaseName ||
    (info.release && (info.release.version || info.release.name)) ||
    null
  );
}

function sanitizeReleaseNotes(info) {
  if (!info) {
    return null;
  }

  return info.releaseNotes || info.notes || null;
}

function sanitizeProgress(progress) {
  if (!progress) {
    return null;
  }

  const percent = typeof progress.percent === 'number' ? progress.percent : null;
  const transferred = typeof progress.transferred === 'number' ? progress.transferred : null;
  const total = typeof progress.total === 'number' ? progress.total : null;

  return {
    percent,
    transferred,
    total,
    bytesPerSecond: typeof progress.bytesPerSecond === 'number' ? progress.bytesPerSecond : null
  };
}

function initializeUpdateManager({ todesktop }) {
  if (initialized) {
    return;
  }

  if (!todesktop || !todesktop.autoUpdater) {
    console.warn('[update-manager] todesktop autoUpdater is not available. Skipping initialization.');
    return;
  }

  autoUpdater = todesktop.autoUpdater;
  initialized = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking', error: null, downloaded: false });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateState(
      {
        status: 'available',
        version: sanitizeVersion(info),
        releaseNotes: sanitizeReleaseNotes(info),
        downloaded: false,
        downloadProgress: null,
        error: null
      },
      { reset: true }
    );
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      status: 'downloading',
      downloadProgress: sanitizeProgress(progress),
      downloaded: false
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState(
      {
        status: 'downloaded',
        downloaded: true,
        version: sanitizeVersion(info),
        releaseNotes: sanitizeReleaseNotes(info),
        downloadedAt: new Date().toISOString(),
        downloadProgress: { percent: 100, transferred: null, total: null, bytesPerSecond: null },
        error: null
      }
    );
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({}, { reset: true });
  });

  autoUpdater.on('error', (error) => {
    setUpdateState({
      status: 'error',
      error: error?.message || String(error)
    });
  });

  try {
    const checkResult = autoUpdater.checkForUpdates();
    if (checkResult && typeof checkResult.catch === 'function') {
      checkResult.catch((error) => {
        console.error('[update-manager] Failed to check for updates:', error);
      });
    }
  } catch (error) {
    console.error('[update-manager] Failed to initiate update check:', error);
  }
}

function getUpdateState() {
  return cloneState();
}

function sendUpdateStateToWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send('update-status-changed', cloneState());
}

function requestUpdateInstall() {
  if (!autoUpdater) {
    return { success: false, error: 'Updater not initialized' };
  }

  if (!updateState.downloaded) {
    return { success: false, error: 'Update not ready to install' };
  }

  try {
    setUpdateState({ status: 'installing' });
    autoUpdater.restartAndInstall();
    return { success: true };
  } catch (error) {
    const message = error?.message || String(error);
    setUpdateState({ status: 'error', error: message });
    return { success: false, error: message };
  }
}

module.exports = {
  initializeUpdateManager,
  getUpdateState,
  sendUpdateStateToWindow,
  requestUpdateInstall
};


