/**
 * VORTEX v3 — server.js
 * ──────────────────────────────────────────────────────────────────
 * Supports two deployment modes, auto-detected via env vars:
 *
 *   LOCAL mode  (default)
 *     - LAN guard active: only RFC-1918 IPs allowed
 *     - No token required
 *     - Suitable for home/LAN use
 *
 *   PUBLIC mode  (VORTEX_PUBLIC=true)
 *     - LAN guard disabled (internet traffic allowed)
 *     - VORTEX_TOKEN required to protect the API
 *     - Trusts reverse-proxy headers (Nginx / Cloudflare)
 *     - Suitable for cloud VPS + friends access
 *
 * Required env vars for PUBLIC mode:
 *   VORTEX_PUBLIC=true
 *   VORTEX_TOKEN=<any strong secret string>
 *   PORT=3001  (or whatever Nginx proxies to)
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const express     = require('express');
const http        = require('http');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const morgan      = require('morgan');
const path        = require('path');
const os          = require('os');

const apiRoutes    = require('./routes/api');
const { lanGuard } = require('./middleware/lanGuard');
const { limiter, downloadLimiter } = require('./middleware/rateLimiter');
const logger       = require('./utils/logger');

// ── Config ────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT         || '3001', 10);
const ACCESS_TOKEN  = process.env.VORTEX_TOKEN          || null;
const IS_PUBLIC     = process.env.VORTEX_PUBLIC         === 'true';
const TRUST_PROXY   = process.env.TRUST_PROXY           || (IS_PUBLIC ? 1 : false);

if (IS_PUBLIC && !ACCESS_TOKEN) {
  console.error('\n⚠  VORTEX_PUBLIC=true but VORTEX_TOKEN is not set!');
  console.error('   Anyone on the internet can use your server.');
  console.error('   Set VORTEX_TOKEN=<secret> in your .env file.\n');
}

// ── App ───────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// Trust reverse-proxy (Nginx / Caddy / Cloudflare) so req.ip is real client IP
if (TRUST_PROXY) app.set('trust proxy', TRUST_PROXY);

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Skip gzip on /stream — it's raw binary media
app.use((req, res, next) => {
  if (req.path === '/api/stream') return next();
  compression()(req, res, next);
});

app.use(morgan(IS_PUBLIC ? 'combined' : 'dev', {
  stream: { write: m => logger.http(m.trim()) },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cors({ origin: '*' }));

// ── Security layer ────────────────────────────────────────────────
// 1. LAN guard — skipped in PUBLIC mode
if (!IS_PUBLIC) {
  app.use('/api', lanGuard);
}

// 2. Global rate limit
app.use('/api', limiter);

// 3. Token auth — mandatory in PUBLIC mode, optional locally
app.use('/api', (req, res, next) => {
  if (!ACCESS_TOKEN) return next();                                    // no token configured
  const token = req.headers['x-vortex-token']                         // header (desktop)
             || req.query.token                                        // query string (stream URL)
             || req.headers['authorization']?.replace('Bearer ', ''); // bearer token
  if (token === ACCESS_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized. Provide a valid x-vortex-token header.' });
});

// ── Static frontend ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  maxAge: IS_PUBLIC ? '7d' : '1h',
  etag: true,
}));

// ── API routes ────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── SPA fallback ──────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'))
);

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error(`[error] ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips  = [];
  for (const iface of Object.values(nets))
    for (const a of (iface || []))
      if (a.family === 'IPv4' && !a.internal) ips.push(a.address);

  const W = 56, line = '═'.repeat(W);
  const row = t => `║  ${t.padEnd(W - 2)}║`;
  console.log(`\n╔${line}╗`);
  console.log(row(`VORTEX v3  ·  ${IS_PUBLIC ? 'PUBLIC' : 'LOCAL'} mode  ·  Zero Storage`));
  console.log(`╠${line}╣`);
  console.log(row(`Local   →  http://localhost:${PORT}`));
  ips.forEach(ip => console.log(row(`Network →  http://${ip}:${PORT}`)));
  console.log(`╠${line}╣`);
  console.log(row(`Auth token : ${ACCESS_TOKEN ? '✓ set' : '✗ none (open access)'}`));
  console.log(row(`LAN guard  : ${IS_PUBLIC ? 'off (public mode)' : 'on  (local only)'}`));
  console.log(`╚${line}╝\n`);
});

module.exports = { app, server };
