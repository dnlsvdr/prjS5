import http from 'node:http';
import { randomBytes, scryptSync, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { issueJWT, verifyJWT, getCookie, TOKEN_SECONDS } from './auth.js';
const derive = promisify(scrypt);
const team = process.env.TEAM_NAME || 'prjK3';
if (!/^prj[A-Za-z0-9]{1,20}$/.test(team)) throw Error('TEAM_NAME must start with prj and contain only letters/numbers.');
const originURL = new URL(process.env.FRONTEND_ORIGIN || 'http://localhost:5500');
const origin = originURL.origin;
const key = process.env.JWT_SIGNING_KEY || '';
if (!/^[a-fA-F0-9]{64,}$/.test(key)) throw Error('Set JWT_SIGNING_KEY to at least 32 random bytes in hex. Run npm run setup locally.');
const password = process.env.ADMIN_PASSWORD || 'BCIT12';
const secret = process.env.APP_SECRET || 'defaultSecret';
if (password.length < 1 || password.length > 6) throw Error('Password must be 1–6 characters for this assignment.');
if (secret.length < 1 || secret.length >= 20 || /\s/.test(secret)) throw Error('Secret must be 1–19 characters with no spaces.');
const secure = process.env.COOKIE_SECURE === 'true';
const sameSite = process.env.COOKIE_SAMESITE || 'Lax';
if (!['Lax', 'Strict', 'None'].includes(sameSite) || (sameSite === 'None' && !secure)) throw Error('Invalid cookie settings. SameSite=None requires Secure.');
if (process.env.NODE_ENV === 'production' && (!secure || originURL.protocol !== 'https:')) throw Error('Production requires HTTPS frontend and Secure cookies.');
const cookieName = secure ? '__Host-session' : 'local_session';
const base = `/${team}/api`;
const issuer = `password-hackathon:${team}`;
const salt = randomBytes(16);
// Hash only once on startup; never block the event loop with a password hash per request.
const passwordHash = scryptSync(password, salt, 32);
const buckets = new Map();
let activeHashes = 0;
function cookie(value, seconds) {
  return `${cookieName}=${value}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${seconds}; Expires=${new Date(Date.now() + seconds * 1000).toUTCString()}${secure ? '; Secure' : ''}`;
}
function send(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(data));
}
function loginAllowed(req) {
  // Deliberately do not trust arbitrary X-Forwarded-For headers.
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const old = buckets.get(ip);
  const b = old && old.until > now ? old : { count: 0, until: now + 60_000 };
  if (!old && buckets.size >= 10000) return false;
  buckets.set(ip, b);
  return ++b.count <= 30;
}
const cleanup = setInterval(() => {
  for (const [ip, b] of buckets) if (b.until < Date.now()) buckets.delete(ip);
}, 60000).unref();
async function readJSON(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw { status: 415, message: 'Use application/json.' };
  let bytes = 0;
  const chunks = [];
  // Oversized bodies are closed after the 413 response rather than drained forever.
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 2048) throw { status: 413, message: 'Request too large.' };
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw { status: 400, message: 'Invalid JSON.' }; }
}
const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Vary', 'Origin');
  // Exact origin allowlist, including on preflight. Never combine credentials with '*'.
  if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, { error: 'Origin not allowed.' });
  if (req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  try {
    const path = new URL(req.url, 'http://api.local').pathname;
    if (path === `/${team}` || path === `/${team}/`) return send(res, 200, { team, service: 'Hackathon API', health: `${base}/health` });
    if (!path.startsWith(`${base}/`)) return send(res, 404, { error: 'Not found.' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (req.method === 'GET' && path === `${base}/health`) return send(res, 200, { team, status: 'ok' });
    if (req.method === 'POST') {
      // Reject form/simple cross-site requests as well as unknown origins (CSRF defense).
      if (req.headers.origin !== origin) return send(res, 403, { error: 'Frontend Origin header required.' });
      if (path === `${base}/login`) {
        if (!loginAllowed(req) || activeHashes >= 4) return send(res, 429, { error: 'Too many login attempts. Try again shortly.' }, { 'Retry-After': '60' });
        const body = await readJSON(req);
        if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 64 || body.password.length > 128) return send(res, 400, { error: 'Invalid login fields.' });
        if (activeHashes >= 4) return send(res, 429, { error: 'Login service busy. Try again shortly.' }, { 'Retry-After': '5' });
        activeHashes++;
        let candidate;
        try { candidate = await derive(body.password, salt, 32); }
        finally { activeHashes--; }
        if (!timingSafeEqual(candidate, passwordHash) || body.username !== 'admin') return send(res, 401, { error: 'Invalid username or password.' });
        return send(res, 200, { ok: true, team }, { 'Set-Cookie': cookie(issueJWT(key, issuer, origin), TOKEN_SECONDS) });
      }
      if (path === `${base}/logout`) {
        // No blacklist, signing-key rotation, or token revocation: assignment rule 2.
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
      }
    }
    if (req.method === 'GET' && [`${base}/admin`, `${base}/page1`, `${base}/page2`].includes(path)) {
      const claims = verifyJWT(getCookie(req.headers.cookie, cookieName), key, issuer, origin);
      if (!claims) return send(res, 401, { error: 'Please log in.' });
      if (path.endsWith('/admin')) return send(res, 200, { team, secret });
      return send(res, 200, { team, page: path.endsWith('/page1') ? 'Page 1' : 'Page 2' });
    }
    return send(res, 404, { error: 'Not found.' });
  } catch (err) {
    if (res.headersSent || res.destroyed) return;
    if (err.status === 413) res.setHeader('Connection', 'close');
    send(res, err.status || 500, { error: err.status ? err.message : 'Server error.' });
  }
});
server.headersTimeout = 4000;
server.requestTimeout = 4000;
server.timeout = 4000;
server.keepAliveTimeout = 3000;
server.maxRequestsPerSocket = 100;
server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => { console.log(`${team} API listening; routes begin ${base}`); if (process.send) process.send(server.address().port); });
