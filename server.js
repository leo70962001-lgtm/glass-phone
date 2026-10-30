// 本機預覽：node server.js  →  http://localhost:5215
// 手機：同一個 Wi-Fi 開 https://<電腦 IP>:5216（陀螺儀需要 HTTPS；憑證用 tools/cert.sh 產生，自簽，第一次要按「繼續前往」）
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5215;
const HTTPS_PORT = PORT + 1;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4' };

function handle(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // 開發用：POST canvas 截圖 → tools/shots/name.png
  if (req.method === 'POST' && url === '/__shot') {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const dir = path.join(ROOT, 'tools', 'shots');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(data.replace(/^data:image\/png;base64,/, ''), 'base64'));
      res.writeHead(200).end('ok');
    });
    return;
  }
  const file = path.join(ROOT, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}tools${path.sep}cert`)) return res.writeHead(403).end('forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    const head = { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    // 影片要支援 Range（iOS Safari 沒有 206 就不播）
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) return res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end();
      res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
http.createServer(handle).listen(PORT, () => console.log(`玻璃手機 → http://localhost:${PORT}`));
const key = path.join(ROOT, 'tools', 'cert', 'key.pem'), cert = path.join(ROOT, 'tools', 'cert', 'cert.pem');
if (fs.existsSync(key) && fs.existsSync(cert)) {
  https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handle)
    .listen(HTTPS_PORT, () => lan.forEach((ip) => console.log(`手機 → https://${ip}:${HTTPS_PORT}`)));
}
