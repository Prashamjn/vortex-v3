/**
 * js/mode.js
 * ──────────────────────────────────────────────────────────────────
 * Environment / mode detection.
 *
 * LOCAL FULL MODE:
 *   - hostname is localhost, 127.0.0.1, or a private LAN IP
 *   - Socket.io script loaded successfully
 *
 * PUBLIC DEMO MODE:
 *   - Any other hostname (GitHub Pages, Vercel, etc.)
 *   - OR socket.io failed to load
 *
 * Sets: window.VORTEX_MODE = 'local' | 'demo'
 *       window.VORTEX_API  = base URL for API calls
 * ──────────────────────────────────────────────────────────────────
 */

(function detectMode() {
  const h = window.location.hostname;

  const LOCAL_HOST_PATTERNS = [
    /^localhost$/,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
  ];

  const isLocal = LOCAL_HOST_PATTERNS.some(p => p.test(h));

  if (isLocal && window.__SOCKET_AVAILABLE__) {
    window.VORTEX_MODE = 'local';
    window.VORTEX_API  = `${window.location.protocol}//${window.location.host}/api`;
    document.body.dataset.mode = 'local';
    console.log(`[VORTEX] Mode: LOCAL  API: ${window.VORTEX_API}`);
  } else {
    window.VORTEX_MODE = 'demo';
    window.VORTEX_API  = null;
    document.body.dataset.mode = 'demo';
    console.log('[VORTEX] Mode: DEMO  (no backend — showing landing page)');
  }
})();
