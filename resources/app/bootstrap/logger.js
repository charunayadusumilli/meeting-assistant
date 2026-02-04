const log = require('electron-log');

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

console.log = log.log;
console.info = log.info;
console.warn = log.warn;
console.error = log.error;
console.debug = log.debug;

module.exports = log;

