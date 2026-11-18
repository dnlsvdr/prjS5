const { team, apiOrigin } = window.APP_CONFIG;
const base = `${apiOrigin.replace(/\/$/, '')}/${team}/api`;
const byId = id => document.getElementById(id);
byId('team').textContent = `Team ${team}`;
document.title = `Team ${team} — Login`;
let renderVersion = 0;
let clock;
async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}/${path}`, {
    method, credentials: 'include', cache: 'no-store',
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) } : {}),
    signal: AbortSignal.timeout(4500)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
  return data;
}
function clearView() {
  clearInterval(clock);
  byId('welcome').textContent = '';
  byId('protected').hidden = true;
  byId('navigation').hidden = true;
  byId('login').hidden = true;
}
function goLogin() { location.replace('#/login'); }
async function render() {
  const version = ++renderVersion;
  clearView();
  byId('status').textContent = '';
  const route = location.hash.slice(2) || 'login';
  if (route === 'login') { byId('login').hidden = false; return; }
  if (!['admin', 'page1', 'page2'].includes(route)) return goLogin();
  byId('status').textContent = 'Loading…';
  try {
    // A fresh server check on every protected navigation, including reloads.
    const data = await api(route);
    if (version !== renderVersion) return;
    byId('status').textContent = '';
    byId('navigation').hidden = false;
    byId('protected').hidden = false;
    byId('page-title').textContent = route === 'admin' ? 'Admin Landing Page' : data.page;
    if (route === 'admin') {
      const update = () => { byId('welcome').textContent = `Welcome to Team ${data.team}, Secret: "${data.secret}", Time: ${new Date().toLocaleString()}`; };
      update(); clock = setInterval(update, 1000);
    }
  } catch (err) {
    if (version !== renderVersion) return;
    if (err.status === 401) return goLogin();
    byId('status').textContent = err.status ? err.message : 'Cannot reach the API. Check API URL, HTTPS, CORS, and browser cookie settings.';
  }
}
byId('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  byId('submit').disabled = true;
  byId('status').textContent = 'Logging in…';
  try {
    await api('login', 'POST', { username: byId('username').value, password: byId('password').value });
    // Detect browsers rejecting the cookie before redirecting.
    await api('admin');
    byId('password').value = '';
    location.hash = '/admin';
  } catch (err) {
    byId('status').textContent = err.status === 401 ? 'Login failed. Check credentials; if they are correct, check whether the browser blocked the API cookie.' : (err.status ? err.message : 'Cannot reach the API. Check configuration and cookie settings.');
  } finally { byId('submit').disabled = false; }
});
byId('logout').addEventListener('click', async () => {
  try { await api('logout', 'POST'); clearView(); goLogin(); }
  catch { byId('status').textContent = 'Logout failed. Check your connection and try again.'; }
});
window.addEventListener('hashchange', render);
// Recheck auth when returning to a cached page or another tab.
window.addEventListener('pageshow', event => { if (event.persisted) render(); });
window.addEventListener('focus', () => { if (location.hash !== '#/login') render(); });
if (!location.hash) location.replace('#/login');
else render();
