/* Safe localhost QA: HTML in memory, real modules + synthetic API fixture. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/sw.js' || pathname === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    if (pathname === '/sw.js') res.end('self.addEventListener("install", () => self.skipWaiting());');
    else {
      let source = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
      source = source.replace(/SUPABASE_URL:\s*"[^"]*"/, 'SUPABASE_URL: ""').replace(/SUPABASE_ANON_KEY:\s*"[^"]*"/, 'SUPABASE_ANON_KEY: ""');
      res.end(source);
    }
    return;
  }
  const rel = pathname === '/' || pathname === '/qa' ? 'index.html' : pathname.slice(1);
  const target = path.resolve(root, rel);
  if (!target.startsWith(root + path.sep) || (!rel.startsWith('assets/') && !rel.startsWith('css/') && !rel.startsWith('js/') && !['index.html', 'manifest.webmanifest', 'dev/weekly-planner-fixture.js'].includes(rel))) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    let content = fs.readFileSync(target);
    if (rel === 'index.html') {
      content = content.toString().replace(/(<script src="js\/app\.js[^\n]*\n)/, '<script src="dev/weekly-planner-fixture.js"></script>\n$1');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(8095, '127.0.0.1', () => console.log('Synthetic Weekly Planner QA: http://127.0.0.1:8095/#/routines'));
