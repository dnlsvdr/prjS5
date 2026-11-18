import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const origin = 'http://localhost:5500';
async function start(password, secret) {
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '0', TEAM_NAME: 'prjK3', FRONTEND_ORIGIN: origin, ADMIN_PASSWORD: password, APP_SECRET: secret, JWT_SIGNING_KEY: 'a'.repeat(64), COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  // The test-only IPC address is sent once the normal server is listening.
  const timeout = setTimeout(() => child.kill(), 5000);
  try { const [port] = await once(child, 'message'); return { child, url: `http://127.0.0.1:${port}/prjK3/api` }; }
  finally { clearTimeout(timeout); }
}
async function stop(child) { const exit = once(child, 'exit'); child.kill(); await exit; }
test('HTTP login, CORS, protected endpoints, logout replay and password-change persistence', async () => {
  let { child, url } = await start('BCIT12', 'defaultSecret');
  const post = (path, body, site = origin) => fetch(`${url}/${path}`, { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let saved;
  try {
    assert.equal((await fetch(`${url}/admin`)).status, 401);
    assert.equal((await post('login', { username: 'admin', password: 'wrong' })).status, 401);
    assert.equal((await post('login', {}, 'https://evil.example')).status, 403);
    const pre = await fetch(`${url}/login`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.equal(pre.headers.get('access-control-allow-credentials'), 'true');
    const login = await post('login', { username: 'admin', password: 'BCIT12' });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /Max-Age=10800/);
    saved = cookie.split(';')[0];
    for (const page of ['admin', 'page1', 'page2']) assert.equal((await fetch(`${url}/${page}`, { headers: { Cookie: saved } })).status, 200);
    const admin = await fetch(`${url}/admin`, { headers: { Cookie: saved } });
    assert.equal((await admin.json()).secret, 'defaultSecret');
    const logout = await post('logout', {});
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await fetch(`${url}/admin`, { headers: { Cookie: saved } })).status, 200);
    assert.equal((await fetch(`${url}/admin`)).status, 401);
    const malformed = await fetch(`${url}/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const badType = await fetch(`${url}/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(badType.status, 415);
  } finally { await stop(child); }
  ({ child, url } = await start('N3w!9x', 'newSecret'));
  try {
    const replay = await fetch(`${url}/admin`, { headers: { Cookie: saved } });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).secret, 'newSecret');
    assert.equal((await post('login', { username: 'admin', password: 'BCIT12' })).status, 401);
    assert.equal((await post('login', { username: 'admin', password: 'N3w!9x' })).status, 200);
  } finally { await stop(child); }
});
