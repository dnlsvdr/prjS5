import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { issueJWT, verifyJWT, TOKEN_SECONDS } from '../auth.js';
const key = 'a'.repeat(64), issuer = 'team', audience = 'https://web.example.com';
test('JWT validates, expires after three hours, and rejects tampering/wrong key/audience', () => {
  const token = issueJWT(key, issuer, audience, 1000);
  assert.equal(verifyJWT(token, key, issuer, audience, 1001).sub, 'admin');
  assert.ok(verifyJWT(token, key, issuer, audience, 1000 + TOKEN_SECONDS - 1));
  assert.equal(verifyJWT(token, key, issuer, audience, 1000 + TOKEN_SECONDS), null);
  assert.equal(verifyJWT(token + 'x', key, issuer, audience, 1001), null);
  assert.equal(verifyJWT(token, 'b'.repeat(64), issuer, audience, 1001), null);
  assert.equal(verifyJWT(token, key, issuer, 'wrong', 1001), null);
  assert.equal(verifyJWT('eyJhbGciOiJub25lIn0.e30.', key, issuer, audience), null);
  const [h, p, s] = token.split('.');
  const data = JSON.parse(Buffer.from(p, 'base64url'));
  data.sub = 'attacker';
  assert.equal(verifyJWT(`${h}.${Buffer.from(JSON.stringify(data)).toString('base64url')}.${s}`, key, issuer, audience, 1001), null);
});
test('even signed unexpected algorithms are rejected', () => {
  const token = issueJWT(key, issuer, audience, 1000).split('.');
  token[0] = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const data = token.slice(0, 2).join('.');
  const forged = `${data}.${createHmac('sha256', key).update(data).digest('base64url')}`;
  assert.equal(verifyJWT(forged, key, issuer, audience, 1001), null);
});
