const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png'
};

function getFilePath(requestUrl) {
  const pathname = new URL(requestUrl, `http://localhost:${PORT}`).pathname;
  const relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const filePath = path.resolve(ROOT, `.${relativePath}`);

  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    return null;
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let filePath;
  try {
    filePath = getFilePath(req.url);
  } catch {
    filePath = null;
  }

  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': contentType
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor PWA Garaje listo en http://localhost:${PORT}`);
});
