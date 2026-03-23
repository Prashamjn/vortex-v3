/**
 * utils/logger.js
 * Simple console logger with levels and timestamps.
 */

'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'];

const colors = {
  error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m',
  http: '\x1b[35m', debug: '\x1b[90m', reset: '\x1b[0m',
};

function log(level, message) {
  if (LEVELS[level] > CURRENT_LEVEL) return;
  const ts = new Date().toISOString().slice(11, 23);
  const c  = colors[level] || '';
  console.log(`${c}[${ts}] ${level.toUpperCase().padEnd(5)} ${message}${colors.reset}`);
}

module.exports = {
  error: (m) => log('error', m),
  warn:  (m) => log('warn',  m),
  info:  (m) => log('info',  m),
  http:  (m) => log('http',  m),
  debug: (m) => log('debug', m),
};
