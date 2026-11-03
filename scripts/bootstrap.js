// Owner-run only. Never invoked by install, build, tests, or deployment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { hashPassword } = require('../api/_lib/users');
async function main() {
  if (!process.stdin.isTTY) throw new Error('Run this yourself in an interactive terminal.');
  const output = path.resolve(__dirname, '..', '.bootstrap.env');
  if (fs.existsSync(output)) throw new Error('.bootstrap.env already exists. Preserve or remove it yourself before continuing.');
  let hidden = false;
  const muted = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  const ask = prompt => new Promise(resolve => { process.stdout.write(prompt); rl.question('', resolve); });
  try {
    const email = 'yangseng93@gmail.com';
    const confirmation = await ask('Create a local hashed bootstrap configuration for ' + email + '? Type ACTIVATE to confirm: ');
    if (confirmation !== 'ACTIVATE') return;
    hidden = true;
    const password = await ask('Choose a unique passphrase (14–200 characters, hidden): '); process.stdout.write('\n');
    const again = await ask('Confirm passphrase (hidden): '); process.stdout.write('\n');
    if (password !== again || password.length < 14 || password.length > 200) throw new Error('Passphrases must match and contain 14–200 characters.');
    fs.writeFileSync(output, 'ADMIN_EMAIL=' + email + '\nADMIN_PASSWORD_HASH=' + hashPassword(password) + '\nSESSION_SECRET=' + crypto.randomBytes(48).toString('hex') + '\nBLOB_ACCESS=private\n', { flag: 'wx', mode: 0o600 });
    process.stdout.write('Created ignored .bootstrap.env. Import its values through your secret manager or hosting environment. It contains no plaintext password. Do not commit it.\n');
  } finally { rl.close(); }
}
main().catch(() => { console.error('Bootstrap stopped. No values are printed. Check matching passphrase length, interactive terminal, and existing .bootstrap.env.'); process.exitCode = 1; });
