// 静态文件（含路径穿越防护）
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

export function serveStatic(rootDir, req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  const rel = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.resolve(rootDir, '.' + (rel.startsWith('/') ? rel : '/' + rel));
  // 唯二的门：解析结果必须仍在根目录内
  if (!target.startsWith(path.resolve(rootDir) + path.sep) && target !== path.resolve(rootDir)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback：非 /api 的 GET 都回 index.html
      const idx = path.join(path.resolve(rootDir), 'index.html');
      fs.readFile(idx, (e2, buf) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, {
          'Content-Type': MIME['.html'],
          'Cache-Control': 'no-cache',
          'Content-Length': buf.length,
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
        });
        res.end(req.method === 'HEAD' ? undefined : buf);
      });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const isHtml = ext === '.html';
    const etag = 'W/"' + st.size + '-' + Math.floor(st.mtimeMs) + '"';
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] });
      return res.end();
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}
