const Sentry = require('@sentry/electron/main');

function initializeSentry(config, meta = {}) {
  if (config.sentry && config.sentry.dsn && config.sentry.dsn !== 'YOUR_SENTRY_DSN_HERE') {
    Sentry.init({
      dsn: config.sentry.dsn,
      environment: config.sentry.environment || 'production',
      tracesSampleRate: config.sentry.tracesSampleRate || 1.0,
      beforeSend(event) {
        if (config.sentry.environment === 'development') {
          console.log('Sentry event (not sent in dev):', event);
          return null;
        }
        return event;
      }
    });

    if (meta.version) {
      Sentry.setTag('app_version', meta.version);
    }
  }

  return Sentry;
}

module.exports = {
  initializeSentry
};

