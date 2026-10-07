// Borderline · relais multijoueur (WebSocket)
// Reproduit le modèle « salon + présence » : chaque page a un identifiant (peer), rejoint des salons nommés
// et y publie un objet de présence (≤ 4 Kio) que le relais diffuse aux autres membres du salon.
// Le relais ne contient aucune logique de jeu : l'hôte de chaque partie fait tourner la simulation.
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const MAX_PRES = 4096;          // octets de présence par salon et par page
const MAX_ROOMS_PER_PEER = 4;   // lobby + une partie (+ marge)
const MAX_PEERS_PER_ROOM = 24;
const MAX_CONNECTIONS = 1500;
const RATE = 60, BURST = 120;   // messages par seconde (seau à jetons)
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
const rooms = new Map();        // nom → Map(peer → { ws, by, pres })
let connections = 0;
const live = new Set();          // peers connectés
const resumable = new Map();    // jeton → { peer, until } : garde son identifiant après une coupure brève


const send = (ws, o) => { if (ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { } } };
function broadcast(room, o, except) {
  const r = rooms.get(room); if (!r) return;
  const s = JSON.stringify(o);
  for (const [peer, m] of r) if (peer !== except && m.ws.readyState === 1) { try { m.ws.send(s); } catch (e) { } }
}
function leave(c, room) {
  const r = rooms.get(room); if (!r || !r.has(c.peer)) return;
  r.delete(c.peer); c.rooms.delete(room);
  if (!r.size) rooms.delete(room); else broadcast(room, { t: 'bye', room, peer: c.peer });
}

wss.on('connection', ws => {
  if (connections >= MAX_CONNECTIONS) { ws.close(1013, 'plein'); return; }
  connections++;
  const c = { peer: null, tok: null, by: null, rooms: new Set(), tokens: BURST, last: Date.now() };
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    const now = Date.now(); c.tokens = Math.min(BURST, c.tokens + (now - c.last) / 1000 * RATE); c.last = now;
    if (c.tokens < 1) return; c.tokens--;
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (c.peer) return;
      const r = typeof m.tok === 'string' && resumable.get(m.tok);
      if (r && r.until > now && !live.has(r.peer)) { c.peer = r.peer; c.tok = m.tok; }
      else { c.peer = 'p' + crypto.randomBytes(6).toString('hex'); c.tok = crypto.randomBytes(12).toString('hex'); }
      resumable.delete(c.tok); live.add(c.peer);
      return send(ws, { t: 'me', peer: c.peer, tok: c.tok });
    }
    if (!c.peer) return;
    const room = typeof m.room === 'string' ? m.room : '';
    if (m.t === 'join') {
      if (!NAME_RE.test(room)) return send(ws, { t: 'err', room, code: 'invalid_argument' });
      if (typeof m.by === 'string' && /^[a-z0-9]{6,32}$/.test(m.by)) c.by = m.by;
      if (c.rooms.has(room)) return;
      if (c.rooms.size >= MAX_ROOMS_PER_PEER) return send(ws, { t: 'err', room, code: 'limit_reached' });
      let r = rooms.get(room); if (!r) { r = new Map(); rooms.set(room, r); }
      if (r.size >= MAX_PEERS_PER_ROOM) return send(ws, { t: 'err', room, code: 'limit_reached' });
      r.set(c.peer, { ws, by: c.by, pres: {} }); c.rooms.add(room);
      send(ws, { t: 'joined', room, list: [...r].map(([peer, x]) => ({ peer, by: x.by, pres: x.pres })) });
      broadcast(room, { t: 'p', room, peer: c.peer, by: c.by, pres: {} }, c.peer);
    } else if (m.t === 'pres') {
      const r = rooms.get(room), me = r && r.get(c.peer); if (!me || !m.patch || typeof m.patch !== 'object' || Array.isArray(m.patch)) return;
      const next = { ...me.pres };
      for (const k of Object.keys(m.patch)) {
        if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (m.patch[k] === null) delete next[k]; else next[k] = m.patch[k];
      }
      const s = JSON.stringify(next);
      if (Buffer.byteLength(s) > MAX_PRES) return send(ws, { t: 'err', room, code: 'invalid_argument' });
      me.pres = next;
      broadcast(room, { t: 'p', room, peer: c.peer, by: c.by, pres: next }, c.peer);
    } else if (m.t === 'leave') leave(c, room);
  });
  const bye = () => {
    for (const room of [...c.rooms]) leave(c, room); connections--;
    if (c.peer) { live.delete(c.peer); resumable.set(c.tok, { peer: c.peer, until: Date.now() + 120000 }); }
  };
  ws.on('close', bye);
  ws.on('error', () => { });
});
setInterval(() => { const now = Date.now(); for (const [k, v] of resumable) if (v.until < now) resumable.delete(k); }, 60000).unref();
// ping régulier : coupe les connexions mortes
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { } } }, 30000).unref();

module.exports = {
  path: '/borderline/ws',
  handleUpgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); },
  stats() { return { connections, rooms: rooms.size }; }
};
