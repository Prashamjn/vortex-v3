/**
 * routes/api.js  —  Stream Edition
 * Only two endpoints needed: /info and /stream
 */

'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/downloadController');
const { downloadLimiter } = require('../middleware/rateLimiter');

router.get('/health',               ctrl.health);
router.post('/info',                ctrl.getInfo);
router.post('/playlist',            ctrl.getPlaylist);

// Core stream endpoint — pipes yt-dlp directly to browser
router.get('/stream',               downloadLimiter, ctrl.stream);

module.exports = router;
