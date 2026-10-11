'use strict';
/**
 * Téléchargement protégé de BLOB DUEL.
 *
 * Le dépôt du site est public : le jeu n'y est donc stocké que CHIFFRÉ
 * (AES-256-GCM, dossier private/, jamais servi tel quel). Au démarrage, le
 * serveur le déchiffre avec la clé BLOBDUEL_FILE_KEY (variable d'environnement
 * Railway, jamais dans le dépôt), vérifie son empreinte SHA-256, puis ne
 * l'envoie qu'en réponse au formulaire de la page /blobduel/, après ces
 * contrôles, dans l'ordre :
 *   1. code d'accès : BLOBDUEL_ACCESS_CODE="CODE1,CODE2,…" (un code par ami,
 *      révocable) ; 5 codes faux en 15 min → blocage 15 min de cette adresse ;
 *   2. envois simultanés : BLOBDUEL_MAX_CONCURRENT (déf. 4), 15 min max chacun ;
 *   3. limite globale :    BLOBDUEL_MAX_PER_DAY téléchargements / jour (déf. 200) ;
 *   4. limite par adresse : BLOBDUEL_MAX_PER_IP téléchargements / 24 h (déf. 5).
 * Aucune adresse IP n'est stockée (empreinte salée renouvelée chaque jour).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { RateLimiter, send, ROOT } = require('./security');

const VERSION = '0.8.0';
const FILE_NAME = 'BlobDuel-' + VERSION + '-windows.zip';
const EXPECTED_SHA256 = process.env.BLOBDUEL_TEST_SHA256 || 'e03c1276e3144d689c9c63e5e81a06546df67136c8811d9a72353fe55e9d9ed0';
const ENC_PATH = process.env.BLOBDUEL_TEST_ENC_FILE || path.join(ROOT, 'private', 'blobduel', FILE_NAME + '.enc');
const PAGE_PATH = path.join(ROOT, 'blobduel', 'index.html');
const MAGIC = Buffer.from('BDENC1');
const SEND_TIMEOUT_MS = 15 * 60 * 1000;

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v >= 0 ? v : def;
}

function codes() {
  return (process.env.BLOBDUEL_ACCESS_CODE || '')
    .split(',').map(c => c.trim().toUpperCase()).filter(c => c.length >= 4);
}

function sha(s) { return crypto.createHash('sha256').update(s).digest(); }

/** Comparaison en temps constant avec chacun des codes valides. */
function codeOk(given) {
  const list = codes();
  // Sans code configuré, le téléchargement reste FERMÉ, sauf si on l'ouvre
  // à tous explicitement (BLOBDUEL_PUBLIC=1).
  if (list.length === 0) return process.env.BLOBDUEL_PUBLIC === '1';
  const g = sha(String(given || '').trim().toUpperCase());
  let ok = false;
  for (const c of list) ok = crypto.timingSafeEqual(g, sha(c)) || ok;
  return ok;
}

/** Chiffre un fichier (outil de publication : tools/chiffrer-blobduel.js). */
function encryptFile(src, dst, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('clé : 64 caractères hexadécimaux attendus');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(fs.readFileSync(src)), c.final()]);
  fs.writeFileSync(dst, Buffer.concat([MAGIC, iv, body, c.getAuthTag()]));
}

/** Déchiffre le jeu dans un fichier temporaire privé ; retourne {path,size} ou null. */
function decryptToTemp(keyHex) {
  const key = Buffer.from(String(keyHex || ''), 'hex');
  if (key.length !== 32) { console.log('[blobduel] BLOBDUEL_FILE_KEY absente ou invalide : téléchargement désactivé'); return null; }
  let data;
  try { data = fs.readFileSync(ENC_PATH); } catch (e) { console.log('[blobduel] fichier chiffré absent'); return null; }
  if (data.length < MAGIC.length + 28 || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
    console.log('[blobduel] fichier chiffré invalide'); return null;
  }
  const iv = data.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = data.subarray(data.length - 16);
  let plain;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    plain = Buffer.concat([d.update(data.subarray(MAGIC.length + 12, data.length - 16)), d.final()]);
  } catch (e) { console.log('[blobduel] déchiffrement refusé (mauvaise clé ou fichier modifié)'); return null; }
  const digest = crypto.createHash('sha256').update(plain).digest('hex');
  if (digest !== EXPECTED_SHA256) { console.log('[blobduel] empreinte inattendue : fichier refusé'); return null; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blobduel-'));
  const out = path.join(dir, FILE_NAME);
  fs.writeFileSync(out, plain, { mode: 0o600 });
  console.log('[blobduel] fichier ' + VERSION + ' déchiffré et vérifié');
  return { path: out, size: plain.length };
}

function createBlobDuel() {
  const perIp = new RateLimiter(envInt('BLOBDUEL_MAX_PER_IP', 5), 24 * 3600 * 1000);
  const failures = new RateLimiter(5, 15 * 60 * 1000);
  const file = decryptToTemp(process.env.BLOBDUEL_FILE_KEY);
  let day = '';
  let todayCount = 0;
  let active = 0;

  function page(res, headers, status, title, text) {
    const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
      '<title>' + title + ' — BLOB DUEL</title><link rel="stylesheet" href="/blobduel/style.css"></head>' +
      '<body><div class="colonne"><nav class="barre" aria-label="Site"><a href="/blobduel/">← BLOB DUEL</a><a href="/">tdinvasion.com</a></nav><main class="texte"><h1 class="titre petit">' + title + '</h1>' +
      '<p>' + text + '</p><p><a href="/blobduel/">Retour à la page du jeu</a></p></main></div></body></html>';
    send(res, status, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, html);
  }

  function readBody(req, max, cb) {
    let size = 0;
    const chunks = [];
    let done = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { done = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) cb(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', () => {});
  }

  function download(req, res, ctx) {
    const h = ctx.headers;
    const ctype = String(req.headers['content-type'] || '');
    if (!ctype.startsWith('application/x-www-form-urlencoded')) {
      return page(res, h, 415, 'Demande invalide', 'Utilise le bouton de téléchargement de la page.');
    }
    // L'essai est compté AVANT de lire le code : des requêtes envoyées en
    // parallèle ne peuvent pas dépasser la limite de 5.
    if (!failures.hit(ctx.token)) {
      return page(res, h, 429, 'Trop d\'essais', 'Trop de codes incorrects. Réessaie dans 15 minutes.');
    }
    readBody(req, 1024, (body) => {
      const code = new URLSearchParams(body).get('code') || '';
      if (code.length > 64 || !codeOk(code)) {
        console.log('[blobduel] code refusé');
        return page(res, h, 403, 'Code incorrect', 'Vérifie le code d\'accès qu\'on t\'a donné avec le lien.');
      }
      failures.undo(ctx.token);   // bon code : l'essai ne compte pas
      if (!file) {
        return page(res, h, 503, 'Indisponible', 'Le fichier du jeu est momentanément indisponible.');
      }
      if (active >= envInt('BLOBDUEL_MAX_CONCURRENT', 4)) {
        return page(res, h, 503, 'Serveur occupé', 'Plusieurs téléchargements sont en cours. Réessaie dans une minute.');
      }
      const d = new Date().toISOString().slice(0, 10);
      if (d !== day) { day = d; todayCount = 0; }
      if (todayCount >= envInt('BLOBDUEL_MAX_PER_DAY', 200)) {
        return page(res, h, 503, 'Limite du jour atteinte', 'Le nombre de téléchargements du jour est atteint. Réessaie demain.');
      }
      if (!perIp.hit(ctx.token)) {
        return page(res, h, 429, 'Limite atteinte', 'Tu as déjà téléchargé le jeu plusieurs fois aujourd\'hui. Réessaie demain.');
      }
      todayCount++;
      active++;
      console.log('[blobduel] téléchargement n°' + todayCount + ' du jour');
      res.writeHead(200, {
        ...h,
        'Content-Type': 'application/zip',
        'Content-Length': file.size,
        'Content-Disposition': 'attachment; filename="' + FILE_NAME + '"',
        'Cache-Control': 'no-store',
      });
      const stream = fs.createReadStream(file.path);
      let released = false;
      // Un client trop lent (ou qui fait exprès de ne plus lire) ne garde pas
      // sa place indéfiniment.
      const timer = setTimeout(() => res.destroy(), envInt('BLOBDUEL_SEND_TIMEOUT_MS', SEND_TIMEOUT_MS));
      const release = () => { if (!released) { released = true; active--; clearTimeout(timer); } };
      stream.on('error', () => { release(); res.destroy(); });
      res.on('close', () => { release(); stream.destroy(); });
      stream.pipe(res);
    });
  }

  /** Routes dynamiques ; retourne true si la requête a été prise en charge. */
  return function routes(req, res, ctx) {
    const p = ctx.urlPath;
    if (p === '/blobduel/telecharger') {
      if (req.method !== 'POST') {
        send(res, 303, { ...ctx.headers, 'Location': '/blobduel/' });
        return true;
      }
      download(req, res, ctx);
      return true;
    }
    if (p === '/blobduel') {
      send(res, 301, { ...ctx.headers, 'Location': '/blobduel/' });
      return true;
    }
    if ((p === '/blobduel/' || p === '/blobduel/index.html') && (req.method === 'GET' || req.method === 'HEAD')) {
      // La page affiche le champ « code d'accès » seulement s'il est exigé.
      fs.readFile(PAGE_PATH, 'utf8', (err, html) => {
        if (err) return send(res, 404, ctx.headers, 'Introuvable');
        const out = html.replace('<!--CHAMP_CODE-->', process.env.BLOBDUEL_PUBLIC === '1' && !codes().length ? '' : ' visible');
        send(res, 200, { ...ctx.headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
          req.method === 'HEAD' ? undefined : out);
      });
      return true;
    }
    return false;
  };
}

module.exports = { createBlobDuel, codeOk, encryptFile, FILE_NAME, EXPECTED_SHA256, VERSION };
