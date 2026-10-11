'use strict';
/**
 * Sécurité HTTP du site tdinvasion.com
 *
 *  - service de fichiers statiques en LISTE BLANCHE : seules les extensions web
 *    connues sont servies ; code serveur, fichiers cachés (.git, .env…),
 *    dossiers privés et tests ne sont JAMAIS envoyés ;
 *  - protection contre la traversée de dossiers (../, %2e%2e, octet nul…) ;
 *  - envoi des fichiers en flux (pas de chargement complet en mémoire) ;
 *  - en-têtes de sécurité (nosniff, HSTS, Referrer-Policy, Permissions-Policy)
 *    et, pour /blobduel/, une politique de contenu stricte (CSP) ;
 *  - limitation du nombre de requêtes par adresse IP ;
 *  - aucune adresse IP n'est stockée : les compteurs utilisent une empreinte
 *    salée qui change chaque jour.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

// Fichiers et dossiers jamais servis, même s'ils existent à la racine.
const DENIED_FILES = new Set([
  'server.js', 'security.js', 'blobduel-download.js',
  'package.json', 'package-lock.json', 'nixpacks.toml',
]);
const DENIED_DIRS = new Set(['node_modules', 'private', 'tests', 'tools']);

// ---------------------------------------------------------------------------
// Adresse IP (derrière le proxy de Railway) → empreinte anonyme du jour
// ---------------------------------------------------------------------------
let saltDay = '';
let salt = crypto.randomBytes(32);
function dayKey() { return new Date().toISOString().slice(0, 10); }

/**
 * Adresse du visiteur. Le proxy de Railway AJOUTE l'adresse réelle à la fin de
 * X-Forwarded-For : les valeurs placées avant peuvent être inventées par le
 * visiteur, on prend donc la DERNIÈRE. CLIENT_IP_HEADER permet d'utiliser un
 * autre en-tête posé par l'hébergeur (ex. x-real-ip) ; TRUST_PROXY=0 ignore
 * les en-têtes (serveur exposé directement).
 */
function clientIp(req) {
  if (process.env.TRUST_PROXY !== '0') {
    const name = (process.env.CLIENT_IP_HEADER || 'x-forwarded-for').toLowerCase();
    const v = req.headers[name];
    if (typeof v === 'string' && v.length < 1024) {
      const parts = v.split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1].slice(0, 64);
    }
  }
  return req.socket.remoteAddress || 'inconnue';
}

/** Empreinte HMAC de l'IP, salée par un secret aléatoire renouvelé chaque jour. */
function ipToken(req) {
  const d = dayKey();
  if (d !== saltDay) { saltDay = d; salt = crypto.randomBytes(32); }
  return crypto.createHmac('sha256', salt).update(clientIp(req)).digest('base64url').slice(0, 22);
}

// ---------------------------------------------------------------------------
// Limiteur de débit (fenêtre glissante simple, mémoire bornée)
// ---------------------------------------------------------------------------
class RateLimiter {
  constructor(limit, windowMs, maxKeys = 50000) {
    this.limit = limit; this.windowMs = windowMs; this.maxKeys = maxKeys;
    this.hits = new Map();
    const t = setInterval(() => this.cleanup(), Math.max(10000, windowMs));
    if (t.unref) t.unref();
  }
  /** Compte un coup ; retourne false si la limite est dépassée. */
  hit(key, cost = 1) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || now - e.start >= this.windowMs) {
      if (!e && this.hits.size >= this.maxKeys) this.cleanup(true);
      e = { start: now, count: 0 };
      this.hits.delete(key);
      this.hits.set(key, e);   // ordre d'insertion = du plus ancien au plus récent
    }
    e.count += cost;
    return e.count <= this.limit;
  }
  /** Annule un coup compté par avance. */
  undo(key, cost = 1) {
    const e = this.hits.get(key);
    if (e) e.count = Math.max(0, e.count - cost);
  }
  count(key) {
    const e = this.hits.get(key);
    if (!e || Date.now() - e.start >= this.windowMs) return 0;
    return e.count;
  }
  cleanup(force = false) {
    const now = Date.now();
    for (const [k, e] of this.hits) if (now - e.start >= this.windowMs) this.hits.delete(k);
    // Table pleine : on oublie seulement les 10 % d'entrées les plus anciennes
    // (jamais tout d'un coup, ce qui remettrait tous les blocages à zéro).
    if (force && this.hits.size >= this.maxKeys) {
      let n = Math.ceil(this.maxKeys / 10);
      for (const k of this.hits.keys()) { if (n-- <= 0) break; this.hits.delete(k); }
    }
  }
}

// ---------------------------------------------------------------------------
// En-têtes
// ---------------------------------------------------------------------------
function baseHeaders(urlPath) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=15552000',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
  if (urlPath === '/blobduel' || urlPath.startsWith('/blobduel/')) {
    // Page de téléchargement : tout est hébergé ici, rien d'externe n'est chargé.
    h['Content-Security-Policy'] = "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; " +
      "form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
    h['X-Frame-Options'] = 'DENY';
    h['Cross-Origin-Opener-Policy'] = 'same-origin';
    h['Cross-Origin-Resource-Policy'] = 'same-origin';
  }
  if (urlPath === '/admin.html' || urlPath === '/admin') {
    // Panneau d'administration : jamais indexé, jamais intégré dans une autre
    // page (vol de clics), scripts limités aux seules sources nécessaires.
    h['X-Robots-Tag'] = 'noindex, nofollow';
    h['X-Frame-Options'] = 'DENY';
    h['Cache-Control'] = 'no-store';
    h['Content-Security-Policy'] = "default-src 'none'; " +
      "script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com; " +
      "style-src 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src https://invasion-server-production.up.railway.app; " +
      "form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
  }
  return h;
}

// Où signaler une faille (norme RFC 9116).
const SECURITY_TXT = 'Contact: https://discord.gg/mPKWRdmxbw\n' +
  'Expires: 2027-10-01T00:00:00.000Z\n' +
  'Preferred-Languages: fr, en\n' +
  'Canonical: https://tdinvasion.com/.well-known/security.txt\n';

function send(res, status, headers, body) {
  if (res.headersSent) return;
  res.writeHead(status, headers);
  res.end(body);
}

// ---------------------------------------------------------------------------
// Résolution sûre d'un chemin d'URL vers un fichier autorisé
// ---------------------------------------------------------------------------
/** Retourne le chemin absolu d'un fichier servable, ou null. */
/**
 * Forme canonique d'un chemin d'URL : décodé une fois, sans « // », sans
 * « . » ni « .. ». Retourne null si le chemin est invalide ou suspect.
 * Les en-têtes, les routes et les fichiers utilisent TOUS cette forme : un
 * encodage détourné (%61dmin.html, //blobduel/…) ne peut pas échapper aux
 * protections d'une page.
 */
function canonicalPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (e) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes('%')) return null;
  const segments = decoded.split('/').filter(Boolean);
  for (const s of segments) if (s === '..' || s === '.') return null;
  return '/' + segments.join('/') + (segments.length && decoded.endsWith('/') ? '/' : '');
}

function resolveStatic(urlPath) {
  let decoded = canonicalPath(urlPath);
  if (decoded === null) return null;
  if (decoded.endsWith('/')) decoded += 'index.html';
  const segments = decoded.split('/').filter(Boolean);
  for (const s of segments) {
    if (s === '..' || s.startsWith('.')) return null;   // .git, .env, ../
  }
  if (segments.length && DENIED_DIRS.has(segments[0])) return null;
  if (segments.length === 1 && DENIED_FILES.has(segments[0])) return null;
  const abs = path.resolve(ROOT, ...segments);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  const ext = path.extname(abs).toLowerCase();
  if (!MIME[ext]) return null;
  return abs;
}

function serveFile(req, res, abs, extraHeaders, status = 200) {
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders }, 'Introuvable');
    const ext = path.extname(abs).toLowerCase();
    const etag = '"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"';
    const cacheable = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff2', '.mp3', '.ogg', '.wav'].includes(ext);
    const headers = {
      ...extraHeaders,
      'Content-Type': MIME[ext],
      'Content-Length': st.size,
      'ETag': etag,
      'Cache-Control': cacheable ? 'public, max-age=3600' : 'no-cache',
    };
    if (status === 200 && req.headers['if-none-match'] === etag) {
      delete headers['Content-Length'];
      return send(res, 304, headers);
    }
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(abs);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

// ---------------------------------------------------------------------------
// Gestionnaire principal
// ---------------------------------------------------------------------------
/**
 * @param {object} opts
 * @param {Function} [opts.routes] (req, res, ctx) => boolean : routes dynamiques
 * @param {number} [opts.requestsPerMinute]
 */
function createHandler(opts = {}) {
  const perMinute = opts.requestsPerMinute || Number(process.env.HTTP_REQUESTS_PER_MINUTE) || 600;
  const limiter = new RateLimiter(perMinute, 60000);
  return function handler(req, res) {
    const rawUrl = typeof req.url === 'string' ? req.url : '/';
    if (rawUrl.length > 2048) return send(res, 414, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Adresse trop longue');
    const rawPath = rawUrl.split('?')[0].split('#')[0] || '/';
    const urlPath = canonicalPath(rawPath);
    if (urlPath === null) {
      return send(res, 400, { ...baseHeaders('/'), 'Content-Type': 'text/plain; charset=utf-8' }, 'Adresse invalide');
    }
    // Adresse écrite autrement que sous sa forme canonique : redirection.
    if (encodeURI(urlPath) !== rawPath && (req.method === 'GET' || req.method === 'HEAD')) {
      const q = rawUrl.indexOf('?');
      return send(res, 301, { ...baseHeaders(urlPath), 'Location': encodeURI(urlPath) + (q >= 0 ? rawUrl.slice(q) : '') });
    }
    const headers = baseHeaders(urlPath);
    const token = ipToken(req);
    if (!limiter.hit(token)) {
      return send(res, 429, { ...headers, 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8' }, 'Trop de requêtes, réessaie dans une minute.');
    }
    const ctx = { urlPath, headers, token, ip: clientIp };
    if (urlPath === '/.well-known/security.txt' && (req.method === 'GET' || req.method === 'HEAD')) {
      return send(res, 200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_TXT);
    }
    if (opts.routes && opts.routes(req, res, ctx)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { ...headers, 'Allow': 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Méthode non autorisée');
    }
    const abs = resolveStatic(urlPath);
    if (abs) {
      return fs.stat(abs, (err, st) => {
        if (!err && st.isFile()) return serveFile(req, res, abs, headers);
        fallback();
      });
    }
    fallback();
    // Comportement d'origine du site : toute adresse inconnue renvoie la page
    // d'accueil du jeu (application d'une seule page).
    function fallback() {
      serveFile(req, res, path.join(ROOT, 'index.html'), baseHeaders('/'));
    }
  };
}

/** Durcit les délais du serveur HTTP contre les connexions lentes (slowloris). */
function hardenServer(server) {
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 10000;
  server.maxHeadersCount = 64;
}

module.exports = { canonicalPath, clientIp, createHandler, hardenServer, resolveStatic, RateLimiter, ipToken, baseHeaders, send, serveFile, ROOT };
