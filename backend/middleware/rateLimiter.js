/**
 * middleware/rateLimiter.js
 * Tighter limits in PUBLIC mode to prevent abuse.
 */

'use strict';

const rateLimit = require('express-rate-limit');

const IS_PUBLIC = process.env.VORTEX_PUBLIC === 'true';

/** General API: 60/min public, 120/min local */
const limiter = rateLimit({
  windowMs:       60 * 1000,
  max:            IS_PUBLIC ? 60 : 120,
  standardHeaders: true,
  legacyHeaders:   false,
  message:        { error: 'Too many requests. Slow down.' },
  keyGenerator:   (req) => req.ip,
});

/** Stream endpoint: 5/min public, 15/min local */
const downloadLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            IS_PUBLIC ? 5 : 15,
  standardHeaders: true,
  legacyHeaders:   false,
  message:        { error: 'Stream rate limit hit. Max 5 downloads/minute.' },
  keyGenerator:   (req) => req.ip,
});

module.exports = { limiter, downloadLimiter };
