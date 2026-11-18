// JWT HS256 implemented with Node built-ins. No authentication/JWT dependencies.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
export const TOKEN_SECONDS = 3 * 60 * 60; // Three hours, also used for cookie lifetime.
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const signature = (data, key) => createHmac('sha256', key).update(data).digest();
export function issueJWT(key, issuer, audience, now = Math.floor(Date.now() / 1000)) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  // Do not place the password or application secret in this readable payload.
  const payload = encode({ sub: 'admin', iss: issuer, aud: audience, iat: now, exp: now + TOKEN_SECONDS, jti: randomUUID() });
  const data = `${header}.${payload}`;
  return `${data}.${signature(data, key).toString('base64url')}`;
}
export function verifyJWT(token, key, issuer, audience, now = Math.floor(Date.now() / 1000)) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const [header, payload, sig] = parts;
    const received = Buffer.from(sig, 'base64url');
    const expected = signature(`${header}.${payload}`, key);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const h = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (h.alg !== 'HS256' || h.typ !== 'JWT' || p.sub !== 'admin' || p.iss !== issuer || p.aud !== audience) return null;
    if (!Number.isInteger(p.exp) || !Number.isInteger(p.iat) || p.iat > now || p.exp <= now || p.exp - p.iat !== TOKEN_SECONDS) return null;
    return p;
  } catch { return null; }
}
export function getCookie(header, name) {
  if (typeof header !== 'string') return '';
  const matches = header.split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
