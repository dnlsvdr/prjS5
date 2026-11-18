// Local development only. Production frontend is static hosting over HTTPS.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const types = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/config.js': ['config.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'] };
http.createServer(async (req, res) => {
  const file = types[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try { res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }); res.end(await readFile(new URL(file[0], import.meta.url))); }
  catch { res.writeHead(500); res.end('Could not load file'); }
}).listen(5500, '127.0.0.1', () => console.log('Frontend: http://localhost:5500'));
