const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requirePin } = require('./auth');
const { appendRow } = require('./sheets');

const OWNER_NAME = 'Ahmad Amer Al-Ataywi';
const OWNER_EMAIL = 'ahmad.etawi1996@gmail.com';
const TIME_ZONE = 'Asia/Amman';
const ALLOWED_ACTIONS = ['Login', 'Logout', 'Open Door'];

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist', 'client', 'browser');

const app = express();
app.set('trust proxy', 1); // behind Nginx: use X-Forwarded-For for rate limiting
app.use(express.json({ limit: '10kb' }));

// Throttle failed PIN attempts per IP to block brute forcing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

// "2026-11-01 08:59:12" in Amman local time.
function ammanTimestamp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatLocation(lat, lng) {
  const valid = (v, max) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
  return valid(lat, 90) && valid(lng, 180)
    ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    : 'Location unavailable';
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/verify-pin', authLimiter, requirePin, (req, res) => res.json({ ok: true }));

app.post('/api/log-action', authLimiter, requirePin, async (req, res) => {
  const { action, latitude, longitude } = req.body || {};
  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${ALLOWED_ACTIONS.join(', ')}` });
  }

  const timestamp = ammanTimestamp();
  const location = formatLocation(latitude, longitude);
  try {
    await appendRow([OWNER_NAME, OWNER_EMAIL, timestamp, action, location]);
    res.json({ ok: true, action, timestamp, location });
  } catch (err) {
    console.error('Sheets append failed:', err.message);
    res.status(502).json({ error: 'Failed to write to Google Sheet' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built Angular PWA with SPA fallback.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, {
    setHeaders: (res, filePath) => {
      // The service worker and its manifest must never be cached stale.
      if (/(ngsw\.json|ngsw-worker\.js|index\.html)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.use((req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(`Punch clock server listening on http://${HOST}:${PORT}`);
});
