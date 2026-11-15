// Lokaal proberen, zonder Vercel: npm run lokaal → http://localhost:3000
// Opslag gaat dan rechtstreeks naar de map data/ hier; je teamsync zet het op GitHub. Zonder wachtwoord (het draait alleen op jouw computer).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
if (fs.existsSync(".env.local")) {
  for (const regel of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(regel);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
delete process.env.GITHUB_TOKEN; // lokaal altijd de map data/
const SOORT = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const API = { '/api/ads': (await import('../api/ads.js')).default, '/api/beeld': (await import('../api/beeld.js')).default };
const POORT = Number(process.env.POORT) || 3000;

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const handler = API[u.pathname];
  if (handler) {
    let body = '';
    for await (const stuk of req) body += stuk;
    req.query = Object.fromEntries(u.searchParams);
    try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (d) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); return res; };
    res.send = (d) => { res.end(d); return res; };
    try { await handler(req, res); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ fout: e.message })); }
    return;
  }
  let pad = decodeURIComponent(u.pathname);
  if (pad === '/') pad = '/index.html';
  const f = path.join(ROOT, pad);
  if (!f.startsWith(ROOT) || pad.includes('/.') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('Niet gevonden'); }
  res.setHeader('Content-Type', SOORT[path.extname(f).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(POORT, () => console.log(`Ads Manager draait lokaal op http://localhost:${POORT}  (stoppen: ctrl+c)`));
