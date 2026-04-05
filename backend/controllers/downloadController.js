/**
 * controllers/downloadController.js
 * ──────────────────────────────────────────────────────────────────
 * GET /api/stream?url=...&format=mp4|mp3&quality=720p&title=...
 *
 * WHY WE USE A TEMP FILE FOR MP4:
 *   MP4 container format requires writing "moov atoms" (index/metadata)
 *   which ffmpeg places at the END of the file after muxing is complete.
 *   A pipe is not seekable, so ffmpeg cannot go back and write the moov
 *   atom — resulting in a file with video stream missing or unplayable.
 *
 *   Solution: yt-dlp writes to a temp file → we stream that file to
 *   the browser → we delete the temp file. The browser still gets a
 *   direct download with no permanent server storage.
 *
 * MP3 STILL PIPES DIRECTLY:
 *   MP3 is a sequential format with no index atoms — piping works fine.
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const { exec, spawn } = require('child_process');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { v4: uuid } = require('uuid');
const infoCache = require('../services/infoCache');
const logger    = require('../utils/logger');

// ── Cookies file (optional — fixes YouTube 429 rate-limiting on cloud IPs) ──
const COOKIES_FILE = path.join(__dirname, '..', 'cookies.txt');
const COOKIES_ARGS = fs.existsSync(COOKIES_FILE)
  ? ['--cookies', COOKIES_FILE]
  : [];
if (COOKIES_ARGS.length) {
  logger.info('[ytdlp] cookies.txt found — using browser cookies');
} else {
  logger.info('[ytdlp] no cookies.txt — requests are anonymous (may hit 429 on cloud IPs)');
}

// ── Force Node.js as yt-dlp JavaScript runtime ────────────────────
// YouTube requires JS execution to decrypt video URLs.
// yt-dlp defaults to deno which is not installed on our server —
// we must explicitly tell it to use Node.js instead.
// Without this, yt-dlp throws:
//   "No supported JavaScript runtime could be found. Only deno is enabled"
const NODEJS_ARGS = [
  '--extractor-args', 'youtube:player_client=web,default',
];

// ── Helpers ───────────────────────────────────────────────────────

function execAsync(cmd) {
  return new Promise((resolve, reject) =>
    exec(cmd, { maxBuffer: 1024 * 1024 * 25 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim())
    )
  );
}

function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|playlist\?list=)|youtu\.be\/)/.test(url);
}

function fmtDuration(secs) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

function sanitizeTitle(title) {
  if (!title) return 'download';
  return (
    title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 180)
  ) || 'download';
}

function contentDisposition(filename) {
  const ascii   = filename.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Delete a file silently — ignores errors */
function unlink(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

const MIME = {
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  webm: 'video/webm',
};

// ── Controllers ───────────────────────────────────────────────────

/** GET /api/health */
async function health(req, res) {
  let ytdlp = false, ffmpeg = false, ytdlpVersion = null, ytdlpError = null;
  let ffmpegVersion = null, ffmpegError = null;

  try {
    ytdlpVersion = await execAsync('yt-dlp --version');
    ytdlp = true;
  } catch (e) {
    ytdlpError = e.message.slice(0, 120);
  }

  try {
    const ffmpegOut = await execAsync('ffmpeg -version');
    ffmpegVersion = ffmpegOut.split('\n')[0]; // first line only
    ffmpeg = true;
  } catch (e) {
    ffmpegError = e.message.slice(0, 120);
  }

  res.json({
    status:  'ok',
    version: '3.0.0',
    uptime:  Math.round(process.uptime()),
    dependencies: {
      ytdlp,        ytdlpVersion,  ytdlpError,
      ffmpeg,       ffmpegVersion, ffmpegError,
    },
    mode:  'stream',
    cache: infoCache.stats(),
    node:  process.version,
    platform: process.platform,
  });
}

/** POST /api/info  { url } */
async function getInfo(req, res) {
  const { url } = req.body;
  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid or missing YouTube URL.' });

  const cached = infoCache.get(url);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    // Build yt-dlp command with cookies + forced Node.js JS runtime
    const cookieFlag = COOKIES_ARGS.length ? COOKIES_ARGS.join(' ') + ' ' : '';
    const nodeFlag   = NODEJS_ARGS.join(' ') + ' ';
    const raw  = await execAsync(
      `yt-dlp ${nodeFlag}${cookieFlag}--dump-json --no-playlist "${url}"`
    );
    const info = JSON.parse(raw);

    const fmts = info.formats || [];
    const heights = new Set();
    for (const f of fmts) {
      if (f.height && f.vcodec !== 'none') {
        [360, 720, 1080].forEach(h => { if (f.height <= h) heights.add(`${h}p`); });
      }
    }
    const availableQualities = heights.size
      ? [...heights].sort((a, b) => parseInt(a) - parseInt(b))
      : ['360p', '720p', '1080p'];

    const payload = {
      title:    info.title,
      thumbnail: info.thumbnail,
      duration:  fmtDuration(info.duration),
      channel:   info.uploader || info.channel || 'Unknown',
      viewCount: info.view_count ? new Intl.NumberFormat().format(info.view_count) : 'N/A',
      availableQualities,
      fromCache: false,
    };

    infoCache.set(url, payload);
    res.json(payload);
  } catch (err) {
    const msg = err.message || '';
    logger.error(`[getInfo] ${msg.slice(0, 200)}`);

    // HTTP 429 = YouTube is rate-limiting this server's IP address.
    // Fix: add cookies.txt from your browser and redeploy.
    if (msg.includes('429') || msg.includes('Too Many Requests')) {
      return res.status(500).json({
        error: 'YouTube is rate-limiting this server (HTTP 429). '
             + 'Fix: export cookies.txt from your browser and add it to the backend/ folder, then redeploy.',
      });
    }

    res.status(500).json({
      error: 'Failed to fetch video info. Ensure yt-dlp is installed and the URL is public.',
    });
  }
}

/** POST /api/playlist  { url } */
async function getPlaylist(req, res) {
  const { url } = req.body;
  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid playlist URL.' });

  try {
    const raw = await execAsync(`yt-dlp --flat-playlist --dump-json "${url}" 2>/dev/null`);
    const entries = raw.split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean)
      .map(e => ({
        id:        e.id,
        url:       `https://www.youtube.com/watch?v=${e.id}`,
        title:     e.title || 'Unknown',
        duration:  fmtDuration(e.duration),
        thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
        channel:   e.uploader || e.channel || 'Unknown',
      }));

    res.json({ count: entries.length, entries });
  } catch (err) {
    logger.error(`[getPlaylist] ${err.message.slice(0, 120)}`);
    res.status(500).json({ error: 'Failed to fetch playlist.' });
  }
}

/**
 * GET /api/stream?url=...&format=mp4|mp3&quality=720p&title=...
 *
 * MP4 flow:
 *   1. yt-dlp downloads best video+audio to a temp file in OS temp dir
 *   2. Once complete, we pipe that file to the browser
 *   3. We delete the temp file after streaming finishes
 *   → Browser gets a perfect playable MP4. Temp file is gone immediately.
 *
 * MP3 flow:
 *   1. yt-dlp extracts audio, converts to MP3, writes to stdout
 *   2. We pipe stdout directly to the browser (MP3 is pipe-safe)
 *   → No temp file needed.
 */
async function stream(req, res) {
  const { url, format = 'mp4', quality = '720p', title = 'download' } = req.query;

  if (!isValidYouTubeUrl(url))
    return res.status(400).json({ error: 'Invalid YouTube URL.' });

  const safeTitle = sanitizeTitle(title);
  const ext       = format === 'mp3' ? 'mp3' : 'mp4';
  const filename  = `${safeTitle}.${ext}`;

  logger.info(`[stream] start  format=${format} q=${quality}  "${safeTitle}"`);

  const mime = MIME[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Encoding', 'identity');

  if (format === 'mp3') {
    // ── MP3: pipe directly (sequential format, pipe-safe) ────────────
    const args = [
      url,
      ...NODEJS_ARGS,            // force Node.js JS runtime (fixes "deno" error)
      ...COOKIES_ARGS,           // cookies fix for 429 rate-limiting
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', '-',
      '--no-playlist',
    ];

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.pipe(res);

    proc.stderr.on('data', chunk => {
      logger.debug(`[yt-dlp mp3] ${chunk.toString().trim().slice(0, 120)}`);
    });

    proc.on('close', code => {
      logger.info(`[stream] mp3 done  code=${code}`);
      if (!res.writableEnded) res.end();
    });

    proc.on('error', err => {
      logger.error(`[stream] mp3 spawn error: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed to start.' });
      else if (!res.writableEnded) res.end();
    });

    req.on('close', () => {
      if (proc.exitCode === null) proc.kill('SIGTERM');
    });

  } else {
    // ── MP4: download to temp file first, then stream ────────────────
    //
    // Why temp file? The MP4 container requires ffmpeg to write "moov atoms"
    // (the file index) at the END. ffmpeg needs to seek back to the start to
    // finalize them — impossible with a pipe. Without moov atoms the video
    // track cannot be read by any media player.
    //
    // The temp file lives only during the download. It is deleted immediately
    // after we finish streaming it to the browser.

    const h = { '360p': 360, '720p': 720, '1080p': 1080 }[quality] || 720;
    const tmpFile = path.join(os.tmpdir(), `vortex_${uuid()}.mp4`);

    const args = [
      url,
      ...NODEJS_ARGS,            // force Node.js JS runtime (fixes "deno" error)
      ...COOKIES_ARGS,           // cookies fix for 429 rate-limiting
      '-f',
      // Priority chain:
      //  1. Best MP4 video ≤ height + best M4A audio  (cleanest merge)
      //  2. Best video ≤ height + best audio  (any codec, ffmpeg will convert)
      //  3. Best single-stream MP4 ≤ height  (pre-muxed, no merge needed)
      //  4. Absolute best  (last resort)
      [
        `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${h}]+bestaudio`,
        `best[height<=${h}][ext=mp4]`,
        `best[height<=${h}]`,
        'best',
      ].join('/'),
      '--merge-output-format', 'mp4',
      '-o', tmpFile,           // ← write to temp file (seekable, moov atoms work)
      '--no-playlist',
    ];

    logger.info(`[stream] mp4 — downloading to temp: ${path.basename(tmpFile)}`);

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    // Log progress from stderr
    proc.stderr.on('data', chunk => {
      logger.debug(`[yt-dlp mp4] ${chunk.toString().trim().slice(0, 120)}`);
    });

    // stdout is not used for mp4 (writing to file), but drain it anyway
    proc.stdout.resume();

    proc.on('error', err => {
      logger.error(`[stream] mp4 spawn error: ${err.message}`);
      unlink(tmpFile);
      if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed to start.' });
      else if (!res.writableEnded) res.end();
    });

    proc.on('close', code => {
      if (code !== 0) {
        logger.error(`[stream] mp4 yt-dlp exited code=${code}`);
        unlink(tmpFile);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed. Check the URL and try again.' });
        else if (!res.writableEnded) res.end();
        return;
      }

      // Verify the file actually exists and has content
      let stat;
      try {
        stat = fs.statSync(tmpFile);
      } catch {
        logger.error(`[stream] mp4 temp file missing after download`);
        if (!res.headersSent) res.status(500).json({ error: 'Temp file missing after download.' });
        return;
      }

      logger.info(`[stream] mp4 ready — ${(stat.size / 1048576).toFixed(1)} MB — streaming to browser`);

      // Now we know the exact file size — tell the browser so it can show progress
      res.setHeader('Content-Length', stat.size);

      // Create a read stream and pipe it to the response
      const fileStream = fs.createReadStream(tmpFile);

      fileStream.pipe(res);

      fileStream.on('error', err => {
        logger.error(`[stream] file read error: ${err.message}`);
        unlink(tmpFile);
        if (!res.writableEnded) res.end();
      });

      // Delete temp file as soon as streaming is done
      res.on('finish', () => {
        logger.info(`[stream] mp4 streaming complete — deleting temp file`);
        unlink(tmpFile);
      });

      // Also delete if client disconnects mid-stream
      res.on('close', () => {
        unlink(tmpFile);
      });
    });

    // If client disconnects before download finishes, kill yt-dlp + cleanup
    req.on('close', () => {
      if (proc.exitCode === null) {
        logger.info(`[stream] client disconnected — killing yt-dlp`);
        proc.kill('SIGTERM');
        unlink(tmpFile);
      }
    });
  }
}

module.exports = { health, getInfo, getPlaylist, stream };
