import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = process.env.PORT || 3000;

const mounts = [
  ['/vendor/ionic/', join(root, 'node_modules/@ionic/core/dist/ionic/')],
  ['/vendor/ionic-css/', join(root, 'node_modules/@ionic/core/css/')],
  ['/vendor/figtree/', join(root, 'node_modules/@fontsource-variable/figtree/')],
  ['/vendor/bricolage/', join(root, 'node_modules/@fontsource-variable/bricolage-grotesque/')],
  ['/', join(root, 'public/')],
];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
};

function locate(urlPath) {
  for (const [prefix, dir] of mounts) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = normalize(decodeURIComponent(urlPath.slice(prefix.length)));
    const file = resolve(dir, rel);
    if (!file.startsWith(resolve(dir))) return null;
    return { file, vendor: prefix !== '/' };
  }
  return null;
}

function send(res, file, vendor) {
  const type = types[extname(file)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': vendor ? 'public, max-age=86400' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname;
    const hit = locate(urlPath);
    if (hit && existsSync(hit.file) && statSync(hit.file).isFile()) {
      return send(res, hit.file, hit.vendor);
    }
    if (hit && !hit.vendor && !extname(urlPath)) {
      return send(res, join(root, 'public/index.html'), false);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  })
  .listen(port, () => {
    console.log(`HuellitasVet disponible en http://localhost:${port}`);
  });
