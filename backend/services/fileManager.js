/**
 * services/fileManager.js
 * ──────────────────────────────────────────────────────────────────
 * Manages the downloads folder:
 *  - List all files with metadata
 *  - Delete individual files
 *  - Get disk usage stats
 *  - Open folder in OS file explorer
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');
const os      = require('os');

const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'downloads');

/** Returns an array of file metadata objects */
function listFiles() {
  if (!fs.existsSync(DOWNLOADS_DIR)) return [];

  return fs.readdirSync(DOWNLOADS_DIR)
    .filter(name => {
      // Exclude hidden files and partial downloads
      return !name.startsWith('.') && !name.endsWith('.part') && !name.endsWith('.ytdl');
    })
    .map(name => {
      const filePath = path.join(DOWNLOADS_DIR, name);
      let stat;
      try { stat = fs.statSync(filePath); } catch { return null; }
      if (!stat.isFile()) return null;

      const ext  = path.extname(name).toLowerCase().replace('.', '');
      const type = ['mp4','mkv','webm','avi','mov'].includes(ext) ? 'video'
                 : ['mp3','m4a','ogg','wav','flac'].includes(ext) ? 'audio'
                 : ['jpg','jpeg','png','webp'].includes(ext)       ? 'image'
                 : ['srt','vtt','ass'].includes(ext)               ? 'subtitle'
                 : 'other';

      return {
        name,
        ext,
        type,
        size:     stat.size,
        sizeHuman: formatBytes(stat.size),
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
        url:  `/downloads/${encodeURIComponent(name)}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

/** Delete a file by name. Returns true if deleted. */
function deleteFile(filename) {
  // Security: prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(DOWNLOADS_DIR, safe);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

/** Get total size and count of downloads folder */
function diskStats() {
  const files = listFiles();
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  return {
    count:      files.length,
    totalSize:  totalBytes,
    totalHuman: formatBytes(totalBytes),
    path:       DOWNLOADS_DIR,
  };
}

/**
 * Open the downloads folder in the OS file explorer.
 * Works on macOS, Windows, Linux.
 */
function openFolder() {
  const platform = os.platform();
  const cmd = platform === 'darwin' ? `open "${DOWNLOADS_DIR}"`
            : platform === 'win32'  ? `explorer "${DOWNLOADS_DIR}"`
            : `xdg-open "${DOWNLOADS_DIR}"`;
  exec(cmd, (err) => { if (err) console.warn('[fileManager] openFolder:', err.message); });
}

// ── Helpers ───────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824)  return `${(bytes / 1048576).toFixed(2)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

module.exports = { listFiles, deleteFile, diskStats, openFolder };
