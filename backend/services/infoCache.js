/**
 * services/infoCache.js
 * ──────────────────────────────────────────────────────────────────
 * In-memory LRU-like cache for video metadata.
 * Reduces repeated yt-dlp --dump-json calls for the same URL.
 * TTL: 30 minutes. Max entries: 50.
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const TTL_MS    = 30 * 60 * 1000;  // 30 min
const MAX_ITEMS = 50;

/** @type {Map<string, { data: any, expiresAt: number }>} */
const store = new Map();

/** Normalise URL — strip tracking params but keep video ID */
function normaliseUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const v = u.searchParams.get('v');
    if (v) return `https://www.youtube.com/watch?v=${v}`;
    return url.split('?')[0]; // youtu.be/ID etc.
  } catch { return url; }
}

function get(url) {
  const key = normaliseUrl(url);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data;
}

function set(url, data) {
  // Evict oldest if at capacity
  if (store.size >= MAX_ITEMS) {
    const oldest = [...store.entries()].sort((a,b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) store.delete(oldest[0]);
  }
  store.set(normaliseUrl(url), { data, expiresAt: Date.now() + TTL_MS });
}

function clear() { store.clear(); }

function stats() {
  return { size: store.size, maxSize: MAX_ITEMS, ttlMin: TTL_MS / 60000 };
}

module.exports = { get, set, clear, stats };
