const { shell } = require('electron');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  'localhost',
  '127.0.0.1'
];

const DEFAULT_ALLOWED_PROTOCOLS = new Set([
  'file:',
  'about:',
  'devtools:',
  'chrome-devtools:'
]);

function buildAllowedOrigins(additionalOrigins = []) {
  const origins = new Set([...DEFAULT_ALLOWED_ORIGINS]);

  if (process.env.ELECTRON_DEV === 'true') {
    origins.add('http://localhost:5000');
    origins.add('http://127.0.0.1:5000');
  }

  additionalOrigins.forEach((origin) => {
    if (origin) {
      origins.add(origin);
    }
  });

  return origins;
}

function isHostSuffixAllowed(hostname, allowedHostSuffixes) {
  if (!hostname) {
    return false;
  }

  const normalizedHostname = hostname.toLowerCase();

  return allowedHostSuffixes.some((suffix) => {
    const normalizedSuffix = suffix.toLowerCase();
    return (
      normalizedHostname === normalizedSuffix ||
      normalizedHostname.endsWith(`.${normalizedSuffix}`)
    );
  });
}

function isAllowedUrl(
  url,
  allowedOrigins,
  allowedProtocols = DEFAULT_ALLOWED_PROTOCOLS,
  allowedHostSuffixes = DEFAULT_ALLOWED_HOST_SUFFIXES
) {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);

    if (allowedProtocols.has(parsedUrl.protocol)) {
      return true;
    }

    const { origin, hostname, protocol } = parsedUrl;

    if (allowedOrigins.has(origin)) {
      return true;
    }

    if (protocol === 'https:' && isHostSuffixAllowed(hostname, allowedHostSuffixes)) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

function openExternalSafely(url) {
  if (!url) {
    return;
  }

  try {
    shell.openExternal(url);
  } catch (error) {
    console.error('Failed to open external URL safely:', error);
  }
}

function setupNavigationGuards(browserWindow, options = {}) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return;
  }

  const {
    additionalAllowedOrigins = [],
    additionalAllowedProtocols = [],
    additionalAllowedHostSuffixes = []
  } = options;
  const allowedOrigins = buildAllowedOrigins(additionalAllowedOrigins);
  const allowedProtocols = new Set([...DEFAULT_ALLOWED_PROTOCOLS, ...additionalAllowedProtocols]);
  const allowedHostSuffixes = [
    ...DEFAULT_ALLOWED_HOST_SUFFIXES,
    ...additionalAllowedHostSuffixes
  ];

  const { webContents } = browserWindow;

  if (!webContents || webContents.__hmNavigationGuardsAttached) {
    return;
  }

  const isSafe = (url) => isAllowedUrl(url, allowedOrigins, allowedProtocols, allowedHostSuffixes);

  const handleBlockedNavigation = (event, url) => {
    if (!isSafe(url)) {
      event.preventDefault();
      openExternalSafely(url);
    }
  };

  webContents.on('will-navigate', handleBlockedNavigation);

  webContents.on('new-window', (event, url) => {
    handleBlockedNavigation(event, url);
  });

  if (typeof webContents.setWindowOpenHandler === 'function') {
    webContents.setWindowOpenHandler(({ url }) => {
      if (isSafe(url)) {
        return { action: 'allow' };
      }

      openExternalSafely(url);
      return { action: 'deny' };
    });
  }

  webContents.__hmNavigationGuardsAttached = true;
}

module.exports = {
  setupNavigationGuards,
  isAllowedUrl
};

