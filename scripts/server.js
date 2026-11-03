const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const API = ['login', 'logout', 'me', 'users', 'content', 'upload', 'image', 'media'];

function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice(5);
        if (!API.includes(name)) { res.statusCode = 404; return res.end('Not found'); }
        return await require('../api/' + name)(req, res);
      }
      let target = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (!path.extname(target)) target += '.html';
      if (!/^(?:[a-z]+\.html|(?:css|js|assets)\/[a-zA-Z0-9/._-]+)$/.test(target) || target.includes('..')) { res.statusCode = 404; return res.end('Not found'); }
      const file = path.join(ROOT, target);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end('Not found'); }
      res.setHeader('Content-Type', (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8');
      fs.createReadStream(file).pipe(res);
    } catch (_) { res.statusCode = 500; res.end('Request could not be completed.'); }
  });
}
if (require.main === module) {
  // Optional local owner config, never exposed through the static server.
  if (fs.existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
  const port = Number(process.env.PORT) || 5501;
  createServer().listen(port, '127.0.0.1', () => console.log('Seng Yang preview: http://127.0.0.1:' + port));
}
module.exports = { createServer };
