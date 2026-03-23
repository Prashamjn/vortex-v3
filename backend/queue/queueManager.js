/**
 * queue/queueManager.js
 * ──────────────────────────────────────────────────────────────────
 * Advanced download queue with:
 *  - Priority levels (high / normal / low)
 *  - Auto-retry on transient failures (max 2 retries)
 *  - Configurable concurrency
 *  - Subtitle & thumbnail download options
 *  - Playlist batch support (items added individually)
 *  - Per-item ETA estimation
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const { v4: uuid } = require('uuid');
const logger    = require('../utils/logger');

// ── Config ────────────────────────────────────────────────────────
const MAX_CONCURRENT  = parseInt(process.env.MAX_CONCURRENT || '3', 10);
const MAX_AUTO_RETRY  = 2;
const DOWNLOADS_DIR   = path.join(__dirname, '..', '..', 'downloads');

// ── State ─────────────────────────────────────────────────────────
/** @type {Map<string, DownloadItem>} */
const queue = new Map();

/** @type {import('socket.io').Server|null} */
let io = null;

// ── Types (JSDoc) ─────────────────────────────────────────────────
/**
 * @typedef {Object} DownloadItem
 * @property {string}  id
 * @property {string}  url
 * @property {string}  title
 * @property {string}  thumbnail
 * @property {string}  duration
 * @property {string}  channel
 * @property {'mp4'|'mp3'} format
 * @property {string}  quality
 * @property {'high'|'normal'|'low'} priority
 * @property {'pending'|'downloading'|'completed'|'failed'|'cancelled'} status
 * @property {number}  progress      0–100
 * @property {string}  speed
 * @property {string}  eta
 * @property {string}  fileSize
 * @property {string}  filename
 * @property {string}  downloadUrl
 * @property {string}  error
 * @property {string}  addedBy
 * @property {number}  retryCount
 * @property {boolean} withSubtitles
 * @property {boolean} withThumbnail
 * @property {string}  createdAt
 * @property {string|null} completedAt
 * @property {ChildProcess|null} _proc
 */

// ── Public API ────────────────────────────────────────────────────

/** Wire up Socket.io — must be called once from server.js */
function init(socketIoServer) {
  io = socketIoServer;
  // Ensure downloads dir
  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

/** Sorted queue snapshot (high priority first, then by createdAt desc) */
function getAll() {
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  return Array.from(queue.values())
    .sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pd !== 0) return pd;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

/** Add a new download item and trigger processing */
function add(params) {
  const id = uuid();
  /** @type {DownloadItem} */
  const item = {
    id,
    url:           params.url,
    title:         params.title        || 'Unknown',
    thumbnail:     params.thumbnail    || '',
    duration:      params.duration     || '0:00',
    channel:       params.channel      || 'Unknown',
    format:        params.format       || 'mp4',
    quality:       params.quality      || '720p',
    priority:      params.priority     || 'normal',
    withSubtitles: params.withSubtitles || false,
    withThumbnail: params.withThumbnail || false,
    status:        'pending',
    progress:      0,
    speed:         '',
    eta:           '',
    fileSize:      '',
    filename:      '',
    downloadUrl:   '',
    error:         '',
    addedBy:       params.addedBy || 'unknown',
    retryCount:    0,
    createdAt:     new Date().toISOString(),
    completedAt:   null,
    _proc:         null,
  };
  queue.set(id, item);
  broadcast();
  processNext();
  return item;
}

/** Update fields on an item and broadcast */
function update(id, fields) {
  const item = queue.get(id);
  if (!item) return;
  Object.assign(item, fields);
  broadcast();
}

/** Remove item (cancels active download if running) */
function remove(id) {
  const item = queue.get(id);
  if (!item) return;
  if (item._proc) { try { item._proc.kill('SIGTERM'); } catch {} }
  queue.delete(id);
  broadcast();
}

/** Cancel an active download gracefully */
function cancel(id) {
  const item = queue.get(id);
  if (!item) return false;
  if (item._proc) { try { item._proc.kill('SIGTERM'); } catch {} }
  update(id, { status: 'cancelled', progress: 0, speed: '', eta: '' });
  processNext();
  return true;
}

/** Manual retry — or called internally for auto-retry */
function retry(id) {
  const item = queue.get(id);
  if (!item || !['failed','cancelled'].includes(item.status)) return false;
  update(id, {
    status: 'pending', progress: 0, speed: '', eta: '',
    error: '', filename: '', downloadUrl: '', completedAt: null,
  });
  processNext();
  return true;
}

/** Change priority of a pending item and re-sort */
function setPriority(id, priority) {
  const item = queue.get(id);
  if (!item || item.status !== 'pending') return false;
  update(id, { priority });
  return true;
}

// ── Internal ──────────────────────────────────────────────────────

function activeCount() {
  let n = 0;
  for (const i of queue.values()) if (i.status === 'downloading') n++;
  return n;
}

function processNext() {
  if (activeCount() >= MAX_CONCURRENT) return;
  // Process in priority order
  const pending = getAll().filter(i => i.status === 'pending');
  for (const item of pending) {
    if (activeCount() >= MAX_CONCURRENT) break;
    startDownload(item.id);
  }
}

function broadcast() {
  if (io) io.emit('queue:snapshot', getAll());
}

function emitToast(type, message) {
  if (io) io.emit('toast', { type, message });
}

/**
 * Core download executor — spawns yt-dlp with all options.
 */
function startDownload(id) {
  const item = queue.get(id);
  if (!item) return;

  // Build a safe filename from the video title.
  // sanitizeTitle strips characters that are illegal on Windows/macOS/Linux,
  // collapses whitespace, and truncates to 180 chars to stay well under
  // the 255-byte filename limit even with a long extension appended.
  const safeTitle    = sanitizeTitle(item.title);
  const outputTemplate = path.join(DOWNLOADS_DIR, `${safeTitle}.%(ext)s`);
  const args = buildArgs(item, outputTemplate);

  update(id, { status: 'downloading', progress: 1 });
  emitToast('info', `⬇ Downloading: ${item.title.slice(0, 45)}…`);
  logger.info(`[queue] start  id=${id.slice(0,8)} format=${item.format} q=${item.quality}`);

  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  item._proc = proc;

  let stdout = '';
  let finalFilename = null;

  proc.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    const lines = stdout.split('\n');
    stdout = lines.pop(); // keep incomplete line

    for (const line of lines) {
      parseProgressLine(line, id);

      // Capture destination filenames
      const destMatch = line.match(/\[(?:download|Merger)\] Destination: (.+)/);
      if (destMatch) finalFilename = path.basename(destMatch[1].trim());

      const mergeMatch = line.match(/Merging formats into "(.+)"/);
      if (mergeMatch) finalFilename = path.basename(mergeMatch[1].trim());

      const audioMatch = line.match(/\[ExtractAudio\] Destination: (.+)/);
      if (audioMatch) finalFilename = path.basename(audioMatch[1].trim());
    }
  });

  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) logger.debug(`[yt-dlp:${id.slice(0,8)}] ${msg.slice(0,120)}`);
  });

  proc.on('close', (code) => {
    item._proc = null;

    if (code !== 0) {
      const shouldAutoRetry = item.retryCount < MAX_AUTO_RETRY;
      if (shouldAutoRetry) {
        logger.warn(`[queue] auto-retry ${item.retryCount + 1}/${MAX_AUTO_RETRY} id=${id.slice(0,8)}`);
        update(id, {
          status: 'pending', progress: 0, speed: '', eta: '',
          error: '', retryCount: item.retryCount + 1,
        });
        // Delay retry slightly to avoid hammering
        setTimeout(() => processNext(), 2000 * (item.retryCount + 1));
      } else {
        update(id, { status: 'failed', error: 'yt-dlp exited with error after retries. Check URL/dependencies.' });
        emitToast('error', `✗ Failed: ${item.title.slice(0, 40)}`);
      }
      processNext();
      return;
    }

    // Resolve filename from disk if not caught in stdout
    // safeTitle is available from the outer startDownload closure
    if (!finalFilename) {
      finalFilename = resolveFilename(id, safeTitle);
    }

    if (!finalFilename) {
      update(id, { status: 'failed', error: 'Download complete but output file not found.' });
      processNext();
      return;
    }

    // Get actual file size
    let fileSizeStr = item.fileSize;
    try {
      const s = fs.statSync(path.join(DOWNLOADS_DIR, finalFilename));
      fileSizeStr = formatBytes(s.size);
    } catch {}

    update(id, {
      status:      'completed',
      progress:    100,
      filename:    finalFilename,
      downloadUrl: `/downloads/${encodeURIComponent(finalFilename)}`,
      fileSize:    fileSizeStr,
      speed:       '',
      eta:         '',
      completedAt: new Date().toISOString(),
    });

    emitToast('success', `✓ Done: ${item.title.slice(0, 40)}`);
    logger.info(`[queue] done  id=${id.slice(0,8)} file=${finalFilename}`);
    processNext();
  });
}

/** Build yt-dlp argument list from an item's settings */
function buildArgs(item, outputTemplate) {
  const args = [item.url, '-o', outputTemplate, '--no-playlist', '--newline'];

  if (item.format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    const h = { '360p': 360, '720p': 720, '1080p': 1080 }[item.quality] || 720;
    args.push(
      '-f', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`,
      '--merge-output-format', 'mp4'
    );
  }

  // Subtitles
  if (item.withSubtitles) {
    args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'en', '--sub-format', 'srt');
  }

  // Thumbnail embed + separate file
  if (item.withThumbnail) {
    args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
    if (item.format !== 'mp3') args.push('--embed-thumbnail');
  }

  return args;
}

/** Parse a yt-dlp progress line and update item */
function parseProgressLine(line, id) {
  // [download]  45.2% of ~50.23MiB at 3.21MiB/s ETA 00:10
  const m = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+ ?\S+)\s+at\s+([\d.]+ ?\S+\/s)(?:\s+ETA\s+(\S+))?/
  );
  if (m) {
    update(id, {
      progress: parseFloat(m[1]),
      fileSize: m[2].trim(),
      speed:    m[3].trim(),
      eta:      m[4] ? `ETA ${m[4]}` : '',
    });
  }
}

/**
 * Sanitize a YouTube title into a safe cross-platform filename.
 * Removes illegal chars, collapses whitespace, truncates to 180 chars.
 */
function sanitizeTitle(title) {
  if (!title) return 'download';
  return (
    title
      // Strip chars illegal on Windows / macOS / Linux
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      // Collapse whitespace runs
      .replace(/\s+/g, ' ')
      .trim()
      // Remove leading/trailing dots (Windows dislikes them)
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 180)
  ) || 'download';
}

/**
 * Scan downloads folder for the most recently modified file
 * whose base name matches safeTitle (with optional yt-dlp duplicate suffix).
 */
function resolveFilename(id, safeTitle) {
  try {
    const prefix = safeTitle || id;
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => {
        const base = path.parse(f).name;
        return base === prefix || base.startsWith(prefix + ' (');
      })
      .sort((a, b) =>
        fs.statSync(path.join(DOWNLOADS_DIR, b)).mtimeMs -
        fs.statSync(path.join(DOWNLOADS_DIR, a)).mtimeMs
      );
    return files[0] || null;
  } catch { return null; }
}

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824)  return `${(bytes / 1048576).toFixed(2)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

module.exports = { init, getAll, add, update, remove, retry, cancel, setPriority };
