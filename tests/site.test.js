'use strict';
// Tests de sécurité du site : node --test tests/
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const { encryptFile } = require('../blobduel-download');

// Faux fichier de jeu chiffré, avec une clé jetable propre au test.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'site-test-'));
const KEY = crypto.randomBytes(32).toString('hex');
const PLAIN = crypto.randomBytes(40 * 1024 * 1024);
const PLAIN_SHA = crypto.createHash('sha256').update(PLAIN).digest('hex');
fs.writeFileSync(path.join(TMP, 'jeu.zip'), PLAIN);
encryptFile(path.join(TMP, 'jeu.zip'), path.join(TMP, 'jeu.zip.enc'), KEY);

const ROOT = path.join(__dirname, '..');
let PORT;
let proc;

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function request(method, p, { headers = {}, body, ip = '10.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p,
      headers: { 'X-Forwarded-For': ip, ...headers } }, (res) => {
      const h = crypto.createHash('sha256');
      const chunks = [];
      let size = 0;
      res.on('data', (c) => { h.update(c); size += c.length; if (chunks.length < 64) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8'), sha: h.digest('hex'), size }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const form = (code) => ({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'code=' + encodeURIComponent(code) });

before(async () => {
  PORT = await freePort();
  proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT),
    BLOBDUEL_ACCESS_CODE: 'AMI-ALPHA,AMI-BETA', BLOBDUEL_MAX_PER_IP: '2', BLOBDUEL_MAX_PER_DAY: '9',
    BLOBDUEL_FILE_KEY: KEY, BLOBDUEL_TEST_ENC_FILE: path.join(TMP, 'jeu.zip.enc'), BLOBDUEL_TEST_SHA256: PLAIN_SHA, BLOBDUEL_SEND_TIMEOUT_MS: '3000' },
    stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => proc.stdout.on('data', (d) => { if (String(d).includes('port')) resolve(); }));
});
after(() => proc.kill());

test('le code du serveur et les fichiers privés ne sont jamais servis', async () => {
  const secret = ['/server.js', '/security.js', '/blobduel-download.js', '/package.json',
    '/package-lock.json', '/nixpacks.toml', '/.git/config', '/.gitignore', '/.env',
    '/private/blobduel/BlobDuel-0.7.0-windows.zip', '/node_modules/ws/package.json',
 '/tests/site.test.js', '/tools/chiffrer-blobduel.js', '/private/blobduel/BlobDuel-0.8.0-windows.zip.enc',
    '/Server.js', '//server.js', '/./server.js', '/%252e%252e/server.js', '/%c0%ae%c0%ae/server.js', '/blobduel/../server.js', '/%2e%2e/server.js', '/blobduel/%2e%2e/server.js',
    '/server.js%00.html', '/..%2fserver.js', '/blobduel%5c..%5cserver.js', '/%E0%A4%A'];
  for (const p of secret) {
    const r = await request('GET', p);
    assert.ok(!r.text.includes('require(') && !r.text.includes('"dependencies"') && !r.text.includes('[core]'),
      p + ' a fuité');
    assert.ok(r.size < 5_000_000, p + ' a envoyé un gros fichier');
    assert.ok(r.status === 200 && r.headers['content-type'].startsWith('text/html') || [301, 400, 404].includes(r.status),
      p + ' → ' + r.status);
  }
});

test('les pages d\'INVASION restent servies', async () => {
  for (const [p, type] of [['/', 'text/html'], ['/game.js', 'application/javascript'],
    ['/battle/', 'text/html'], ['/favicon.png', 'image/png'], ['/og-image.png', 'image/png'],
    ['/robots.txt', 'text/plain'], ['/sitemap.xml', 'application/xml'], ['/admin.html', 'text/html'],
    ['/battle/leh.jpg', 'image/jpeg']]) {
    const r = await request('GET', p);
    assert.strictEqual(r.status, 200, p);
    assert.ok(r.headers['content-type'].startsWith(type), p + ' ' + r.headers['content-type']);
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
    if (p === '/admin.html') {
      assert.strictEqual(r.headers['x-frame-options'], 'DENY');
      assert.match(r.headers['x-robots-tag'], /noindex/);
      assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    } else {
      assert.ok(!r.headers['x-frame-options'], p + ' doit rester intégrable (CrazyGames)');
    }
  }
  const spa = await request('GET', '/une/page/inconnue');
  assert.strictEqual(spa.status, 200);
  assert.ok(spa.text.toLowerCase().includes('<!doctype html'));
  const etag = (await request('GET', '/favicon.png')).headers.etag;
  assert.strictEqual((await request('GET', '/favicon.png', { headers: { 'If-None-Match': etag } })).status, 304);
});

test('la page BLOB DUEL a une politique de sécurité stricte', async () => {
  const r = await request('GET', '/blobduel/');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.strictEqual(r.headers['x-frame-options'], 'DENY');
  assert.ok(r.text.includes('champ-code visible'), 'le champ du code doit être affiché');
  assert.ok(!r.text.includes('fonts.googleapis') && !r.text.includes('https://fonts'), 'aucune ressource externe');
  assert.strictEqual((await request('GET', '/blobduel')).status, 301);
  assert.strictEqual((await request('GET', '/blobduel/style.css')).status, 200);
  assert.strictEqual((await request('GET', '/blobduel/licence.html')).status, 200);
  const sec = await request('GET', '/.well-known/security.txt');
  assert.strictEqual(sec.status, 200);
  assert.match(sec.text, /^Contact: /);
  assert.strictEqual((await request('GET', '/blobduel/telecharger')).status, 303);
  assert.strictEqual((await request('DELETE', '/blobduel/')).status, 405);
});

test('les protections ne se contournent pas par un encodage détourné', async () => {
  for (const p of ['//admin.html', '/admin%2ehtml', '/%61dmin.html', '/blob%64uel/', '//blobduel/']) {
    const r = await request('GET', p);
    assert.strictEqual(r.status, 301, p);
    const r2 = await request('GET', r.headers.location);
    assert.strictEqual(r2.status, 200, p + ' → ' + r.headers.location);
    assert.strictEqual(r2.headers['x-frame-options'], 'DENY', p);
    assert.ok(!r2.text.includes('<!--CHAMP_CODE-->'), p);
  }
  assert.strictEqual((await request('GET', '/game.js?v=202')).status, 200, 'paramètres conservés');
});

test('X-Forwarded-For inventé : c\'est la dernière adresse (posée par le proxy) qui compte', async () => {
  // Le visiteur invente la première valeur ; le proxy ajoute la vraie à la fin.
  for (let i = 0; i < 5; i++) {
    const r = await request('POST', '/blobduel/telecharger', { ...form('FAUX'), ip: '6.6.6.' + i + ', 10.9.9.9' });
    assert.strictEqual(r.status, 403);
  }
  const r = await request('POST', '/blobduel/telecharger', { ...form('FAUX'), ip: '7.7.7.7, 10.9.9.9' });
  assert.strictEqual(r.status, 429, 'bloqué malgré les adresses inventées');
});

test('essais de code envoyés en parallèle : toujours 5 au maximum', async () => {
  const tries = await Promise.all(Array.from({ length: 30 }, () =>
    request('POST', '/blobduel/telecharger', { ...form('FAUX'), ip: '10.8.8.8' })));
  const tested = tries.filter(r => r.status === 403).length;
  assert.ok(tested <= 5, tested + ' codes testés');
});

test('téléchargement : code exigé, verrouillage après 5 erreurs', async () => {
  const ip = '10.1.1.1';
  for (let i = 0; i < 5; i++) {
    const r = await request('POST', '/blobduel/telecharger', { ...form('MAUVAIS' + i), ip });
    assert.strictEqual(r.status, 403);
  }
  const locked = await request('POST', '/blobduel/telecharger', { ...form('AMI-ALPHA'), ip });
  assert.strictEqual(locked.status, 429, 'le bon code doit être refusé pendant le blocage');
  const json = await request('POST', '/blobduel/telecharger', { headers: { 'Content-Type': 'application/json' },
    body: '{"code":"AMI-ALPHA"}', ip: '10.1.1.2' });
  assert.strictEqual(json.status, 415);
  const big = await request('POST', '/blobduel/telecharger', { ...form('A'.repeat(5000)), ip: '10.1.1.3' })
    .catch(() => ({ status: 'coupé' }));
  assert.notStrictEqual(big.status, 200);
});

test('un client qui ne lit plus ne garde pas sa place', async () => {
  // 4 téléchargements (le maximum simultané) qui s'arrêtent de lire…
  const stalled = await Promise.all([1, 2, 3, 4].map((n) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/blobduel/telecharger',
      headers: { 'X-Forwarded-For': '10.5.5.' + n, 'Content-Type': 'application/x-www-form-urlencoded' } }, (res) => {
      res.pause();
      resolve({ req, status: res.statusCode });
    });
    req.on('error', () => {});
    req.end('code=AMI-ALPHA');
  })));
  assert.deepStrictEqual(stalled.map(x => x.status), [200, 200, 200, 200]);
  const busy = await request('POST', '/blobduel/telecharger', { ...form('AMI-ALPHA'), ip: '10.5.5.9' });
  assert.strictEqual(busy.status, 503, 'serveur occupé');
  // …sont coupés après le délai : les places se libèrent.
  await new Promise((r) => setTimeout(r, 4000));
  const ok = await request('POST', '/blobduel/telecharger', { ...form('AMI-ALPHA'), ip: '10.5.5.9' });
  assert.strictEqual(ok.status, 200, 'place libérée');
  stalled.forEach(x => x.req.destroy());
});

test('téléchargement : fichier intact, limites par adresse et par jour', async () => {
  const a1 = await request('POST', '/blobduel/telecharger', { ...form('ami-alpha'), ip: '10.2.0.1' });
  assert.strictEqual(a1.status, 200);
  assert.strictEqual(a1.headers['content-type'], 'application/zip');
  assert.match(a1.headers['content-disposition'], /attachment/);
  assert.strictEqual(a1.sha, PLAIN_SHA, 'fichier déchiffré identique');
  assert.strictEqual(a1.size, PLAIN.length);
  assert.strictEqual((await request('POST', '/blobduel/telecharger', { ...form('AMI-BETA'), ip: '10.2.0.1' })).status, 200);
  assert.strictEqual((await request('POST', '/blobduel/telecharger', { ...form('AMI-BETA'), ip: '10.2.0.1' })).status, 429,
    'limite par adresse');
  assert.strictEqual((await request('POST', '/blobduel/telecharger', { ...form('AMI-BETA'), ip: '10.2.0.2' })).status, 200);
  assert.strictEqual((await request('POST', '/blobduel/telecharger', { ...form('AMI-BETA'), ip: '10.2.0.3' })).status, 200);
  assert.strictEqual((await request('POST', '/blobduel/telecharger', { ...form('AMI-BETA'), ip: '10.2.0.4' })).status, 503,
    'limite du jour');
});

function wsOpen(origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/battle/ws', { headers: origin ? { Origin: origin } : {} });
    ws.on('open', () => resolve(ws));
    ws.on('error', () => resolve(null));
  });
}

test('battle : WebSocket fonctionnel, origine et débit contrôlés', async () => {
  const ok = await wsOpen('https://tdinvasion.com');
  assert.ok(ok, 'connexion depuis le site');
  const msg = await new Promise((r) => ok.once('message', (d) => r(String(d))));
  assert.ok(msg.length > 0);
  ok.send(JSON.stringify({ t: 'join', name: 'Ok‮evil\u0000', skin: '../../x' }));
  ok.send(JSON.stringify({ t: 'input', ang: 'NaN', dist: 1e309, shooting: 'yes' }));
  ok.send('{pas du json');
  ok.close();
  assert.strictEqual(await wsOpen('https://site-pirate.example'), null, 'origine étrangère refusée');
  const flood = await wsOpen('https://tdinvasion.com');
  const closed = new Promise((r) => flood.on('close', (code) => r(code)));
  for (let i = 0; i < 200; i++) flood.send('{"t":"input","ang":0,"dist":0}');
  assert.strictEqual(await closed, 1008, 'inondation coupée');
  const tooBig = await wsOpen('https://tdinvasion.com');
  const closed2 = new Promise((r) => tooBig.on('close', (code) => r(code)));
  tooBig.send('x'.repeat(10000));
  assert.strictEqual(await closed2, 1009, 'message trop gros coupé');
});

test('limiteur plein : seules les entrées les plus anciennes sont oubliées', () => {
  const { RateLimiter } = require('../security');
  const l = new RateLimiter(1, 60000, 100);
  l.hit('victime-bloquee'); l.hit('victime-bloquee');
  for (let i = 0; i < 300; i++) l.hit('faux-' + i);
  assert.ok(l.hits.size <= 100);
  // la victime, la plus ancienne, peut être oubliée, mais jamais toutes les entrées d'un coup
  assert.ok(l.hits.size >= 80, 'pas de remise à zéro globale');
});
