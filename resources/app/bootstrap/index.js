const path = require('path');
const logger = require('./logger');
const { loadConfig } = require('./app-bootstrap');
const { initializeSentry } = require('./sentry');
const { createStore } = require('../config/store');
const mainPackageJson = require(path.join(__dirname, '..', 'package.json'));

function bootstrapApp(rootDir) {
  const config = loadConfig(rootDir);
  config.version = mainPackageJson.version;
  const sentry = initializeSentry(config, { version: mainPackageJson.version });
  const store = createStore();

  logger.info('='.repeat(80));
  logger.info('Meeting Assistant Application Starting');
  logger.info('='.repeat(80));
  logger.info(`Log file location: ${logger.transports.file.getFile().path}`);
  logger.info(`App version: ${mainPackageJson.version}`);
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Architecture: ${process.arch}`);

  return { config, sentry, store, logger };
}

module.exports = {
  bootstrapApp
};

