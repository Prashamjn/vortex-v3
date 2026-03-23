/**
 * middleware/lanGuard.js
 * ──────────────────────────────────────────────────────────────────
 * Blocks API requests from IPs outside the local network.
 * Allows: 127.x, 10.x, 172.16–31.x, 192.168.x, ::1 (IPv6 loopback).
 * Set DISABLE_LAN_GUARD=true env var to bypass (dev only).
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const DISABLE = process.env.DISABLE_LAN_GUARD === 'true';

const LOCAL_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:10\./,
  /^::ffff:192\.168\./,
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./,
];

function isLocalIp(ip) {
  return LOCAL_PATTERNS.some(p => p.test(ip));
}

function lanGuard(req, res, next) {
  if (DISABLE) return next();

  const ip = req.ip || req.connection?.remoteAddress || '';
  if (isLocalIp(ip)) return next();

  console.warn(`[lanGuard] Blocked request from ${ip} → ${req.path}`);
  return res.status(403).json({
    error: 'Access denied. VORTEX API is accessible on local network only.',
    ip,
  });
}

module.exports = { lanGuard, isLocalIp };
