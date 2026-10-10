// Shared by the Electron app:// protocol and the dev web server.
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.task': 'application/octet-stream',
};

/** Resolves a URL path inside `root`, or returns null if it escapes it. */
function resolveInside(root, urlPath) {
  const file = path.normalize(path.join(root, decodeURIComponent(urlPath)));
  return file.startsWith(root + path.sep) ? file : null;
}

const mimeFor = (file) => TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

module.exports = { mimeFor, resolveInside };
