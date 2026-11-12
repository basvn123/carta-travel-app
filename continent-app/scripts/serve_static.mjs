// A static server for the end check: the NOPUBLIC build first, then the
// app's public/ (the data), then index.html for the app's own routes.
//   node serve-a.mjs <distDir> <publicDir> <port>
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const [dist, pub, port = '5836'] = process.argv.slice(2);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.pbf': 'application/x-protobuf', '.geojson': 'application/geo+json', '.txt': 'text/plain',
};
const find = (root, p) => {
  const f = normalize(join(root, p));
  if (!f.startsWith(normalize(root))) return null;
  try { return statSync(f).isFile() ? f : null; } catch { return null; }
};
http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = find(dist, path) || find(pub, path) || (extname(path) ? null : find(dist, '/index.html'));
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`serving ${dist} + ${pub} on ${port}`));
