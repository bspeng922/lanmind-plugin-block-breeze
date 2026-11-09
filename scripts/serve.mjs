import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { root, assets } from './build.mjs';

const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : 5174);
const directory = process.argv.includes('--dist') ? path.join(root, 'dist') : root;
const allowed = new Set([...assets, 'manifest.json']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
http.createServer((request, response) => {
  try {
    const asset = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!['GET', 'HEAD'].includes(request.method) || !allowed.has(asset)) { response.writeHead(404).end('Not found'); return; }
    const bytes = fs.readFileSync(path.join(directory, asset));
    response.writeHead(200, { 'Content-Type': mime[path.extname(asset)], 'Cache-Control': 'no-store', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Block Breeze: http://127.0.0.1:${port}`));
