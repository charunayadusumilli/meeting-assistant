

const path = require('path');
const fs = require('fs');

function loadConfig(rootDir) {
  console.log(rootDir);
  let config = {
    apiUrl: 'http://127.0.0.1:3000',
    createAssistantUrl: 'http://127.0.0.1:3000/assistants/new',
    auth: {
      disabled: true,
      authUrl: 'http://127.0.0.1:3000/api/oauth/authorize',
      tokenUrl: 'http://127.0.0.1:3000/api/oauth/token',
      revokeUrl: 'http://127.0.0.1:3000/api/oauth/revoke',
      clientId: 'local-dev',
      clientSecret: 'local-dev',
      scope: 'openid profile email'
    },
    window: {
      widthDivisor: 4,
      height: 80,
      topOffset: 200
    },
    backend: {
      websocketUrl: 'http://127.0.0.1:3000'
    },
    speech: {
      microsoft: {
        region: 'local',
        subscriptionKey: ''
      },
      defaultTokenTtlSeconds: 600
    },
    sentry: {
      dsn: '',
      environment: 'local',
      tracesSampleRate: 0.0
    },
    updates: {
      disabled: true
    }
  };

  try {
    const configPath = path.join(rootDir, 'config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

  return config;
}

module.exports = {
  loadConfig
};

