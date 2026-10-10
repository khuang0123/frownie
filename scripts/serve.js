// Tiny static server so you can try frownie in a normal browser tab:
//   npm run web  ->  http://localhost:5173
// (getUserMedia needs a secure context; localhost counts.)
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { mimeFor, resolveInside } = require('./mime');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5173;

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(302, { Location: `/renderer/index.html${url.search}` });
      res.end();
      return;
    }
    const file = resolveInside(ROOT, url.pathname);
    if (!file) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeFor(file), 'Content-Length': stat.size });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`frownie is running at http://localhost:${PORT}`);
  });
