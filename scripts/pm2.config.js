/**
 * PM2 ecosystem config for VORTEX v3
 * Start with: pm2 start scripts/pm2.config.js
 * Save:       pm2 save
 * Auto-start: pm2 startup  (follow the command it prints)
 */

module.exports = {
  apps: [{
    name:        'vortex',
    script:      './backend/server.js',
    cwd:         '/root/vortex-v3',   // ← change to your actual path
    instances:   1,                   // 1 is enough; yt-dlp is the bottleneck
    autorestart: true,
    watch:       false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV:       'production',
      PORT:           3001,
      VORTEX_PUBLIC:  'true',
      VORTEX_TOKEN:   'REPLACE_WITH_YOUR_SECRET',
      TRUST_PROXY:    '1',
      LOG_LEVEL:      'info',
    },
  }],
};
