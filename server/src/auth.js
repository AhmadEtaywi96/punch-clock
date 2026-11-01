const crypto = require('crypto');

// Extracts the PIN from "Authorization: Bearer <PIN>" (or a raw PIN value).
function extractPin(header) {
  if (!header) return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : header).trim();
}

// Constant-time comparison so response timing doesn't leak the PIN.
function pinMatches(candidate, secret) {
  const a = crypto.createHash('sha256').update(String(candidate)).digest();
  const b = crypto.createHash('sha256').update(String(secret)).digest();
  return crypto.timingSafeEqual(a, b);
}

function requirePin(req, res, next) {
  const secret = process.env.APP_SECRET_PIN;
  if (!secret) {
    return res.status(500).json({ error: 'Server PIN is not configured' });
  }
  const pin = extractPin(req.get('Authorization'));
  if (!pin || !pinMatches(pin, secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requirePin };
