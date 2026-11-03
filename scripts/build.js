const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
// Explicit allowlist: server code and local configuration never enter the public artifact.
for (const name of ['index.html', 'about.html', 'services.html', 'training.html', 'employment.html', 'contact.html', 'admin.html', 'css', 'js', 'assets']) {
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
console.log('Built 7 pages and public assets in dist/. API functions remain in api/.');
