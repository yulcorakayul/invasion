// === CONFIG ===
function escapeHtml(s) { let d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
const PEER_CONFIG = { config: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
]}};
const GRID = 20;

// Measure bar overhead with canvas hidden, then compute CS to fit viewport
let BARS_H;
let CS = (function() {
    const c = document.getElementById('game');
    c.style.display = 'none';
    const wb = document.getElementById('wb-waves');
    const tmp = document.createElement('div');
    tmp.className = 'wc';
    tmp.innerHTML = '<span class="wn">1/20</span><span class="wt">Norm</span><span class="wc-hp">5x 60hp</span>';
    wb.appendChild(tmp);
    BARS_H = document.getElementById('wrap').offsetHeight;
    wb.removeChild(tmp);
    c.style.display = '';
    return Math.max(18, Math.min(28, Math.floor((window.innerHeight - BARS_H - 10) / GRID)));
})();

let GX = CS;
let CANVAS_W = (GRID + 2) * CS;
let CANVAS_H = GRID * CS;

// Generate 2 random entry zones: one of 3 cells, one of 2, never adjacent
function generateEntryGroups() {
    const sA = Math.floor(Math.random() * (GRID - 2)); // 3-cell group start (0..17)
    const validB = [];
    for (let s = 0; s <= GRID - 2; s++) {
        if (s <= sA - 3 || s >= sA + 4) validB.push(s);
    }
    const sB = validB[Math.floor(Math.random() * validB.length)];
    const gA = [sA, sA + 1, sA + 2];
    const gB = [sB, sB + 1];
    return sA < sB ? [gA, gB] : [gB, gA];
}
const ENTRY_GROUPS = generateEntryGroups();
const ENTRY_GROUP_WEIGHTS = ENTRY_GROUPS.map(g => g.length);
const ENTRY_ROWS = ENTRY_GROUPS.flat();
function generateExitGroups() {
    const sA = Math.floor(Math.random() * (GRID - 2));
    const validB = [];
    for (let s = 0; s <= GRID - 2; s++) {
        if (s <= sA - 3 || s >= sA + 4) validB.push(s);
    }
    const sB = validB[Math.floor(Math.random() * validB.length)];
    const gA = [sA, sA + 1, sA + 2];
    const gB = [sB, sB + 1];
    return sA < sB ? [gA, gB] : [gB, gA];
}
const EXIT_GROUPS = generateExitGroups();
const EXIT_ROWS = EXIT_GROUPS.flat();
const ENTRY_COL = 0;
const EXIT_COL = GRID - 1;

function setEntryGroups(groups) {
    ENTRY_GROUPS.splice(0, ENTRY_GROUPS.length, ...groups);
    ENTRY_GROUP_WEIGHTS.splice(0, ENTRY_GROUP_WEIGHTS.length, ...groups.map(g => g.length));
    ENTRY_ROWS.splice(0, ENTRY_ROWS.length, ...groups.flat());
}

function setExitGroups(groups) {
    EXIT_GROUPS.splice(0, EXIT_GROUPS.length, ...groups);
    EXIT_ROWS.splice(0, EXIT_ROWS.length, ...groups.flat());
}

// Seeded PRNG (mulberry32) for deterministic duel spawns
function seededRandom(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function pickEntryRow(validRows, randFn) {
    const rf = randFn || Math.random;
    const groups = ENTRY_GROUPS.map((g, i) => ({ rows: g.filter(r => validRows.includes(r)), w: ENTRY_GROUP_WEIGHTS[i] })).filter(g => g.rows.length > 0);
    if (groups.length === 0) return undefined;
    let totalW = groups.reduce((s, g) => s + g.w, 0);
    let rng = rf() * totalW;
    for (const g of groups) { rng -= g.w; if (rng <= 0) return g.rows[Math.floor(rf() * g.rows.length)]; }
    const last = groups[groups.length - 1];
    return last.rows[Math.floor(rf() * last.rows.length)];
}

let TOWER_TYPES = [];

let ENEMY_TYPES = {};

let WAVES = [];
let SPAWN_INT = 0.7;
let _configLoaded = false;

// === STATE ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
document.getElementById('wrap').style.width = CANVAS_W + 'px';

let grid = [];
let towers = [];
let enemies = [];
let projectiles = [];
let gold = 160;
let lives = 20;
let waveActive = false;
let waveNum = 0;
let placingType = -1;
let enemiesToSpawn = 0;
let spawnTimer = 0;
let hoveredCell = null;
let selectedTower = null;
let messageTimer = 0;
let floatingTexts = [];
let score = 0;
let nextWaveTimer = 0;
let explosions = [];
let waveDuration = 0;
let waveSpawnRows = [];
let waveSpawnIdx = 0;
let gameOverPlayed = false;
let gameSpeed = 1;

// === DUEL STATE ===
let isDuel = false;
let peer = null;
let conn = null;
let isHost = false;
let opponentLives = 20;
let opponentScore = 0;
let opponentWave = 0;
let gameStartTime = 0;
let gameEndTime = 0;
let duelEnded = false;
let opponentFinished = false;
let opponentFinalScore = 0;
let opponentFinalTime = 0;
// _fromSync removed — replaced by startWave(sync) parameter
let _lastStatusSend = 0;
let duelResultTitle = '';
let duelResultSub = '';
let duelStartTimer = 0;
let _bgInterval = null;
let oppBoardData = null;

// === MULTIPLAYER STATE ===
let isMulti = false;
let multiPlayers = new Map();
let multiConns = [];
let myPlayerId = '';
let selectedViewPlayer = null;
let multiStartTimer = 0;
let multiEnded = false;
let multiResultTitle = '';
let multiResultSub = '';
let _lastMultiStatusSend = 0;
let _multiRoster = []; // full roster with peer IDs for host migration
let _multiHostId = ''; // current host peer ID
let _migrationConnHandler = null;
let _migrationTimer = null;

// === EMOTE STATE ===
const EMOTES = ['\u{1F44F}', '\u{1F340}', '\u{1F44D}', '\u{1F914}', '\u{1F612}', '\u{1F480}'];
let _emoteSendTimes = [];
let _emoteMuted = false;

function spawnGoldText(x, y, amount) {
    floatingTexts.push({ x, y, text: '+' + amount + 'g', life: 0.8, maxLife: 0.8 });
}

function finalScore() { return score + lives * 10; }

function killEnemy(e) {
    e.alive = false;
    if (isMulti && lives <= 0) return; // Dead multi players: no more rewards
    gold += e.reward;
    score += (ENEMY_TYPES[e.typeName] || {}).pts || 1;
    spawnGoldText(e.x, e.y, e.reward);
    playSfx('kill');
    updateUI();
}

function applyDamage(e, dmg) {
    if (!e.alive || e.hp <= 0) return;
    const actual = e.shield > 0 ? Math.max(1, dmg - e.shield) : dmg;
    e.hp -= actual;
    if (e.hp <= 0) killEnemy(e);
}

for (let r = 0; r < GRID; r++) {
    grid[r] = [];
    for (let c = 0; c < GRID; c++) grid[r][c] = 0;
}

// === HELPERS ===
function cellX(c) { return GX + c * CS + CS / 2; }
function cellY(r) { return r * CS + CS / 2; }
function pxToCol(px) { return Math.floor((px - GX) / CS); }
function pxToRow(py) { return Math.floor(py / CS); }
function getTowerAt(r, c) { return towers.find(t => t.row === r && t.col === c) || null; }

// === PATHFINDING ===
function findPath(startR, startC, endC, ghost) {
    if (!ghost && grid[startR][startC] === 1) return null;
    const vis = Array.from({ length: GRID }, () => Array(GRID).fill(false));
    const par = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const q = [[startR, startC]];
    vis[startR][startC] = true;
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
    while (q.length) {
        const [r, c] = q.shift();
        if (c === endC && EXIT_ROWS.includes(r)) {
            const path = [];
            let cur = [r, c];
            while (cur) { path.unshift(cur); cur = par[cur[0]][cur[1]]; }
            return path;
        }
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !vis[nr][nc] && (ghost || grid[nr][nc] !== 1)) {
                vis[nr][nc] = true;
                par[nr][nc] = [r, c];
                q.push([nr, nc]);
            }
        }
    }
    return null;
}

function canReachExit(startR, startC, endC, targetExitRows) {
    if (grid[startR][startC] === 1) return false;
    const vis = Array.from({ length: GRID }, () => Array(GRID).fill(false));
    const q = [[startR, startC]];
    vis[startR][startC] = true;
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
    while (q.length) {
        const [r, c] = q.shift();
        if (c === endC && targetExitRows.includes(r)) return true;
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !vis[nr][nc] && grid[nr][nc] !== 1) {
                vis[nr][nc] = true;
                q.push([nr, nc]);
            }
        }
    }
    return false;
}

function pathExists(testGrid) {
    const old = grid;
    grid = testGrid;
    let allOk = true;
    // Check each entry group can reach at least one exit
    for (const group of ENTRY_GROUPS) {
        let groupOk = false;
        for (const row of group) {
            if (findPath(row, ENTRY_COL, EXIT_COL)) { groupOk = true; break; }
        }
        if (!groupOk) { allOk = false; break; }
    }
    // Check each exit group is reachable from at least one entry
    if (allOk) {
        for (const exitGroup of EXIT_GROUPS) {
            let exitOk = false;
            for (const eRow of ENTRY_ROWS) {
                if (canReachExit(eRow, ENTRY_COL, EXIT_COL, exitGroup)) { exitOk = true; break; }
            }
            if (!exitOk) { allOk = false; break; }
        }
    }
    grid = old;
    return allOk;
}

function buildWaypoints(gridPath) {
    const wp = [];
    wp.push([CS / 2, gridPath[0][0] * CS + CS / 2]);
    for (const [r, c] of gridPath) wp.push([cellX(c), cellY(r)]);
    const endRow = gridPath[gridPath.length - 1][0];
    wp.push([GX + GRID * CS + CS / 2, endRow * CS + CS / 2]);
    return wp;
}

// === TOWERS ===
class Tower {
    constructor(row, col, type) {
        this.row = row; this.col = col;
        this.type = type;
        this.x = cellX(col);
        this.y = cellY(row);
        this.level = 1;
        this.fireTimer = 0;
        this.angle = 0;
        this.pulseTimer = 0;
        this.totalCost = this.stats.cost;
        this.upgradeTimer = 0;
        this.upgradeDuration = 0;
        this.laserTimer = 0;
        this.laserAngle = 0;
        this.destroyed = false;
    }
    get typeDef() { return TOWER_TYPES[this.type]; }
    get stats() { return this.typeDef.levels[this.level]; }

    getBoostMultiplier() {
        let boost = 0;
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
            const nr = this.row + dr, nc = this.col + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            const adj = getTowerAt(nr, nc);
            if (adj && adj.typeDef.booster && adj.upgradeTimer <= 0) {
                boost += adj.stats.boostPct;
            }
        }
        return 1 + boost;
    }

    upgrade() {
        const lvls = this.typeDef.levels;
        if (this.level >= lvls.length - 1) return false;
        if (this.upgradeTimer > 0) return false;
        const next = lvls[this.level + 1];
        if (gold < next.cost) return false;
        gold -= next.cost;
        this.totalCost += next.cost;
        const nextLevel = this.level + 1;
        this.upgradeDuration = nextLevel >= 5 ? 3 : 1;
        this.upgradeTimer = this.upgradeDuration;
        return true;
    }

    update(dt) {
        if (this.upgradeTimer > 0) {
            this.upgradeTimer -= dt;
            if (this.upgradeTimer <= 0) {
                this.upgradeTimer = 0;
                this.level++;
                updateUI();
            }
            return;
        }
        const st = this.stats;
        const td = this.typeDef;

        // Booster: passive, no firing
        if (td.booster) return;

        // Grenade: explode on first enemy in range
        if (td.grenade) {
            const dmg = Math.round(st.damage * this.getBoostMultiplier());
            for (const e of enemies) {
                if (e.hp <= 0 || !e.alive) continue;
                if (e.stealth && st.range > 3) continue;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < st.range * CS) {
                    for (const e2 of enemies) {
                        if (e2.hp <= 0 || !e2.alive) continue;
                        const d2 = Math.hypot(e2.x - this.x, e2.y - this.y);
                        if (d2 < st.splashR * CS) {
                            applyDamage(e2, dmg);
                        }
                    }
                    explosions.push({ x: this.x, y: this.y, radius: st.splashR * CS, timer: 0.5, maxTimer: 0.5 });
                    playSfx('explosion');
                    this.destroyed = true;
                    grid[this.row][this.col] = 0;
                    if (selectedTower === this) selectedTower = null;
                    return;
                }
            }
            return;
        }

        // Laser: beam in cardinal direction (3 cells)
        if (td.laser) {
            if (this.laserTimer > 0) this.laserTimer -= dt;
            this.fireTimer -= dt;
            if (this.fireTimer > 0) return;
            const ldirs = [
                { dr: -1, dc: 0, angle: -Math.PI / 2 },
                { dr: 1,  dc: 0, angle: Math.PI / 2 },
                { dr: 0,  dc: -1, angle: Math.PI },
                { dr: 0,  dc: 1, angle: 0 },
            ];
            let bestDir = null, bestStep = Infinity;
            for (const dir of ldirs) {
                for (let s = 1; s <= 3; s++) {
                    const cr = this.row + dir.dr * s, cc = this.col + dir.dc * s;
                    if (cr < 0 || cr >= GRID || cc < 0 || cc >= GRID) break;
                    const cx = cellX(cc), cy = cellY(cr);
                    for (const e of enemies) {
                        if (e.hp <= 0 || !e.alive) continue;
                        if (e.stealth && st.range > 3) continue;
                        if (Math.hypot(e.x - cx, e.y - cy) < CS * 0.6 && s < bestStep) {
                            bestDir = dir; bestStep = s;
                        }
                    }
                }
            }
            if (bestDir) {
                this.angle = bestDir.angle;
                this.fireTimer = st.fireRate;
                const dmg = Math.round(st.damage * this.getBoostMultiplier());
                for (let s = 1; s <= 3; s++) {
                    const cr = this.row + bestDir.dr * s, cc = this.col + bestDir.dc * s;
                    if (cr < 0 || cr >= GRID || cc < 0 || cc >= GRID) break;
                    const cx = cellX(cc), cy = cellY(cr);
                    for (const e of enemies) {
                        if (e.hp <= 0 || !e.alive) continue;
                        if (Math.hypot(e.x - cx, e.y - cy) < CS * 0.6) {
                            applyDamage(e, dmg);
                        }
                    }
                }
                this.laserTimer = 0.15;
                this.laserAngle = bestDir.angle;
            }
            return;
        }

        if (this.pulseTimer > 0) this.pulseTimer -= dt;
        this.fireTimer -= dt;
        if (this.fireTimer > 0) return;

        // Aura: damage all in range
        if (td.aura) {
            this.fireTimer = st.fireRate;
            let hit = false;
            for (const e of enemies) {
                if (e.hp <= 0 || !e.alive) continue;
                if (e.stealth && st.range > 3) continue;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < st.range * CS) {
                    applyDamage(e, Math.round(st.damage * this.getBoostMultiplier()));
                    hit = true;
                }
            }
            if (hit) this.pulseTimer = 0.2;
            return;
        }

        // Projectile towers
        if (!enemies.length) return;
        let best = null, bestD = Infinity;
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (td.ghostOnly && !e.ghost) continue;
            if (e.stealth && st.range > 3) continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < st.range * CS && d < bestD) { best = e; bestD = d; }
        }
        if (best) {
            this.angle = Math.atan2(best.y - this.y, best.x - this.x);
            const opts = {};
            if (td.splash) { opts.splash = true; opts.splashR = st.splashR; }
            if (td.slow) { opts.slowFactor = st.slowFactor; opts.slowDur = st.slowDur; }
            projectiles.push(new Projectile(this.x, this.y, best, Math.round(st.damage * this.getBoostMultiplier()), st.color, opts));
            this.fireTimer = st.fireRate;
        }
    }

    draw() {
        this.x = cellX(this.col);
        this.y = cellY(this.row);
        const { x, y, level, type } = this;
        const st = this.stats;
        const td = this.typeDef;
        const bx = GX + this.col * CS, by = this.row * CS;
        ctx.globalAlpha = 1;

        ctx.fillStyle = td.bg;
        ctx.fillRect(bx, by, CS, CS);

        switch (type) {
            case 0: this._drawCannon(x, y, st, level); break;
            case 1: this._drawSniper(x, y, st, level); break;
            case 2: this._drawGel(x, y, st, level); break;
            case 3: this._drawSplash(x, y, st, level); break;
            case 4: this._drawExorciste(x, y, st, level); break;
            case 5: this._drawTesla(x, y, st, level); break;
            case 6: this._drawBooster(x, y, st, level); break;
            case 7: this._drawGrenade(x, y, st, level); break;
            case 8: this._drawLaser(x, y, st, level); break;
        }

        // level badge
        ctx.fillStyle = '#030308';
        ctx.fillRect(bx + CS - 13, by + CS - 13, 12, 12);
        ctx.fillStyle = st.color;
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(level, bx + CS - 7, by + CS - 7);

        // selection
        if (selectedTower === this) {
            if (td.laser) {
                const ldirs = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dr, dc] of ldirs) {
                    for (let s = 1; s <= 3; s++) {
                        const cr = this.row + dr * s, cc = this.col + dc * s;
                        if (cr < 0 || cr >= GRID || cc < 0 || cc >= GRID) break;
                        ctx.fillStyle = 'rgba(255,0,255,' + (0.12 - s * 0.02).toFixed(2) + ')';
                        ctx.fillRect(GX + cc * CS, cr * CS, CS, CS);
                    }
                }
            } else {
                ctx.beginPath();
                ctx.arc(x, y, st.range * CS, 0, Math.PI * 2);
                ctx.strokeStyle = '#00f0ff30';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 1;
            ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 6;
            ctx.strokeRect(bx + 1, by + 1, CS - 2, CS - 2);
            ctx.shadowBlur = 0;
        }

        // Upgrade progress
        if (this.upgradeTimer > 0) {
            const progress = 1 - this.upgradeTimer / this.upgradeDuration;
            // dark overlay
            ctx.fillStyle = 'rgba(3,3,8,0.5)';
            ctx.fillRect(bx, by, CS, CS);
            // circular progress arc
            ctx.beginPath();
            ctx.arc(x, y, CS * 0.38, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 6;
            ctx.stroke();
            ctx.shadowBlur = 0;
            // percentage text
            ctx.fillStyle = '#00f0ff';
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.floor(progress * 100) + '%', x, y);
        }

        // Tesla pulse
        if (td.aura && this.pulseTimer > 0) {
            const a = (this.pulseTimer / 0.2);
            ctx.beginPath();
            ctx.arc(x, y, st.range * CS, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,0,' + a.toFixed(2) + ')';
            ctx.shadowColor = '#ff0'; ctx.shadowBlur = 8 * a;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Laser beam visual
        if (td.laser && this.laserTimer > 0) {
            const a = this.laserTimer / 0.15;
            const beamLen = 3 * CS;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(this.laserAngle);
            ctx.fillStyle = 'rgba(255, 0, 255, ' + (a * 0.3).toFixed(2) + ')';
            ctx.fillRect(0, -CS * 0.3, beamLen, CS * 0.6);
            ctx.fillStyle = 'rgba(255, 100, 255, ' + (a * 0.6).toFixed(2) + ')';
            ctx.fillRect(0, -CS * 0.15, beamLen, CS * 0.3);
            ctx.shadowColor = '#f0f'; ctx.shadowBlur = 10 * a;
            ctx.fillStyle = 'rgba(255, 200, 255, ' + a.toFixed(2) + ')';
            ctx.fillRect(0, -1.5, beamLen, 3);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Booster glow drawn in separate pass (drawBoosterGlows) after all towers
    }

    // shared base: dark outer, color ring, dark inner, color center
    _base(x, y, r, col) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0e18'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0e18'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
    }
    // shared barrel: metallic cylinder
    _barrel(x, y, r, angle, len, w) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
        ctx.fillStyle = '#2a3040'; ctx.fillRect(r * 0.5, -w / 2 - 1, len, w + 2);
        ctx.fillStyle = '#4a5868'; ctx.fillRect(r * 0.5, -w / 2, len, w);
        ctx.fillStyle = '#8098b0'; ctx.fillRect(r * 0.55, -1, len - 2, 2);
        // tip
        ctx.fillStyle = '#3a4858'; ctx.fillRect(r * 0.5 + len - 2, -w / 2 - 1, 3, w + 2);
        ctx.restore();
    }

    _drawCannon(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        this._barrel(x, y, r, this.angle, 10 + lv, 5);
    }

    _drawSniper(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        // long double barrel
        ctx.save(); ctx.translate(x, y); ctx.rotate(this.angle);
        ctx.fillStyle = '#555'; ctx.fillRect(r * 0.4, -4, 14 + lv * 2, 3);
        ctx.fillStyle = '#888'; ctx.fillRect(r * 0.4, -3.5, 14 + lv * 2, 2);
        ctx.fillStyle = '#bbb'; ctx.fillRect(r * 0.45, -2.8, 12 + lv * 2, 0.8);
        ctx.fillStyle = '#555'; ctx.fillRect(r * 0.4, 1, 14 + lv * 2, 3);
        ctx.fillStyle = '#888'; ctx.fillRect(r * 0.4, 1.5, 14 + lv * 2, 2);
        ctx.fillStyle = '#bbb'; ctx.fillRect(r * 0.45, 2.2, 12 + lv * 2, 0.8);
        ctx.restore();
    }

    _drawGel(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        this._barrel(x, y, r, this.angle, 8 + lv, 4);
        // ice crystals on ring
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const d = r * 0.72;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * (d - 3), y + Math.sin(a) * (d - 3));
            ctx.lineTo(x + Math.cos(a) * (d + 3), y + Math.sin(a) * (d + 3));
            ctx.stroke();
        }
    }

    _drawSplash(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        this._barrel(x, y, r, this.angle, 8 + lv, 6);
        // second short barrel
        this._barrel(x, y, r, this.angle + 0.5, 5 + lv, 4);
        this._barrel(x, y, r, this.angle - 0.5, 5 + lv, 4);
    }

    _drawExorciste(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        this._barrel(x, y, r, this.angle, 9 + lv, 4);
        // glowing cross on center
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - r * 0.3, 2, r * 0.6);
        ctx.fillRect(x - r * 0.3, y - 1, r * 0.6, 2);
    }

    _drawTesla(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        // electric arcs instead of barrel
        const t = performance.now() * 0.003;
        const spikes = 4 + Math.min(lv, 3);
        for (let i = 0; i < spikes; i++) {
            const a = (i / spikes) * Math.PI * 2 + t;
            ctx.strokeStyle = col; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * (r * 0.4), y + Math.sin(a) * (r * 0.4));
            const mx = x + Math.cos(a + 0.3) * (r * 0.7);
            const my = y + Math.sin(a + 0.3) * (r * 0.7);
            ctx.lineTo(mx, my);
            ctx.lineTo(x + Math.cos(a) * (r + 3 + lv), y + Math.sin(a) * (r + 3 + lv));
            ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
    }

    _drawBooster(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        // Arrows pointing outward (4 directions)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const sx = x + Math.cos(a) * (r * 0.3);
            const sy = y + Math.sin(a) * (r * 0.3);
            const ex = x + Math.cos(a) * (r + 2);
            const ey = y + Math.sin(a) * (r + 2);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            const ha1 = a + Math.PI * 0.75;
            const ha2 = a - Math.PI * 0.75;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex + Math.cos(ha1) * 4, ey + Math.sin(ha1) * 4);
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex + Math.cos(ha2) * 4, ey + Math.sin(ha2) * 4);
            ctx.stroke();
        }
    }

    _drawGrenade(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        // Bomb body
        ctx.beginPath();
        ctx.arc(x, y + 2, r * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = '#2a2020';
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Fuse
        ctx.beginPath();
        ctx.moveTo(x, y - r * 0.5);
        ctx.quadraticCurveTo(x + 4, y - r * 0.8, x + 2, y - r);
        ctx.strokeStyle = '#aa8844';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Spark
        ctx.beginPath();
        ctx.arc(x + 2, y - r, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0';
        ctx.shadowColor = '#ff0'; ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Highlight
        ctx.beginPath();
        ctx.arc(x - r * 0.2, y, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
    }

    _drawLaser(x, y, st, lv) {
        const r = 10 + lv, col = st.color;
        this._base(x, y, r, col);
        // Laser emitter (pointed shape)
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(r * 0.5, 0);
        ctx.lineTo(r + 4 + lv, 0);
        ctx.lineTo(r * 0.5, -3);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.5, 0);
        ctx.lineTo(r + 4 + lv, 0);
        ctx.lineTo(r * 0.5, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// Draw booster glow overlay on all adjacent cells (after all towers so it's always visible)
function drawBoosterGlows() {
    const t = performance.now() * 0.003;
    const pulse = 0.5 + 0.5 * Math.sin(t);
    for (const b of towers) {
        if (!b.typeDef.booster || b.upgradeTimer > 0) continue;
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
            const nr = b.row + dr, nc = b.col + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            const ax = GX + nc * CS, ay = nr * CS;
            ctx.fillStyle = 'rgba(0, 255, 136, ' + (0.08 + 0.06 * pulse).toFixed(3) + ')';
            ctx.fillRect(ax, ay, CS, CS);
            ctx.strokeStyle = 'rgba(0, 255, 136, ' + (0.3 + 0.2 * pulse).toFixed(2) + ')';
            ctx.lineWidth = 1;
            ctx.strokeRect(ax + 1, ay + 1, CS - 2, CS - 2);
        }
    }
}

// === ENEMIES ===
class Enemy {
    constructor(row, hp, typeName, spawnPos) {
        const et = ENEMY_TYPES[typeName];
        this.typeName = typeName;
        this.hp = hp;
        this.maxHp = hp;
        this.baseSpeed = et.speed;
        this.reward = et.reward;
        this.ghost = !!et.ghost;
        this.scale = et.scale || 1;
        this.canSplit = !!et.splits;
        this.splits = et.splits || 0;
        this.splitHpRatio = et.splitHpRatio || 0;
        this.color = et.color;
        this.strokeColor = et.stroke;
        this.shield = et.shield || 0;
        this.stealth = !!et.stealth;
        this.regenRate = et.regenRate || 0;
        this.slowTimer = 0;
        this.slowMult = 1;
        this.waypoints = [];
        this.wpIdx = 0;
        this.alive = true;

        if (spawnPos) {
            this.x = spawnPos.x;
            this.y = spawnPos.y;
            this.scale = (et.scale || 1) * 0.7;
            this.canSplit = false;
            this.recalcPath();
        } else {
            this.x = CS / 2;
            this.y = row * CS + CS / 2;
            this._initPath(row);
        }
    }

    _initPath(row) {
        const gp = findPath(row, ENTRY_COL, EXIT_COL, this.ghost);
        if (!gp) { this.waypoints = []; return; }
        this.waypoints = buildWaypoints(gp);
        this.wpIdx = 0;
    }

    recalcPath() {
        let gc = Math.max(0, Math.min(GRID - 1, pxToCol(this.x)));
        let gr = Math.max(0, Math.min(GRID - 1, pxToRow(this.y)));
        if (this.x < GX) gc = 0;
        if (this.x >= GX + GRID * CS) return;
        const gp = findPath(gr, gc, EXIT_COL, this.ghost);
        if (!gp) return;
        this.waypoints = [];
        for (const [r, c] of gp) this.waypoints.push([cellX(c), cellY(r)]);
        const endRow = gp[gp.length - 1][0];
        this.waypoints.push([GX + GRID * CS + CS / 2, endRow * CS + CS / 2]);
        this.wpIdx = 1;
    }

    update(dt) {
        if (!this.alive) return;
        if (this.slowTimer > 0) this.slowTimer -= dt;
        // Regen: heal percentage of maxHp per second
        if (this.regenRate > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.regenRate * dt);
        }
        const spd = this.baseSpeed * (this.slowTimer > 0 ? this.slowMult : 1);
        if (this.wpIdx >= this.waypoints.length) {
            this.alive = false;
            if (this.waypoints.length > 0) {
                // Enemy legitimately reached the exit
                lives--;
                playSfx('hit');
                updateUI();
            }
            return;
        }
        const [tx, ty] = this.waypoints[this.wpIdx];
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        const move = spd * CS * dt;
        if (dist <= move) { this.x = tx; this.y = ty; this.wpIdx++; }
        else { this.x += (dx / dist) * move; this.y += (dy / dist) * move; }
    }

    draw() {
        if (!this.alive) return;
        const r = CS * 0.32 * this.scale;
        if (this.stealth) {
            const flicker = 0.15 + 0.15 * Math.sin(performance.now() * 0.008);
            ctx.globalAlpha = flicker;
        }
        if (this.ghost) ctx.globalAlpha = 0.6;

        if (this.ghost) {
            // Ghost shape: dome top + wavy tail bottom
            const s = this.scale;
            const gw = r * 1.1;  // half-width
            const gh = r * 1.4;  // full height
            const topY = this.y - gh * 0.45;
            const botY = this.y + gh * 0.55;
            const wave = Math.sin(performance.now() * 0.006) * 2 * s;
            const teeth = 3; // number of tail waves

            // glow
            ctx.shadowColor = this.strokeColor;
            ctx.shadowBlur = 8;

            ctx.beginPath();
            // dome (top half arc)
            ctx.arc(this.x, topY + gw, gw, Math.PI, 0);
            // right side down
            ctx.lineTo(this.x + gw, botY);
            // wavy bottom
            for (let i = teeth; i >= 0; i--) {
                const tx = this.x + gw - (i * 2 * gw / teeth);
                const ty = botY + ((i % 2 === 0) ? -3 * s + wave : 3 * s + wave);
                ctx.lineTo(tx, ty);
            }
            // left side up
            ctx.lineTo(this.x - gw, topY + gw);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // big ghost eyes (white ovals)
            const eyeY = topY + gw + 1 * s;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(this.x - 3 * s, eyeY, 2.8 * s, 3.2 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(this.x + 3 * s, eyeY, 2.8 * s, 3.2 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            // pupils (look forward)
            ctx.fillStyle = '#226';
            ctx.beginPath();
            ctx.ellipse(this.x - 2 * s, eyeY + 0.5 * s, 1.3 * s, 1.8 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(this.x + 4 * s, eyeY + 0.5 * s, 1.3 * s, 1.8 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.scale > 1.2 ? 2 : 1;
            ctx.stroke();

            // eyes
            const s = this.scale;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.x - 3 * s, this.y - 2 * s, 2.5 * s, 0, Math.PI * 2);
            ctx.arc(this.x + 3 * s, this.y - 2 * s, 2.5 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(this.x - 2 * s, this.y - 2 * s, 1.2 * s, 0, Math.PI * 2);
            ctx.arc(this.x + 4 * s, this.y - 2 * s, 1.2 * s, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.ghost || this.stealth) ctx.globalAlpha = 1;

        // slow ring
        if (this.slowTimer > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#0cf';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // regen aura — green pulsing particles
        if (this.regenRate > 0 && this.hp < this.maxHp) {
            const pulse = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() * 0.005));
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 255, 100, ' + (pulse * 0.7).toFixed(2) + ')';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00ff66'; ctx.shadowBlur = 8 * pulse;
            ctx.stroke();
            ctx.shadowBlur = 0;
            // green + particles rising
            const t = performance.now() * 0.003;
            for (let p = 0; p < 3; p++) {
                const angle = t + p * 2.1;
                const py = this.y - r - 3 - (performance.now() * 0.02 + p * 7) % 12;
                const px = this.x + Math.sin(angle) * (r * 0.6);
                ctx.fillStyle = 'rgba(0, 255, 100, ' + (0.8 - ((performance.now() * 0.02 + p * 7) % 12) / 15).toFixed(2) + ')';
                ctx.fillRect(px - 1, py - 1, 2, 2);
            }
        }

        // shield ring
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#8cf';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // hp bar
        const bw = CS * 0.65 * this.scale, bh = 3;
        const bx = this.x - bw / 2, by = this.y - r - 5;
        ctx.fillStyle = '#0a0e18';
        ctx.fillRect(bx, by, bw, bh);
        const pct = this.hp / this.maxHp;
        ctx.fillStyle = pct > .5 ? '#00ff88' : pct > .25 ? '#ffaa00' : '#ff0066';
        ctx.fillRect(bx, by, bw * pct, bh);
    }
}

// === PROJECTILES ===
class Projectile {
    constructor(x, y, target, damage, color, opts) {
        this.x = x; this.y = y;
        this.target = target;
        this.damage = damage;
        this.color = color;
        this.speed = 8 * CS;
        this.alive = true;
        opts = opts || {};
        this.splash = opts.splash || false;
        this.splashR = opts.splashR || 0;
        this.slowFactor = opts.slowFactor || 0;
        this.slowDur = opts.slowDur || 0;
    }
    update(dt) {
        if (!this.target.alive) { this.alive = false; return; }
        const dx = this.target.x - this.x, dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);
        const move = this.speed * dt;
        if (dist <= move) {
            applyDamage(this.target, this.damage);
            if (this.slowFactor) {
                this.target.slowTimer = this.slowDur;
                this.target.slowMult = this.slowFactor;
            }
            if (this.splash) {
                for (const e of enemies) {
                    if (e === this.target || e.hp <= 0 || !e.alive) continue;
                    const d = Math.hypot(e.x - this.target.x, e.y - this.target.y);
                    if (d < this.splashR * CS) {
                        applyDamage(e, Math.floor(this.damage * 0.5));
                        if (this.slowFactor) { e.slowTimer = this.slowDur; e.slowMult = this.slowFactor; }
                    }
                }
            }
            this.alive = false;
        } else {
            this.x += (dx / dist) * move;
            this.y += (dy / dist) * move;
        }
    }
    draw() {
        if (!this.alive) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.splash ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

// === UI ===
function updateUI() {
    document.getElementById('gold').textContent = gold;
    document.getElementById('lives').textContent = lives;
    document.getElementById('wave').textContent = waveNum + '/' + WAVES.length;

    const wtEl = document.getElementById('v-wtype');
    if (waveActive && waveNum > 0) {
        const cw = WAVES[waveNum - 1];
        wtEl.textContent = cw.types ? '(Mixed)' : '(' + ENEMY_TYPES[cw.type].label + ')';
    } else if (waveNum < WAVES.length) {
        const nw = WAVES[waveNum];
        wtEl.textContent = nw.types ? '\u2192 Mixed' : '\u2192 ' + ENEMY_TYPES[nw.type].label;
    } else {
        wtEl.textContent = '';
    }

    document.getElementById('enemies-left').textContent = enemies.filter(e => e.alive).length + enemiesToSpawn;
    document.getElementById('score').textContent = score;
    for (let i = 0; i < TOWER_TYPES.length; i++) {
        const btn = document.getElementById('tbtn-' + i);
        if (btn) btn.classList.toggle('no-gold', gold < TOWER_TYPES[i].levels[1].cost && placingType !== i);
    }

    const infoDesc = document.getElementById('info-desc');
    const infoTower = document.getElementById('info-tower');
    if (selectedTower) {
        infoDesc.style.display = 'none';
        infoTower.style.display = 'flex';
        const st = selectedTower.stats;
        document.getElementById('tow-name').textContent = selectedTower.typeDef.name;
        document.getElementById('tow-level').textContent = selectedTower.level;
        if (selectedTower.typeDef.booster) {
            document.getElementById('tow-damage').textContent = '+' + Math.round(st.boostPct * 100) + '%';
        } else {
            let boostMul = selectedTower.getBoostMultiplier();
            if (boostMul > 1) {
                document.getElementById('tow-damage').textContent = Math.round(st.damage * boostMul) + ' (' + st.damage + '+' + Math.round((boostMul - 1) * 100) + '%)';
            } else {
                document.getElementById('tow-damage').textContent = st.damage;
            }
        }
        document.getElementById('tow-range').textContent = st.range;
        document.getElementById('tow-rate').textContent = st.fireRate.toFixed(2) + 's';
        const btn = document.getElementById('up-btn');
        const lvls = selectedTower.typeDef.levels;
        if (selectedTower.upgradeTimer > 0) {
            const pct = Math.floor((1 - selectedTower.upgradeTimer / selectedTower.upgradeDuration) * 100);
            btn.textContent = 'Upgrading ' + pct + '%';
            btn.disabled = true;
        } else if (selectedTower.level >= lvls.length - 1) {
            btn.textContent = 'MAX';
            btn.disabled = true;
        } else {
            const c = lvls[selectedTower.level + 1].cost;
            btn.textContent = 'Lv.' + (selectedTower.level + 1) + ' (' + c + 'g)';
            btn.disabled = gold < c;
        }
        const refund = Math.floor(selectedTower.totalCost * 0.4);
        document.getElementById('sell-btn').textContent = 'Sell (' + refund + 'g)';
    } else if (placingType >= 0) {
        infoTower.style.display = 'none';
        infoDesc.style.display = 'flex';
        const tt = TOWER_TYPES[placingType];
        const lv1 = tt.levels[1];
        document.getElementById('sel-name').textContent = tt.name;
        document.getElementById('sel-desc').textContent = tt.desc;
        if (tt.booster) {
            document.getElementById('desc-damage').textContent = '+' + Math.round(lv1.boostPct * 100) + '%';
        } else {
            document.getElementById('desc-damage').textContent = lv1.damage;
        }
        document.getElementById('desc-range').textContent = lv1.range;
        document.getElementById('desc-rate').textContent = lv1.fireRate.toFixed(2) + 's';
        document.getElementById('desc-cost').textContent = lv1.cost + 'g';
    } else {
        infoDesc.style.display = 'none';
        infoTower.style.display = 'none';
    }
    updateWaveBar();
}

function showMessage(msg) {
    messageTimer = 3;
    document.getElementById('msg').textContent = msg;
}

function toggleTowerMode(typeIdx) {
    placingType = placingType === typeIdx ? -1 : typeIdx;
    if (placingType >= 0) selectedTower = null;
    for (let i = 0; i < TOWER_TYPES.length; i++) {
        const btn = document.getElementById('tbtn-' + i);
        if (btn) btn.classList.toggle('on', placingType === i);
    }
    updateUI();
}

function upgradeSelected() {
    if (!selectedTower) return;
    if (selectedTower.upgradeTimer > 0) { showMessage('Upgrade in progress...'); return; }
    if (selectedTower.upgrade()) { showMessage('Upgrade started'); playSfx('upgrade'); updateUI(); }
    else showMessage('Not enough gold');
}

function sellSelected() {
    if (!selectedTower) return;
    const { row, col } = selectedTower;
    grid[row][col] = 0;
    towers = towers.filter(t => t !== selectedTower);
    const refund = Math.floor(selectedTower.totalCost * 0.4);
    gold += refund;
    selectedTower = null;
    playSfx('sell');
    updateUI();
    showMessage('Sold +' + refund + 'g');
    for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); }
}

function getValidEntryRows() {
    return ENTRY_ROWS.filter(r => findPath(r, ENTRY_COL, EXIT_COL));
}

function computeMaxTraversal(speed, ghost) {
    let maxT = 0;
    for (const row of ENTRY_ROWS) {
        const gp = findPath(row, ENTRY_COL, EXIT_COL, ghost);
        if (!gp) continue;
        const wp = buildWaypoints(gp);
        let dist = 0;
        for (let i = 1; i < wp.length; i++) {
            dist += Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]);
        }
        const t = dist / (speed * CS);
        if (t > maxT) maxT = t;
    }
    return maxT;
}

function startWave(sync) {
    // sync: true = send to opponent (manual click), false = don't send (auto-timer / received sync)
    if (sync === undefined) sync = true;
    if (waveActive) return;
    if (waveNum >= WAVES.length) return;
    // Duel: wave 1 only starts via countdown timer
    if (isDuel && waveNum === 0 && duelStartTimer > 0) return;
    if (isMulti && waveNum === 0 && multiStartTimer > 0) return;
    // Multi joiner: send request to host instead of starting locally (only if connected)
    if (isMulti && !isHost && sync && conn && conn.open) {
        conn.send({ type: 'multi_wave_request', waveNum: waveNum + 1 });
        return;
    }
    nextWaveTimer = 0;
    waveDuration = 0;
    if (getValidEntryRows().length === 0) { showMessage('Path blocked!'); return; }
    waveNum++;
    waveActive = true;
    const w = WAVES[waveNum - 1];
    enemiesToSpawn = w.count;
    spawnTimer = 0;
    // Duel/Multi: pre-generate deterministic spawn rows using valid entry rows
    if (isDuel || isMulti) {
        const rng = seededRandom(waveNum);
        const validRows = getValidEntryRows();
        const rowPool = validRows.length > 0 ? validRows : ENTRY_ROWS;
        waveSpawnRows = [];
        waveSpawnIdx = 0;
        for (let i = 0; i < w.count; i++) {
            waveSpawnRows.push(pickEntryRow(rowPool, rng));
        }
    }
    // Timer = durée totale de la vague (spawns + traversée max)
    const et = ENEMY_TYPES[w.type];
    const si = et.spawnInt || SPAWN_INT;
    const maxTrav = computeMaxTraversal(et.speed, !!et.ghost);
    waveDuration = (w.count - 1) * si + maxTrav;
    nextWaveTimer = waveDuration;
    showMessage('Wave ' + waveNum + ' launched');
    playSfx('wave');
    // Duel sync: send wave_start to opponent (only if I initiated manually)
    if (isDuel && sync && conn && conn.open) {
        conn.send({ type: 'wave_start', waveNum: waveNum });
    }
    // Multi sync: host broadcasts wave_start to all
    if (isMulti && sync && isHost) {
        multiConns.forEach(function(c) { if (c.open) c.send({ type: 'multi_wave_start', waveNum: waveNum }); });
    }
    // Track game start time for tiebreaker
    if ((isDuel || isMulti) && waveNum === 1) gameStartTime = Date.now();
    // Duel: opponent is always at the same wave (synced)
    if (isDuel) { opponentWave = waveNum; updateOpponentUI(); }
    updateUI();
}

// === INPUT ===
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const col = pxToCol(e.clientX - rect.left);
    const row = pxToRow(e.clientY - rect.top);
    hoveredCell = (row >= 0 && row < GRID && col >= 0 && col < GRID) ? { row, col } : null;
});
canvas.addEventListener('mouseleave', () => { hoveredCell = null; });

canvas.addEventListener('click', () => {
    if (!hoveredCell) return;
    const { row, col } = hoveredCell;
    const existing = getTowerAt(row, col);
    if (existing) {
        selectedTower = selectedTower === existing ? null : existing;
        placingType = -1;
        for (let i = 0; i < TOWER_TYPES.length; i++) {
            const btn = document.getElementById('tbtn-' + i);
            if (btn) btn.classList.remove('on');
        }
        updateUI();
        return;
    }
    if (selectedTower && placingType < 0) { selectedTower = null; updateUI(); }
    if (placingType < 0) return;
    const ttype = TOWER_TYPES[placingType];
    const cost = ttype.levels[1].cost;
    if (grid[row][col] !== 0) { showMessage('Occupied'); return; }
    // Block placement if an enemy is on this cell
    const cx = cellX(col), cy = cellY(row);
    for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - cx) < CS * 0.5 && Math.abs(e.y - cy) < CS * 0.5) {
            showMessage('Enemy on cell'); return;
        }
    }
    if (gold < cost) { showMessage('Not enough gold'); return; }
    const isGrenade = !!ttype.grenade;
    if (!isGrenade) {
        const test = grid.map(r => [...r]);
        test[row][col] = 1;
        if (!pathExists(test)) { showMessage('Path blocked'); return; }
    }
    grid[row][col] = isGrenade ? 2 : 1;
    towers.push(new Tower(row, col, placingType));
    gold -= cost;
    playSfx('place');
    updateUI();
    if (!isGrenade) { for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); } }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// === DRAW ===
function drawScene() {
    // Background (exterior)
    ctx.fillStyle = '#030308';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // IN zones
    for (const row of ENTRY_ROWS) {
        ctx.fillStyle = '#061810';
        ctx.fillRect(0, row * CS, CS, CS);
    }
    ctx.fillStyle = '#00ff88';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 8;
    for (const group of ENTRY_GROUPS) {
        const cy = (group[0] + group[group.length - 1]) / 2 * CS + CS / 2;
        ctx.fillText('IN', CS / 2, cy);
    }
    ctx.shadowBlur = 0;

    // OUT zones
    const outX = GX + GRID * CS;
    for (const row of EXIT_ROWS) {
        ctx.fillStyle = '#180808';
        ctx.fillRect(outX, row * CS, CS, CS);
    }
    ctx.fillStyle = '#ff0066';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff0066'; ctx.shadowBlur = 8;
    for (const group of EXIT_GROUPS) {
        const cy = (group[0] + group[group.length - 1]) / 2 * CS + CS / 2;
        ctx.fillText('OUT', outX + CS / 2, cy);
    }
    ctx.shadowBlur = 0;

    // Separators
    ctx.strokeStyle = '#00f0ff15'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(GX, 0); ctx.lineTo(GX, CANVAS_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(outX, 0); ctx.lineTo(outX, CANVAS_H); ctx.stroke();

    // Grid — dark cyber board with subtle grid lines
    const boardX = GX, boardW = GRID * CS, boardH = CANVAS_H;
    ctx.fillStyle = '#080c14';
    ctx.fillRect(boardX, 0, boardW, boardH);

    // Subtle grid lines (arcade style)
    ctx.strokeStyle = '#0a1828';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= GRID; c++) {
        const x = boardX + c * CS;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, boardH); ctx.stroke();
    }
    for (let r = 0; r <= GRID; r++) {
        const y = r * CS;
        ctx.beginPath(); ctx.moveTo(boardX, y); ctx.lineTo(boardX + boardW, y); ctx.stroke();
    }

    // Hover
    if (hoveredCell && placingType >= 0) {
        const hx = GX + hoveredCell.col * CS, hy = hoveredCell.row * CS;
        const tt = TOWER_TYPES[placingType].levels[1];
        const hcx = cellX(hoveredCell.col), hcy = cellY(hoveredCell.row);
        let enemyOnCell = false;
        for (const e of enemies) {
            if (e.alive && Math.abs(e.x - hcx) < CS * 0.5 && Math.abs(e.y - hcy) < CS * 0.5) { enemyOnCell = true; break; }
        }
        const ok = grid[hoveredCell.row][hoveredCell.col] === 0 && gold >= tt.cost && !enemyOnCell;
        ctx.fillStyle = ok ? '#00ff8818' : '#ff006618';
        ctx.fillRect(hx, hy, CS, CS);
        ctx.strokeStyle = ok ? '#00ff88' : '#ff0066';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx + 1, hy + 1, CS - 2, CS - 2);
        if (ok) {
            if (TOWER_TYPES[placingType].booster) {
                // Show boost zone (adjacent cells)
                const bdirs = [[-1,0],[1,0],[0,-1],[0,1]];
                const t = performance.now() * 0.003;
                const pulse = 0.5 + 0.5 * Math.sin(t);
                for (const [dr, dc] of bdirs) {
                    const br = hoveredCell.row + dr, bc = hoveredCell.col + dc;
                    if (br < 0 || br >= GRID || bc < 0 || bc >= GRID) continue;
                    const bx = GX + bc * CS, by = br * CS;
                    ctx.fillStyle = 'rgba(0, 255, 136, ' + (0.1 + 0.08 * pulse).toFixed(3) + ')';
                    ctx.fillRect(bx, by, CS, CS);
                    ctx.strokeStyle = 'rgba(0, 255, 136, ' + (0.35 + 0.2 * pulse).toFixed(2) + ')';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(bx + 1, by + 1, CS - 2, CS - 2);
                }
            } else if (TOWER_TYPES[placingType].laser) {
                const ldirs = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dr, dc] of ldirs) {
                    for (let s = 1; s <= 3; s++) {
                        const cr = hoveredCell.row + dr * s, cc = hoveredCell.col + dc * s;
                        if (cr < 0 || cr >= GRID || cc < 0 || cc >= GRID) break;
                        ctx.fillStyle = 'rgba(255,0,255,' + (0.15 - s * 0.03).toFixed(2) + ')';
                        ctx.fillRect(GX + cc * CS, cr * CS, CS, CS);
                        ctx.strokeStyle = '#f0f40';
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(GX + cc * CS + 1, cr * CS + 1, CS - 2, CS - 2);
                    }
                }
            } else {
                ctx.beginPath();
                ctx.arc(hx + CS / 2, hy + CS / 2, tt.range * CS, 0, Math.PI * 2);
                ctx.strokeStyle = '#00f0ff30';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

}

// === GAME LOOP ===
let lastTime = 0;

function scheduleLoop() {
    if ((isDuel || isMulti) && document.hidden) return; // background interval handles it
    requestAnimationFrame(gameLoop);
}

function gameLoop(time) {
  try {
    if (!time) time = performance.now();
    const rawDt = (time - lastTime) / 1000;
    lastTime = time;
    // In duel: allow larger dt so background tabs catch up (up to 0.5s per step)
    const mp = isDuel || isMulti;
    const dt = Math.min(rawDt, mp ? 0.5 : 0.05) * (mp ? 1 : gameSpeed);

    if (waveActive && enemiesToSpawn > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            const waveData = WAVES[waveNum - 1];
            // Mixed wave support: cycle through types array
            const spawnIdx = waveData.count - enemiesToSpawn;
            const spawnType = waveData.types ? waveData.types[spawnIdx % waveData.types.length] : waveData.type;
            const et = ENEMY_TYPES[spawnType];
            // Pick entry row: duel uses pre-generated deterministic sequence
            let spawnRow;
            if ((isDuel || isMulti) && waveSpawnIdx < waveSpawnRows.length) {
                spawnRow = waveSpawnRows[waveSpawnIdx++];
                // Fallback if row became blocked mid-wave (tower placed after wave start)
                if (!et.ghost && !findPath(spawnRow, ENTRY_COL, EXIT_COL)) {
                    const valid = getValidEntryRows();
                    if (valid.length > 0) spawnRow = valid[Math.floor(Math.random() * valid.length)];
                }
            } else if (et.ghost) {
                spawnRow = pickEntryRow(ENTRY_ROWS);
            } else {
                const valid = getValidEntryRows();
                if (valid.length === 0) { enemiesToSpawn = 0; }
                else spawnRow = pickEntryRow(valid);
            }
            if (spawnRow !== undefined) {
                enemies.push(new Enemy(spawnRow, waveData.hp, spawnType));
                enemiesToSpawn--;
                spawnTimer = et.spawnInt || SPAWN_INT;
                updateUI();
            }
        }
    }

    for (const t of towers) t.update(dt);
    // Handle destroyed towers (grenade)
    const hadDestroyed = towers.some(t => t.destroyed);
    if (hadDestroyed) {
        towers = towers.filter(t => !t.destroyed);
        for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); }
        updateUI();
    }
    for (const e of enemies) e.update(dt);
    for (const p of projectiles) p.update(dt);

    // Handle splitter deaths — children jump 1 cell forward + spread vertically
    const newEnemies = [];
    const maxX = GX + GRID * CS - CS * 0.5; // don't spawn past the grid
    for (const e of enemies) {
        if (!e.alive && e.canSplit && e.splits > 0) {
            for (let i = 0; i < e.splits; i++) {
                const childHp = Math.floor(e.maxHp * e.splitHpRatio);
                const spreadY = (i - (e.splits - 1) / 2) * CS * 0.35;
                const childY = Math.max(CS * 0.5, Math.min(GRID * CS - CS * 0.5, e.y + spreadY));
                const childX = Math.min(e.x + CS, maxX); // jump 1 cell forward, clamped
                newEnemies.push(new Enemy(0, childHp, e.typeName, { x: childX, y: childY }));
            }
        }
    }
    enemies = enemies.filter(e => e.alive);
    enemies.push(...newEnemies);
    projectiles = projectiles.filter(p => p.alive);

    if (waveActive && enemiesToSpawn === 0 && enemies.length === 0) {
        waveActive = false;
        if (waveNum >= WAVES.length) {
            if (lives > 0) {
                if (isDuel) {
                    gameEndTime = Date.now();
                    if (conn) conn.send({ type: 'game_complete', score: finalScore(), time: gameEndTime - gameStartTime });
                    if (opponentFinished) checkDuelEnd();
                    else { showMessage('Done! Waiting...'); playSfx('victory'); }
                } else if (isMulti) {
                    gameEndTime = Date.now();
                    if (isHost) {
                        let me = multiPlayers.get(myPlayerId);
                        if (me) { me.finished = true; me.finalScore = finalScore(); me.finalTime = gameEndTime - gameStartTime; }
                        checkMultiEnd();
                        showMessage('Done! Waiting...'); playSfx('victory');
                    } else if (conn && conn.open) {
                        conn.send({ type: 'multi_game_complete', score: finalScore(), time: gameEndTime - gameStartTime });
                        showMessage('Done! Waiting...'); playSfx('victory');
                    } else {
                        // Host gone, end locally as victory
                        multiEnded = true;
                        multiResultTitle = 'VICTORY';
                        multiResultSub = 'Score: ' + finalScore() + 'pts';
                        playSfx('victory');
                        saveMultiScoreToSolo();
                    }
                } else {
                    showMessage('Victory!'); playSfx('victory');
                }
            }
        } else {
            if (lives > 0) showMessage('Wave ' + waveNum + ' complete');
            // Multi: auto-advance immediately when wave clears
            if ((isMulti || isDuel) && lives > 0 && waveNum < WAVES.length) {
                if (isMulti && isHost) {
                    startWave(true); // host broadcasts to all
                } else if (isMulti && !isHost) {
                    if (conn && conn.open) conn.send({ type: 'multi_wave_request', waveNum: waveNum + 1 });
                    else startWave(false); // host gone, continue locally
                } else if (isDuel) {
                    startWave(true);
                }
            } else if (waveNum >= 1 && nextWaveTimer <= 0) {
                nextWaveTimer = 1;
            }
        }
        updateUI();
    }

    if (nextWaveTimer > 0) {
        nextWaveTimer -= dt;
        if (nextWaveTimer <= 0) {
            nextWaveTimer = 0;
            if (waveNum < WAVES.length && lives > 0) {
                // Multi joiners: wait for host sync, unless host disconnected
                if (isMulti && !isHost && conn && conn.open) { /* wait for host sync */ }
                else startWave(isDuel || (isMulti && isHost));
            }
        }
    }

    // Duel: 15-second countdown before wave 1
    if (isDuel && duelStartTimer > 0) {
        duelStartTimer -= dt;
        if (duelStartTimer <= 0) {
            duelStartTimer = 0;
            startWave(isDuel); // sync in duel
        }
    }

    // Multi: 15-second countdown before wave 1
    if (isMulti && multiStartTimer > 0) {
        multiStartTimer -= dt;
        if (multiStartTimer <= 0) {
            multiStartTimer = 0;
            // Host initiates wave 1; joiners wait unless host disconnected
            if (isHost || !(conn && conn.open)) startWave(isHost);
        }
    }

    if (lives <= 0) {
        lives = 0;
        if (!gameOverPlayed) {
            playSfx('gameover'); gameOverPlayed = true;
            if (isDuel && !duelEnded) {
                duelEnded = true;
                if (conn) conn.send({ type: 'game_over' });
                duelResultTitle = 'DEFEAT';
                duelResultSub = 'You have been eliminated';
                submitRankedResult('loss');
            }
            if (isMulti && !multiEnded) {
                multiResultTitle = 'DEFEAT';
                multiResultSub = 'You have been eliminated';
                saveMultiScoreToSolo();
                if (isHost) {
                    let me = multiPlayers.get(myPlayerId);
                    if (me) me.alive = false;
                    checkMultiEnd();
                } else {
                    if (conn) conn.send({ type: 'multi_game_over' });
                }
            }
        }
        // Multi: dead players can still watch — don't return, just draw overlay
        if (isMulti) {
            // Continue game loop (status updates, player list, etc.) but draw defeat overlay at end
        } else {
            updateUI();
            drawScene();
            for (const t of towers) t.draw();
            for (const e of enemies) e.draw();
            ctx.fillStyle = 'rgba(3,3,8,0.8)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            let rTitle = isDuel ? duelResultTitle : '';
            let rSub = isDuel ? duelResultSub : '';
            if (rTitle) {
                let isWin = rTitle === 'VICTORY';
                ctx.fillStyle = isWin ? '#00ff88' : '#ff0066';
                ctx.font = '700 14px "Press Start 2P", monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
                ctx.fillText(rTitle, CANVAS_W / 2, CANVAS_H / 2 - 15);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#506070';
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.fillText(rSub, CANVAS_W / 2, CANVAS_H / 2 + 15);
                if (rankedEloChange !== null) {
                    ctx.fillStyle = rankedEloChange >= 0 ? '#00ff88' : '#ff0066';
                    ctx.font = '700 11px "Press Start 2P", monospace';
                    ctx.fillText('ELO: ' + (rankedEloChange >= 0 ? '+' : '') + rankedEloChange, CANVAS_W / 2, CANVAS_H / 2 + 40);
                }
            } else {
                if (!_soloSaved && !isDuel) {
                    _soloSaved = true;
                    if (authToken) {
                        fetchWithTimeout(SERVER_URL + '/api/solo/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
                            body: JSON.stringify({ bestWave: waveNum, bestScore: finalScore() })
                        }).catch(function() { showMessage('Score save failed'); });
                    } else {
                        showSoloEndOverlay();
                    }
                }
                ctx.fillStyle = '#ff0066';
                ctx.font = '700 14px "Press Start 2P", monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowColor = '#ff0066'; ctx.shadowBlur = 20;
                ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#506070';
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.fillText('SCORE: ' + finalScore(), CANVAS_W / 2, CANVAS_H / 2 + 20);
            }
            showReplayBtn();
            scheduleLoop();
            return;
        }
    }

    // Duel/Multi result overlay (when ended but I'm still alive)
    let endTitle = (duelEnded && duelResultTitle) ? duelResultTitle : ((multiEnded && multiResultTitle) ? multiResultTitle : '');
    let endSub = (duelEnded && duelResultTitle) ? duelResultSub : ((multiEnded && multiResultTitle) ? multiResultSub : '');
    if (endTitle && lives > 0) {
        updateUI();
        drawScene();
        for (const t of towers) t.draw();
        for (const p of projectiles) p.draw();
        for (const e of enemies) e.draw();
        ctx.fillStyle = 'rgba(3,3,8,0.8)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        let eIsWin = endTitle === 'VICTORY';
        ctx.fillStyle = eIsWin ? '#00ff88' : '#ff0066';
        ctx.font = '700 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
        ctx.fillText(endTitle, CANVAS_W / 2, CANVAS_H / 2 - 30);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#506070';
        ctx.font = '9px "JetBrains Mono", monospace';
        let subLines = endSub.split('\n');
        for (let si = 0; si < subLines.length; si++) {
            ctx.fillText(subLines[si], CANVAS_W / 2, CANVAS_H / 2 + si * 14);
        }
        if (rankedEloChange !== null && duelEnded) {
            ctx.fillStyle = rankedEloChange >= 0 ? '#00ff88' : '#ff0066';
            ctx.font = '700 11px "Press Start 2P", monospace';
            ctx.fillText('ELO: ' + (rankedEloChange >= 0 ? '+' : '') + rankedEloChange, CANVAS_W / 2, CANVAS_H / 2 + subLines.length * 14 + 15);
        }
        showReplayBtn();
        scheduleLoop();
        return;
    }

    // Solo victory overlay
    if (!isDuel && !isMulti && WAVES.length > 0 && waveNum >= WAVES.length && !waveActive && enemies.length === 0 && lives > 0) {
        if (!_soloSaved) {
            _soloSaved = true;
            if (authToken) {
                fetchWithTimeout(SERVER_URL + '/api/solo/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
                    body: JSON.stringify({ bestWave: waveNum, bestScore: finalScore() })
                }).catch(function() { showMessage('Score save failed'); });
            } else {
                showSoloEndOverlay();
            }
        }
        updateUI();
        drawScene();
        for (const t of towers) t.draw();
        ctx.fillStyle = 'rgba(3,3,8,0.8)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#00ff88';
        ctx.font = '700 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20;
        ctx.fillText('VICTORY', CANVAS_W / 2, CANVAS_H / 2 - 15);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#506070';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText('SCORE: ' + finalScore() + ' (' + score + ' + ' + (lives * 10) + ' lives)', CANVAS_W / 2, CANVAS_H / 2 + 15);
        showReplayBtn();
        return;
    }

    // Duel: send periodic status updates
    if (isDuel && conn) {
        _lastStatusSend += dt;
        if (_lastStatusSend >= 0.5) {
            _lastStatusSend = 0;
            conn.send({
                type: 'status', lives, score, wave: waveNum,
                tw: towers.map(function(t) { return { r: t.row, c: t.col, i: t.type }; }),
                en: enemies.filter(function(e) { return e.alive; }).map(function(e) {
                    return { gx: (e.x - GX) / CS, gy: e.y / CS, t: e.typeName, s: ENEMY_TYPES[e.typeName].scale || 1 };
                })
            });
        }
    }

    // Multi: send periodic status updates
    if (isMulti) {
        _lastMultiStatusSend += dt;
        if (_lastMultiStatusSend >= 0.5) {
            _lastMultiStatusSend = 0;
            let myTw = towers.map(function(t) { return { r: t.row, c: t.col, i: t.type }; });
            let myEn = enemies.filter(function(e) { return e.alive; }).map(function(e) {
                return { gx: (e.x - GX) / CS, gy: e.y / CS, t: e.typeName, s: ENEMY_TYPES[e.typeName].scale || 1 };
            });
            if (isHost) {
                let me = multiPlayers.get(myPlayerId);
                if (me) { me.lives = lives; me.score = score; me.wave = waveNum; me.boardData = { towers: myTw, enemies: myEn }; me.alive = lives > 0; }
                broadcastMultiStatus();
            } else {
                if (conn && conn.open) conn.send({ type: 'my_status', lives: lives, score: score, wave: waveNum, tw: myTw, en: myEn });
            }
        }
    }

    if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) document.getElementById('msg').textContent = '';
    }

    // Floating texts update
    for (const ft of floatingTexts) {
        ft.life -= dt;
        ft.y -= 30 * dt;
    }
    floatingTexts = floatingTexts.filter(ft => ft.life > 0);

    // Update explosions
    for (const ex of explosions) ex.timer -= dt;
    explosions = explosions.filter(ex => ex.timer > 0);


    updateUI();
    // Skip rendering when tab is hidden (background duel)
    if (document.hidden) { scheduleLoop(); return; }
    drawScene();
    for (const t of towers) t.draw();
    drawBoosterGlows();
    for (const p of projectiles) p.draw();
    for (const e of enemies) e.draw();

    // Draw explosions
    for (const ex of explosions) {
        const progress = 1 - ex.timer / ex.maxTimer;
        const r = ex.radius * (0.3 + 0.7 * progress);
        const alpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 136, 0, ' + (alpha * 0.3).toFixed(2) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 0, ' + alpha.toFixed(2) + ')';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 15 * alpha;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Floating texts draw
    for (const ft of floatingTexts) {
        const a = ft.life / ft.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffaa00';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 4;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    // Multi: draw result overlay for dead players (game loop continues for spectating)
    if (isMulti && lives <= 0 && multiResultTitle) {
        ctx.fillStyle = 'rgba(3,3,8,0.7)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        let mIsWin = multiResultTitle === 'VICTORY';
        ctx.fillStyle = mIsWin ? '#00ff88' : '#ff0066';
        ctx.font = '700 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
        ctx.fillText(multiResultTitle, CANVAS_W / 2, CANVAS_H / 2 - 30);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#506070';
        ctx.font = '9px "JetBrains Mono", monospace';
        let mSubLines = multiResultSub.split('\n');
        for (let mi = 0; mi < mSubLines.length; mi++) {
            ctx.fillText(mSubLines[mi], CANVAS_W / 2, CANVAS_H / 2 + mi * 14);
        }
        if (multiEnded) showReplayBtn();
    }

    scheduleLoop();
  } catch (e) { console.error('gameLoop error:', e); scheduleLoop(); }
}

// === TOWER ICONS ===
function drawTowerIcons() {
    for (let i = 0; i < TOWER_TYPES.length; i++) {
        const c = document.getElementById('ticon-' + i);
        if (!c) continue;
        const g = c.getContext('2d');
        const w = c.width, h = c.height, cx = w / 2, cy = h / 2;
        const tt = TOWER_TYPES[i];
        const col = tt.levels[1].color;

        g.fillStyle = tt.bg;
        g.fillRect(0, 0, w, h);

        switch (i) {
            case 0: // Canon — concentric rings + single barrel
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // barrel (gray metallic)
                g.fillStyle = '#555'; g.fillRect(cx + 3, cy - 2.5, 10, 5);
                g.fillStyle = '#888'; g.fillRect(cx + 3, cy - 2, 10, 4);
                g.fillStyle = '#bbb'; g.fillRect(cx + 4, cy - 0.5, 8, 1);
                g.fillStyle = '#666'; g.fillRect(cx + 11, cy - 2.5, 2, 5);
                break;
            case 1: // Sniper — concentric rings + double long barrel
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // double barrel
                g.fillStyle = '#555'; g.fillRect(cx + 3, cy - 4, 10, 2.5);
                g.fillStyle = '#888'; g.fillRect(cx + 3, cy - 3.5, 10, 2);
                g.fillStyle = '#bbb'; g.fillRect(cx + 4, cy - 2.8, 8, 0.8);
                g.fillStyle = '#555'; g.fillRect(cx + 3, cy + 1.5, 10, 2.5);
                g.fillStyle = '#888'; g.fillRect(cx + 3, cy + 1.8, 10, 2);
                g.fillStyle = '#bbb'; g.fillRect(cx + 4, cy + 2.5, 8, 0.8);
                break;
            case 2: // Gel — concentric rings + barrel + ice crystals
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // barrel
                g.fillStyle = '#555'; g.fillRect(cx + 3, cy - 2, 8, 4);
                g.fillStyle = '#888'; g.fillRect(cx + 3, cy - 1.5, 8, 3);
                g.fillStyle = '#bbb'; g.fillRect(cx + 4, cy - 0.5, 6, 1);
                g.fillStyle = '#666'; g.fillRect(cx + 9, cy - 2, 2, 4);
                // ice crystals on ring
                g.strokeStyle = '#fff'; g.lineWidth = 1.5;
                for (let j = 0; j < 6; j++) {
                    const a = (j / 6) * Math.PI * 2;
                    const d = 7.2;
                    g.beginPath();
                    g.moveTo(cx + Math.cos(a) * (d - 2.5), cy + Math.sin(a) * (d - 2.5));
                    g.lineTo(cx + Math.cos(a) * (d + 2.5), cy + Math.sin(a) * (d + 2.5));
                    g.stroke();
                }
                break;
            case 3: // Splash — concentric rings + triple barrel
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // main barrel
                g.fillStyle = '#555'; g.fillRect(cx + 3, cy - 2.5, 9, 5);
                g.fillStyle = '#888'; g.fillRect(cx + 3, cy - 2, 9, 4);
                g.fillStyle = '#bbb'; g.fillRect(cx + 4, cy - 0.5, 7, 1);
                // side barrels (angled)
                g.save(); g.translate(cx, cy); g.rotate(-0.5);
                g.fillStyle = '#555'; g.fillRect(4, -1.5, 7, 3);
                g.fillStyle = '#888'; g.fillRect(4, -1, 7, 2);
                g.restore();
                g.save(); g.translate(cx, cy); g.rotate(0.5);
                g.fillStyle = '#555'; g.fillRect(4, -1.5, 7, 3);
                g.fillStyle = '#888'; g.fillRect(4, -1, 7, 2);
                g.restore();
                break;
            case 4: // Exorciste — concentric rings + barrel + white cross
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // barrel
                g.fillStyle = '#555'; g.fillRect(cx + 3, cy - 2, 8, 4);
                g.fillStyle = '#888'; g.fillRect(cx + 3, cy - 1.5, 8, 3);
                g.fillStyle = '#bbb'; g.fillRect(cx + 4, cy - 0.5, 6, 1);
                g.fillStyle = '#666'; g.fillRect(cx + 9, cy - 2, 2, 4);
                // white cross on center
                g.fillStyle = '#fff';
                g.fillRect(cx - 0.7, cy - 3, 1.4, 6);
                g.fillRect(cx - 3, cy - 0.7, 6, 1.4);
                break;
            case 5: // Tesla — concentric rings + electric arcs + white center
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // electric arcs
                g.strokeStyle = col; g.lineWidth = 1.5;
                for (let j = 0; j < 5; j++) {
                    const a = (j / 5) * Math.PI * 2 - Math.PI / 4;
                    g.beginPath();
                    g.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
                    g.lineTo(cx + Math.cos(a + 0.3) * 6, cy + Math.sin(a + 0.3) * 6);
                    g.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
                    g.stroke();
                }
                // white center dot
                g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2);
                g.fillStyle = '#fff'; g.fill();
                break;
            case 6: // Booster — concentric rings + outward arrows
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // 4 arrows
                g.strokeStyle = '#fff'; g.lineWidth = 1.5;
                for (let j = 0; j < 4; j++) {
                    const a = (j / 4) * Math.PI * 2;
                    const ex = cx + Math.cos(a) * 10, ey = cy + Math.sin(a) * 10;
                    g.beginPath();
                    g.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
                    g.lineTo(ex, ey);
                    g.stroke();
                    const ha1 = a + Math.PI * 0.75, ha2 = a - Math.PI * 0.75;
                    g.beginPath();
                    g.moveTo(ex, ey);
                    g.lineTo(ex + Math.cos(ha1) * 3, ey + Math.sin(ha1) * 3);
                    g.moveTo(ex, ey);
                    g.lineTo(ex + Math.cos(ha2) * 3, ey + Math.sin(ha2) * 3);
                    g.stroke();
                }
                break;
            case 7: // Grenade — bomb shape
                g.beginPath(); g.arc(cx, cy + 2, 7, 0, Math.PI * 2);
                g.fillStyle = '#2a2020'; g.fill();
                g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
                // fuse
                g.beginPath();
                g.moveTo(cx, cy - 5);
                g.quadraticCurveTo(cx + 3, cy - 8, cx + 2, cy - 10);
                g.strokeStyle = '#aa8844'; g.lineWidth = 1.5; g.stroke();
                // spark
                g.beginPath(); g.arc(cx + 2, cy - 10, 1.5, 0, Math.PI * 2);
                g.fillStyle = '#ff0'; g.fill();
                break;
            case 8: // Laser — concentric rings + beam shape
                g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 8.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
                g.fillStyle = '#0a0e18'; g.fill();
                g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2);
                g.fillStyle = col; g.fill();
                // beam shape
                g.fillStyle = col;
                g.beginPath();
                g.moveTo(cx + 4, cy);
                g.lineTo(cx + 12, cy - 2);
                g.lineTo(cx + 12, cy + 2);
                g.closePath();
                g.fill();
                g.strokeStyle = '#fff'; g.lineWidth = 1;
                g.beginPath();
                g.moveTo(cx + 5, cy);
                g.lineTo(cx + 12, cy);
                g.stroke();
                break;
        }
    }
}

// === WAVE BAR ===
const WAVE_LABELS = {
    normal: 'Normal', ghost: 'Ghost', splitter: 'Splitter', fast: 'Fast', swarm: 'Swarm', shield: 'Shield',
    stealth: 'Stealth', regen: 'Regen',
    boss_normal: 'Boss Normal', boss_ghost: 'Boss Ghost', boss_splitter: 'Boss Splitter',
    boss_fast: 'Boss Fast', boss_swarm: 'Boss Swarm', boss_shield: 'Boss Shield',
    boss_stealth: 'Boss Stealth', boss_regen: 'Boss Regen',
};
const WAVE_SHORT = {
    normal: 'Norm', ghost: 'Ghst', splitter: 'Spl', fast: 'Fast', swarm: 'Swrm', shield: 'Shld',
    stealth: 'Stlh', regen: 'Regn',
    boss_normal: 'B.Nrm', boss_ghost: 'B.Gho', boss_splitter: 'B.Spl',
    boss_fast: 'B.Fst', boss_swarm: 'B.Swm', boss_shield: 'B.Shd',
    boss_stealth: 'B.Stl', boss_regen: 'B.Rgn',
};
const WAVE_BG = {
    normal: '#3a1828', ghost: '#281840', splitter: '#183a20', fast: '#383810', swarm: '#103838', shield: '#182838',
    stealth: '#202030', regen: '#183818',
    boss_normal: '#3a2010', boss_ghost: '#301848', boss_splitter: '#204020',
    boss_fast: '#404010', boss_swarm: '#104040', boss_shield: '#203040',
    boss_stealth: '#252530', boss_regen: '#1a3818',
};
const WAVE_BG_ACTIVE = {
    normal: '#602040', ghost: '#402060', splitter: '#206040', fast: '#606020', swarm: '#206060', shield: '#204060',
    boss_normal: '#604020', boss_ghost: '#502068', boss_splitter: '#306030',
    boss_fast: '#606030', boss_swarm: '#306060', boss_shield: '#305060',
    boss_stealth: '#404050', boss_regen: '#2a5828',
};

let _wbBuilt = false;
const _wbEls = [];
let _wbCellW = 0;
let _wbInner = null;

function resetWaveBar() { _wbBuilt = false; _wbCellW = 0; }

function buildWaveBar() {
    if (_wbBuilt) return;
    _wbBuilt = true;
    const container = document.getElementById('wb-waves');
    container.innerHTML = '';
    const inner = document.createElement('div');
    inner.id = 'wb-inner';
    container.appendChild(inner);
    _wbInner = inner;
    _wbEls.length = 0;
    for (let i = 0; i < WAVES.length; i++) {
        const w = WAVES[i];
        const el = document.createElement('div');
        el.className = 'wc type-' + w.type;
        el.style.background = w.types ? '#2a0a2a' : WAVE_BG[w.type];
        const nSpan = document.createElement('span'); nSpan.className = 'wn';
        nSpan.textContent = (i + 1) + '/' + WAVES.length;
        const tSpan = document.createElement('span'); tSpan.className = 'wt';
        tSpan.textContent = w.types ? 'ALL' : WAVE_SHORT[w.type];
        const hpSpan = document.createElement('span'); hpSpan.className = 'wc-hp';
        hpSpan.textContent = w.count + 'x ' + w.hp + 'hp';
        el.appendChild(nSpan); el.appendChild(tSpan); el.appendChild(hpSpan);
        el.title = w.types ? 'Wave ' + (i + 1) + ' — ALL BOSSES (HP: ' + w.hp + ')' : 'Wave ' + (i + 1) + ' — ' + w.count + 'x ' + WAVE_LABELS[w.type] + ' (HP: ' + w.hp + ')';
        inner.appendChild(el);
        _wbEls.push({ el, idx: i, nSpan, hpSpan });
    }
    const end = document.createElement('div');
    end.className = 'wc';
    end.style.background = '#0a0e18';
    end.innerHTML = '<span class="wt" style="color:#00ff88;text-shadow:0 0 6px #00ff8860">GG !</span>';
    inner.appendChild(end);
    _wbEls.push({ el: end, idx: -1 });
}

function updateWaveBar() {
    buildWaveBar();
    const container = document.getElementById('wb-waves');
    const goBtn = document.getElementById('wb-go');

    // size cells to show 5 at a time based on container width
    const cw = container.clientWidth;
    if (cw > 0 && _wbCellW === 0) {
        const gap = 3;
        _wbCellW = (cw - (5 - 1) * gap) / 5;
        for (const item of _wbEls) item.el.style.width = _wbCellW + 'px';
    }
    if (_wbCellW <= 0) return;

    const gap = 3;
    const cellW = _wbCellW;

    let scrollCells = 0;
    if (waveNum > 0 && waveDuration > 0 && nextWaveTimer > 0) {
        const progress = Math.max(0, Math.min(1, 1 - nextWaveTimer / waveDuration));
        scrollCells = (waveNum - 1) + progress;
    } else {
        scrollCells = waveNum;
    }
    _wbInner.style.transform = 'translateX(' + (-(scrollCells * (cellW + gap))) + 'px)';

    const alive = enemies.filter(e => e.alive).length + enemiesToSpawn;

    for (const item of _wbEls) {
        if (item.idx < 0) continue;
        const i = item.idx;
        const w = WAVES[i];
        if (!w) { item.el.style.display = 'none'; continue; }
        item.el.style.display = '';
        const isActive = i === waveNum - 1 && waveActive;
        const isDone = waveActive ? i < waveNum - 1 : i < waveNum;
        item.el.style.background = isActive ? WAVE_BG_ACTIVE[w.type] : WAVE_BG[w.type];
        item.el.style.opacity = isDone ? '0.5' : '1';
        if (isActive) {
            item.el.classList.add('active');
            item.hpSpan.textContent = alive + '/' + w.count + ' left';
        } else {
            item.el.classList.remove('active');
            item.hpSpan.textContent = w.count + 'x ' + w.hp + 'hp';
        }
    }

    const allDead = !waveActive && alive === 0;
    if (waveNum >= WAVES.length && allDead) {
        goBtn.textContent = 'GG';
        goBtn.disabled = true;
    } else if (isDuel && duelStartTimer > 0 && waveNum === 0) {
        goBtn.textContent = 'Start ' + Math.ceil(duelStartTimer) + 's';
        goBtn.disabled = true;
    } else if (isMulti && multiStartTimer > 0 && waveNum === 0) {
        goBtn.textContent = 'Start ' + Math.ceil(multiStartTimer) + 's';
        goBtn.disabled = true;
    } else if (waveNum === 0) {
        goBtn.textContent = 'Launch 1';
        goBtn.disabled = lives <= 0;
    } else if (waveActive && alive > 0) {
        goBtn.textContent = alive + ' left';
        goBtn.disabled = true;
    } else if ((isDuel && duelEnded) || (isMulti && multiEnded)) {
        goBtn.textContent = 'Done';
        goBtn.disabled = true;
    } else if (nextWaveTimer > 0) {
        goBtn.textContent = 'Launch ' + (waveNum + 1) + ' (' + Math.ceil(nextWaveTimer) + 's)';
        goBtn.disabled = lives <= 0;
    } else {
        goBtn.textContent = 'Launch ' + (waveNum + 1);
        goBtn.disabled = lives <= 0;
    }
}

drawTowerIcons();
updateWaveBar();
updateUI();
requestAnimationFrame(gameLoop);

// === RESIZE ===
function resizeGame() {
    const newCS = Math.max(18, Math.min(28, Math.floor((window.innerHeight - BARS_H - 10) / GRID)));
    if (newCS === CS) return;
    const ratio = newCS / CS;
    CS = newCS;
    GX = CS;
    CANVAS_W = (GRID + 2) * CS;
    CANVAS_H = GRID * CS;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    document.getElementById('wrap').style.width = CANVAS_W + 'px';
    // Reposition towers
    for (const t of towers) {
        t.x = cellX(t.col);
        t.y = cellY(t.row);
    }
    // Scale enemies and their waypoints
    for (const e of enemies) {
        e.x *= ratio;
        e.y *= ratio;
        for (const wp of e.waypoints) { wp[0] *= ratio; wp[1] *= ratio; }
    }
    // Scale projectiles
    for (const p of projectiles) { p.x *= ratio; p.y *= ratio; p.speed = 8 * CS; }
    // Scale explosions & floating texts
    for (const ex of explosions) { ex.x *= ratio; ex.y *= ratio; ex.radius *= ratio; }
    for (const ft of floatingTexts) { ft.x *= ratio; ft.y *= ratio; }
    // Reset wave bar cell width
    _wbCellW = 0;
}
window.addEventListener('resize', resizeGame);

// === BACKGROUND TAB (duel) ===
document.addEventListener('visibilitychange', function() {
    if (!isDuel && !isMulti) return;
    if (document.hidden) {
        // Tab hidden: start backup interval so game keeps running
        if (!_bgInterval) {
            _bgInterval = setInterval(function() {
                gameLoop(performance.now());
            }, 100);
        }
    } else {
        // Tab visible: stop interval, resume rAF
        if (_bgInterval) { clearInterval(_bgInterval); _bgInterval = null; }
        lastTime = performance.now(); // reset to avoid huge dt spike
        scheduleLoop();
    }
});

// === AUDIO ENGINE ===
let audioCtx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let isMusicMuted = localStorage.getItem('musicMuted') === '1';
let isSfxMuted = localStorage.getItem('sfxMuted') === '1';
let musicStarted = false;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = isMusicMuted ? 0 : 0.25;
    musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = isSfxMuted ? 0 : 0.5;
    sfxGain.connect(masterGain);
}

// Apply saved mute state to UI on load
(function() {
    if (isMusicMuted) document.getElementById('mute-music').classList.add('muted');
    if (isSfxMuted) {
        document.getElementById('mute-sfx').classList.add('muted');
        document.getElementById('sfx-icon-on').style.display = 'none';
        document.getElementById('sfx-icon-off').style.display = '';
    }
})();

function toggleMusic() {
    initAudio();
    isMusicMuted = !isMusicMuted;
    localStorage.setItem('musicMuted', isMusicMuted ? '1' : '0');
    musicGain.gain.setTargetAtTime(isMusicMuted ? 0 : 0.25, audioCtx.currentTime, 0.05);
    document.getElementById('mute-music').classList.toggle('muted', isMusicMuted);
    if (!musicStarted) { startMusic(); musicStarted = true; }
}

function toggleSfx() {
    initAudio();
    isSfxMuted = !isSfxMuted;
    localStorage.setItem('sfxMuted', isSfxMuted ? '1' : '0');
    sfxGain.gain.setTargetAtTime(isSfxMuted ? 0 : 0.5, audioCtx.currentTime, 0.05);
    document.getElementById('mute-sfx').classList.toggle('muted', isSfxMuted);
    document.getElementById('sfx-icon-on').style.display = isSfxMuted ? 'none' : '';
    document.getElementById('sfx-icon-off').style.display = isSfxMuted ? '' : 'none';
    if (!musicStarted) { startMusic(); musicStarted = true; }
}

// --- SFX ---
function playSfx(type) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    if (type === 'place') {
        // Short mechanical click
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(800, t);
        o.frequency.exponentialRampToValueAtTime(200, t + 0.08);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.1);
    } else if (type === 'kill') {
        // Quick blip
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(600, t);
        o.frequency.exponentialRampToValueAtTime(1200, t + 0.06);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.08);
    } else if (type === 'wave') {
        // Rising sweep
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(600, t + 0.3);
        g.gain.setValueAtTime(0.2, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.4);
    } else if (type === 'sell') {
        // Coin-like descending
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1000, t);
        o.frequency.exponentialRampToValueAtTime(400, t + 0.15);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.2);
    } else if (type === 'explosion') {
        // Noise burst
        const bufSize = audioCtx.sampleRate * 0.3;
        const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        const filt = audioCtx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(800, t);
        filt.frequency.exponentialRampToValueAtTime(100, t + 0.3);
        src.connect(filt); filt.connect(g); g.connect(sfxGain);
        src.start(t);
    } else if (type === 'upgrade') {
        // Two-tone ascending
        for (let i = 0; i < 2; i++) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(500 + i * 300, t + i * 0.1);
            g.gain.setValueAtTime(0.2, t + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.15);
            o.connect(g); g.connect(sfxGain);
            o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.15);
        }
    } else if (type === 'hit') {
        // Enemy reaches exit
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.3);
    } else if (type === 'gameover') {
        // Descending doom
        for (let i = 0; i < 4; i++) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(300 - i * 60, t + i * 0.2);
            g.gain.setValueAtTime(0.25, t + i * 0.2);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.3);
            o.connect(g); g.connect(sfxGain);
            o.start(t + i * 0.2); o.stop(t + i * 0.2 + 0.3);
        }
    } else if (type === 'victory') {
        // Ascending fanfare
        const notes = [523, 659, 784, 1047];
        for (let i = 0; i < notes.length; i++) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(notes[i], t + i * 0.15);
            g.gain.setValueAtTime(0.2, t + i * 0.15);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
            o.connect(g); g.connect(sfxGain);
            o.start(t + i * 0.15); o.stop(t + i * 0.15 + 0.3);
        }
    }
}

// --- MUSIC: dark ambient cyberpunk loop ---
function startMusic() {
    if (!audioCtx) return;
    const bpm = 75;
    const beat = 60 / bpm;
    const bar = beat * 4;

    // Bass sequence (low rumble pattern)
    const bassNotes = [55, 55, 65.41, 55, 49, 49, 65.41, 49]; // A1, A1, C2, A1, G1, G1, C2, G1
    let bassIdx = 0;

    function playBass() {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const freq = bassNotes[bassIdx % bassNotes.length];
        bassIdx++;

        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.15, t);
        g.gain.setValueAtTime(0.15, t + beat * 0.7);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.95);

        const filt = audioCtx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(200, t);

        o.connect(filt); filt.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + beat);

        setTimeout(playBass, beat * 1000);
    }

    // Pad / atmosphere (slow evolving chord)
    const padChords = [
        [110, 130.81, 164.81],   // Am
        [98, 130.81, 164.81],    // Gsus
        [110, 138.59, 164.81],   // Am(b6)
        [98, 123.47, 155.56],    // G
    ];
    let padIdx = 0;

    function playPad() {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const chord = padChords[padIdx % padChords.length];
        padIdx++;

        for (const freq of chord) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t);
            // Slow swell
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.06, t + bar * 0.4);
            g.gain.linearRampToValueAtTime(0.06, t + bar * 0.7);
            g.gain.exponentialRampToValueAtTime(0.001, t + bar * 0.98);

            const filt = audioCtx.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(400, t);
            filt.frequency.linearRampToValueAtTime(800, t + bar * 0.5);
            filt.frequency.linearRampToValueAtTime(400, t + bar);

            o.connect(filt); filt.connect(g); g.connect(musicGain);
            o.start(t); o.stop(t + bar);
        }

        setTimeout(playPad, bar * 1000);
    }

    // Hi-hat pattern (subtle rhythm)
    let hatStep = 0;
    function playHat() {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const accent = hatStep % 4 === 0;
        hatStep++;

        const bufSize = audioCtx.sampleRate * 0.05;
        const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(accent ? 0.08 : 0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 8000;
        src.connect(hp); hp.connect(g); g.connect(musicGain);
        src.start(t);

        setTimeout(playHat, (beat / 2) * 1000);
    }

    // Arpeggio melody (sparse cyberpunk notes)
    const arpNotes = [0, 0, 330, 0, 0, 440, 0, 392, 0, 0, 330, 0, 349, 0, 0, 0]; // sparse E4, A4, G4, E4, F4
    let arpIdx = 0;

    function playArp() {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const freq = arpNotes[arpIdx % arpNotes.length];
        arpIdx++;

        if (freq > 0) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.07, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.8);

            const delay = audioCtx.createDelay(1);
            delay.delayTime.value = beat * 0.75;
            const fb = audioCtx.createGain();
            fb.gain.value = 0.3;
            const dg = audioCtx.createGain();
            dg.gain.value = 0.04;

            o.connect(g); g.connect(musicGain);
            g.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(dg); dg.connect(musicGain);
            o.start(t); o.stop(t + beat);
        }

        setTimeout(playArp, (beat / 2) * 1000);
    }

    playBass();
    playPad();
    playHat();
    setTimeout(playArp, bar * 2 * 1000); // arp enters after 2 bars
}

// Auto-init audio on first user interaction
document.addEventListener('click', function audioInit() {
    initAudio();
    if (!musicStarted) { startMusic(); musicStarted = true; }
    document.removeEventListener('click', audioInit);
}, { once: true });

// === MULTIPLAYER / MENU ===
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function showReplayBtn() {
    let btn = document.getElementById('replay-btn');
    let cvs = document.getElementById('game');
    // Position above center of canvas
    let cTop = cvs.offsetTop;
    let cCenter = cTop + cvs.height / 2;
    btn.style.top = (cCenter - 100) + 'px';
    btn.classList.remove('waiting-host');
    btn.disabled = false;
    if (isMulti && isHost) {
        btn.textContent = 'REPLAY';
    } else if (isMulti && !isHost) {
        btn.textContent = 'EN ATTENTE DE L\'H\u00D4TE';
        btn.classList.add('waiting-host');
        btn.disabled = true;
    } else if (isRanked) {
        btn.textContent = 'PLAY AGAIN';
    } else {
        btn.textContent = 'MENU';
    }
    btn.style.display = 'block';
}

function resetGameState() {
    grid = []; towers = []; enemies = []; projectiles = [];
    gold = 160; lives = 20; score = 0; waveNum = 0;
    waveActive = false; enemiesToSpawn = 0; spawnTimer = 0;
    hoveredCell = null; selectedTower = null; nextWaveTimer = 0;
    explosions = []; floatingTexts = []; waveDuration = 0;
    waveSpawnRows = []; waveSpawnIdx = 0; gameOverPlayed = false;
    gameSpeed = 1; placingType = -1; messageTimer = 0;
    duelEnded = false; duelResultTitle = ''; duelResultSub = '';
    opponentLives = 20; opponentScore = 0; opponentWave = 0;
    opponentFinished = false; opponentFinalScore = 0; opponentFinalTime = 0;
    gameStartTime = 0; gameEndTime = 0; rankedEloChange = null;
    oppBoardData = null; _lastStatusSend = 0;
    if (_duelDisconnectTimer) { clearInterval(_duelDisconnectTimer); _duelDisconnectTimer = null; }
    _duelDisconnectCountdown = 0;
    multiEnded = false; multiResultTitle = ''; multiResultSub = '';
    multiStartTimer = 0; _lastMultiStatusSend = 0; _multiScoreSaved = false;
    let ed = document.getElementById('emote-display'); if (ed) ed.innerHTML = '';
    _emoteSendTimes = [];
    for (let r = 0; r < GRID; r++) { grid[r] = []; for (let c = 0; c < GRID; c++) grid[r][c] = 0; }
    let newEntry = generateEntryGroups();
    setEntryGroups(newEntry);
    let newExit = generateExitGroups();
    setExitGroups(newExit);
    document.getElementById('replay-btn').style.display = 'none';
    document.getElementById('speed-btn').style.display = 'none';
    document.getElementById('emote-bar').style.display = 'none';
    document.getElementById('emote-display').style.display = 'none';
    resetWaveBar();
    updateUI();
}

function onReplayClick() {
    if (isMulti && isHost) { multiReplay(); }
    else if (isRanked) { rankedReplay(); }
    else { location.reload(); }
}

function multiReplay() {
    resetGameState();
    multiPlayers.forEach(function(p, id) {
        p.lives = 20; p.score = 0; p.wave = 0;
        p.boardData = null; p.alive = true;
        p.finished = false; p.finalScore = 0; p.finalTime = 0;
    });
    multiConns.forEach(function(c) { if (c.open) c.send({ type: 'multi_back_to_lobby' }); });
    document.getElementById('opp-panel').classList.remove('active');
    document.getElementById('multi-player-list').style.display = 'none';
    document.getElementById('menu-overlay').style.display = '';
    document.getElementById('menu-multi-host').style.display = '';
    document.getElementById('multi-chat-msgs-host').innerHTML = '';
    updateMultiLobbyUI();
    isDuel = false; isMulti = false;
}

function rankedReplay() {
    if (conn) { conn.close(); conn = null; }
    if (peer) { peer.destroy(); peer = null; }
    resetGameState();
    isDuel = false; isMulti = false; isRanked = true;
    rankedMatchId = null;
    document.getElementById('opp-panel').classList.remove('active');
    document.getElementById('menu-overlay').style.display = '';
    startRankedQueue();
}

function toggleSpeed() {
    if (isDuel || isMulti) return;
    gameSpeed = gameSpeed === 1 ? 2 : 1;
    let btn = document.getElementById('speed-btn');
    btn.textContent = 'x' + gameSpeed;
    btn.classList.toggle('fast', gameSpeed === 2);
}

function menuStartSolo() {
    if (!_configLoaded) return;
    isDuel = false;
    isMulti = false;
    resetWaveBar();
    document.getElementById('wave').textContent = '0/' + WAVES.length;
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('speed-btn').style.display = '';
}

// === AUTH & RANKED ===
const SERVER_URL = 'https://invasion-server-production.up.railway.app';
let authToken = localStorage.getItem('tdpro_token');
let currentUser = null;

function fetchWithTimeout(url, opts, timeout) {
    timeout = timeout || 8000;
    const controller = new AbortController();
    const hasAuth = opts && opts.headers && opts.headers.Authorization;
    const options = Object.assign({}, opts || {}, { signal: controller.signal });
    const timer = setTimeout(function() { controller.abort(); }, timeout);
    return fetch(url, options).then(function(r) {
        clearTimeout(timer);
        if (r.status === 401 && hasAuth) {
            authToken = null;
            localStorage.removeItem('tdpro_token');
            currentUser = null;
            showMessage('Session expired, please log in again');
            updateProfileBtn();
        }
        return r;
    }).catch(function(err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') throw new Error('Request timed out');
        throw err;
    });
}
// === LOAD GAME CONFIG FROM SERVER ===
function loadGameConfig() {
    fetchWithTimeout(SERVER_URL + '/api/game-config').then(function(r) {
        if (!r.ok) throw new Error('Config fetch failed');
        return r.json();
    }).then(function(cfg) {
        TOWER_TYPES = cfg.towers;
        ENEMY_TYPES = cfg.enemies;
        WAVES = cfg.waves;
        if (cfg.constants) {
            SPAWN_INT = cfg.constants.spawnInt || 0.7;
            gold = cfg.constants.startGold || 160;
            lives = cfg.constants.startLives || 20;
        }
        _configLoaded = true;
        // Update tower button costs
        for (let i = 0; i < TOWER_TYPES.length; i++) {
            let btn = document.getElementById('tbtn-' + i);
            if (btn) {
                let costSpan = btn.querySelector('.cost');
                if (costSpan) costSpan.textContent = TOWER_TYPES[i].levels[1].cost + 'g';
            }
        }
        drawTowerIcons();
        updateWaveBar();
        updateUI();
        // Hide loading overlay
        let loadingEl = document.getElementById('config-loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }).catch(function(err) {
        console.error('Failed to load game config:', err);
        let loadingEl = document.getElementById('config-loading');
        if (loadingEl) loadingEl.textContent = 'Failed to load game data. Refresh to retry.';
    });
}
loadGameConfig();

let isRanked = false;
let rankedMatchId = null;
let rankedPollTimer = null;
let rankedEloChange = null;
let _soloSaved = false;

// Auto-load profile on startup if token exists
if (authToken) {
    loadProfile().then(function(ok) { if (ok) updateProfileBtn(); });
}

async function authRegister() {
    let user = document.getElementById('reg-user').value.trim();
    let email = document.getElementById('reg-email').value.trim();
    let pass = document.getElementById('reg-pass').value;
    document.getElementById('auth-error-reg').textContent = '';
    if (!user || !email || !pass) { document.getElementById('auth-error-reg').textContent = 'All fields required'; return; }
    if (user.length < 3 || user.length > 20) { document.getElementById('auth-error-reg').textContent = 'Username must be 3-20 characters'; return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(user)) { document.getElementById('auth-error-reg').textContent = 'Username: letters, numbers, _ and - only'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { document.getElementById('auth-error-reg').textContent = 'Invalid email format'; return; }
    if (pass.length < 6) { document.getElementById('auth-error-reg').textContent = 'Password must be at least 6 characters'; return; }
    if (pass.length > 72) { document.getElementById('auth-error-reg').textContent = 'Password must be at most 72 characters'; return; }
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, email: email, password: pass })
        });
        let data = await r.json();
        if (!r.ok) { document.getElementById('auth-error-reg').textContent = data.error || 'Error'; return; }
        authToken = data.token;
        localStorage.setItem('tdpro_token', authToken);
        currentUser = data.user;
        showLoggedMenu();
    } catch (e) { document.getElementById('auth-error-reg').textContent = 'Server unreachable'; }
}

async function authLogin() {
    let loginVal = document.getElementById('login-email').value.trim();
    let pass = document.getElementById('login-pass').value;
    document.getElementById('auth-error').textContent = '';
    if (!loginVal || !pass) { document.getElementById('auth-error').textContent = 'Login and password required'; return; }
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginVal, password: pass })
        });
        let data = await r.json();
        if (!r.ok) { document.getElementById('auth-error').textContent = data.error || 'Error'; return; }
        authToken = data.token;
        localStorage.setItem('tdpro_token', authToken);
        currentUser = data.user;
        showLoggedMenu();
    } catch (e) { document.getElementById('auth-error').textContent = 'Server unreachable'; }
}

function showLoginView() {
    document.getElementById('auth-register-view').style.display = 'none';
    document.getElementById('auth-login-view').style.display = '';
    document.getElementById('auth-error').textContent = '';
}

function showRegisterView() {
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-register-view').style.display = '';
    document.getElementById('auth-error-reg').textContent = '';
}

function authLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('tdpro_token');
    showAuthMenu();
    updateProfileBtn();
}

async function loadProfile() {
    if (!authToken) return false;
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/profile', { headers: { 'Authorization': 'Bearer ' + authToken } });
        if (!r.ok) { authToken = null; localStorage.removeItem('tdpro_token'); return false; }
        currentUser = await r.json();
        return true;
    } catch (e) { return false; }
}

function showLoggedMenu() {
    document.getElementById('menu-duel-auth').style.display = 'none';
    document.getElementById('menu-duel-logged').style.display = '';
    document.getElementById('logged-user').textContent = currentUser.username;
    document.getElementById('logged-elo').textContent = currentUser.elo;
    document.getElementById('logged-played').textContent = currentUser.gamesPlayed || 0;
    updateProfileBtn();
}

function showAuthMenu() {
    document.getElementById('menu-duel-logged').style.display = 'none';
    document.getElementById('menu-duel-auth').style.display = '';
    document.getElementById('auth-error').textContent = '';
}

function updateProfileBtn() {
    let btn = document.getElementById('profile-btn');
    let loginBtn = document.getElementById('login-btn');
    if (currentUser) {
        btn.style.display = 'flex';
        loginBtn.style.display = 'none';
        document.getElementById('profile-btn-name').textContent = currentUser.username;
    } else {
        btn.style.display = 'none';
        loginBtn.style.display = 'flex';
    }
}

function showLoginOverlay() {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('login-box-login').style.display = '';
    document.getElementById('login-box-register').style.display = 'none';
    document.getElementById('login-box-error').textContent = '';
    document.getElementById('topbar-login-email').value = '';
    document.getElementById('topbar-login-pass').value = '';
}

function hideLoginOverlay() {
    document.getElementById('login-overlay').style.display = 'none';
}

let _patchNotesLoaded = false;
function showPatchNotes() {
    document.getElementById('patch-overlay').classList.add('active');
    if (!_patchNotesLoaded) {
        _patchNotesLoaded = true;
        fetchWithTimeout(SERVER_URL + '/api/patchnotes').then(function(r) { return r.json(); }).then(function(notes) {
            let box = document.getElementById('patch-box');
            let html = '<h2>PATCH NOTES</h2>';
            for (let i = 0; i < notes.length; i++) {
                let n = notes[i];
                html += '<div class="patch-version">' + n.version + '</div><ul class="patch-list">';
                for (let j = 0; j < n.items.length; j++) {
                    html += '<li>' + n.items[j] + '</li>';
                }
                html += '</ul>';
            }
            html += '<button class="menu-btn-back" onclick="hidePatchNotes()" style="display:block;text-align:center;margin:16px auto 0">&#8592; Close</button>';
            box.innerHTML = html;
        }).catch(function() { _patchNotesLoaded = false; });
    }
}
function hidePatchNotes() {
    document.getElementById('patch-overlay').classList.remove('active');
}

function showTopbarRegister() {
    document.getElementById('login-box-login').style.display = 'none';
    document.getElementById('login-box-register').style.display = '';
    document.getElementById('login-box-reg-error').textContent = '';
}

function showTopbarLogin() {
    document.getElementById('login-box-register').style.display = 'none';
    document.getElementById('login-box-login').style.display = '';
    document.getElementById('login-box-error').textContent = '';
}

async function topbarLogin() {
    let loginVal = document.getElementById('topbar-login-email').value.trim();
    let pass = document.getElementById('topbar-login-pass').value;
    document.getElementById('login-box-error').textContent = '';
    if (!loginVal || !pass) { document.getElementById('login-box-error').textContent = 'Login and password required'; return; }
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginVal, password: pass })
        });
        let data = await r.json();
        if (!r.ok) { document.getElementById('login-box-error').textContent = data.error || 'Error'; return; }
        authToken = data.token;
        localStorage.setItem('tdpro_token', authToken);
        currentUser = data.user;
        updateProfileBtn();
        hideLoginOverlay();
    } catch (e) { document.getElementById('login-box-error').textContent = 'Server unreachable'; }
}

async function topbarRegister() {
    let user = document.getElementById('topbar-reg-user').value.trim();
    let email = document.getElementById('topbar-reg-email').value.trim();
    let pass = document.getElementById('topbar-reg-pass').value;
    document.getElementById('login-box-reg-error').textContent = '';
    if (!user || !email || !pass) { document.getElementById('login-box-reg-error').textContent = 'All fields required'; return; }
    if (user.length < 3 || user.length > 20) { document.getElementById('login-box-reg-error').textContent = 'Username must be 3-20 characters'; return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(user)) { document.getElementById('login-box-reg-error').textContent = 'Username: letters, numbers, _ and - only'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { document.getElementById('login-box-reg-error').textContent = 'Invalid email format'; return; }
    if (pass.length < 6) { document.getElementById('login-box-reg-error').textContent = 'Password must be at least 6 characters'; return; }
    if (pass.length > 72) { document.getElementById('login-box-reg-error').textContent = 'Password must be at most 72 characters'; return; }
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, email: email, password: pass })
        });
        let data = await r.json();
        if (!r.ok) { document.getElementById('login-box-reg-error').textContent = data.error || 'Error'; return; }
        authToken = data.token;
        localStorage.setItem('tdpro_token', authToken);
        currentUser = data.user;
        updateProfileBtn();
        hideLoginOverlay();
    } catch (e) { document.getElementById('login-box-reg-error').textContent = 'Server unreachable'; }
}

function showProfile() {
    if (!currentUser) return;
    document.getElementById('prof-name').textContent = currentUser.username;
    document.getElementById('prof-elo').textContent = currentUser.elo;
    document.getElementById('prof-played').textContent = currentUser.gamesPlayed || 0;
    document.getElementById('prof-wave').textContent = currentUser.bestWave || 0;
    document.getElementById('prof-score').textContent = currentUser.bestScore || 0;
    document.getElementById('profile-overlay').style.display = 'flex';
}

function hideProfile() {
    document.getElementById('profile-overlay').style.display = 'none';
}

async function startRankedQueue() {
    if (typeof Peer === 'undefined') { showMessage('Connection error'); return; }
    document.getElementById('menu-duel').style.display = 'none';
    document.getElementById('menu-ranked-queue').style.display = '';
    document.getElementById('ranked-status').textContent = 'Searching for opponent...';
    document.getElementById('ranked-timer').textContent = '';
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/queue/join', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }
        });
        let data = await r.json();
        if (!r.ok) { document.getElementById('ranked-status').textContent = data.error || 'Error'; return; }
        if (data.status === 'matched') {
            connectRankedMatch(data);
            return;
        }
        // Waiting — start polling
        rankedMatchId = data.matchId;
        rankedPollTimer = setInterval(pollRankedStatus, 2000);
    } catch (e) {
        document.getElementById('ranked-status').textContent = 'Server unreachable';
    }
}

async function pollRankedStatus() {
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/queue/status', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        let data = await r.json();
        if (data.status === 'matched') {
            clearInterval(rankedPollTimer); rankedPollTimer = null;
            connectRankedMatch(data);
        } else if (data.status === 'timeout' || data.status === 'expired') {
            clearInterval(rankedPollTimer); rankedPollTimer = null;
            document.getElementById('ranked-status').textContent = 'No opponent found';
            document.getElementById('ranked-timer').textContent = '';
            setTimeout(function() {
                document.getElementById('menu-ranked-queue').style.display = 'none';
                document.getElementById('menu-duel').style.display = '';
                showLoggedMenu();
            }, 1500);
        } else if (data.status === 'waiting') {
            document.getElementById('ranked-timer').textContent = data.waited + 's';
        }
    } catch (e) { /* ignore poll errors */ }
}

function connectRankedMatch(data) {
    rankedMatchId = data.matchId;
    isRanked = true;
    rankedEloChange = null;
    let peerCode = data.peerCode;
    document.getElementById('ranked-status').textContent = 'Opponent found! Connecting...';
    document.getElementById('ranked-timer').textContent = data.opponent.username + ' (ELO: ' + data.opponent.elo + ')';

    if (data.isHost) {
        peer = new Peer('tdpro-' + peerCode, PEER_CONFIG);
        peer.on('open', function() {});
        peer.on('connection', function(c) {
            conn = c;
            isHost = true;
            conn.on('open', function() {
                setupConnection();
                conn.send({ type: 'init', entryGroups: ENTRY_GROUPS, exitGroups: EXIT_GROUPS });
                setTimeout(startDuel, 800);
            });
        });
        peer.on('error', function(err) {
            document.getElementById('ranked-status').textContent = 'Connection error: ' + err.type;
        });
    } else {
        let retries = 0;
        let maxRetries = 5;
        function attemptConnect() {
            if (peer) peer.destroy();
            peer = new Peer(undefined, PEER_CONFIG);
            peer.on('open', function() {
                conn = peer.connect('tdpro-' + peerCode, { reliable: true });
                conn.on('open', function() {
                    isHost = false;
                    setupConnection();
                });
                conn.on('error', function() {
                    document.getElementById('ranked-status').textContent = 'Connection failed';
                });
            });
            peer.on('error', function(err) {
                if (err.type === 'peer-unavailable' && retries < maxRetries) {
                    retries++;
                    document.getElementById('ranked-status').textContent = 'Connecting... (attempt ' + (retries + 1) + ')';
                    setTimeout(attemptConnect, 2000);
                } else {
                    document.getElementById('ranked-status').textContent = 'Error: ' + err.type;
                }
            });
        }
        setTimeout(attemptConnect, 1500);
    }
}

function cancelRankedQueue() {
    if (rankedPollTimer) { clearInterval(rankedPollTimer); rankedPollTimer = null; }
    fetchWithTimeout(SERVER_URL + '/api/queue/leave', {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken }
    }).catch(function() {});
    if (peer) { peer.destroy(); peer = null; conn = null; }
    document.getElementById('menu-ranked-queue').style.display = 'none';
    document.getElementById('menu-duel').style.display = '';
    showLoggedMenu();
}

function submitRankedResult(resultStr) {
    if (!isRanked || !authToken || !rankedMatchId) return;
    var mid = rankedMatchId;
    fetchWithTimeout(SERVER_URL + '/api/match/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
        body: JSON.stringify({
            matchId: mid,
            finalScore: finalScore(),
            finalLives: Math.max(0, lives),
            finalWave: waveNum,
            oppScore: opponentFinalScore || opponentScore,
            oppLives: Math.max(0, opponentLives),
            oppWave: opponentWave,
            result: resultStr
        })
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.eloChange !== undefined) rankedEloChange = data.eloChange;
        if (data.newElo !== undefined && currentUser) currentUser.elo = data.newElo;
        if (data.status === 'waiting') pollRankedResult(mid, 0);
    }).catch(function() { showMessage('Result submit failed'); });
}

function pollRankedResult(matchId, attempt) {
    if (attempt >= 10) return;
    setTimeout(function() {
        fetchWithTimeout(SERVER_URL + '/api/match/result/' + matchId, {
            headers: { 'Authorization': 'Bearer ' + authToken }
        }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.status === 'waiting') {
                pollRankedResult(matchId, attempt + 1);
            } else {
                if (data.eloChange !== undefined) rankedEloChange = data.eloChange;
                if (data.newElo !== undefined && currentUser) currentUser.elo = data.newElo;
            }
        }).catch(function() {});
    }, 2000);
}

async function menuShowDuel() {
    document.getElementById('menu-main').style.display = 'none';
    document.getElementById('menu-duel').style.display = '';
    if (authToken) {
        let ok = await loadProfile();
        if (ok) { showLoggedMenu(); } else { showAuthMenu(); }
    } else {
        showAuthMenu();
    }
}

function menuBack() {
    document.getElementById('menu-duel').style.display = 'none';
    document.getElementById('menu-main').style.display = '';
}

function menuShowRules() {
    document.getElementById('menu-main').style.display = 'none';
    document.getElementById('menu-rules').style.display = '';
}

function menuBackFromRules() {
    document.getElementById('menu-rules').style.display = 'none';
    document.getElementById('menu-main').style.display = '';
}

function menuCreateRoom() {
    if (typeof Peer === 'undefined') { showMessage('Connection error'); return; }
    document.getElementById('menu-duel').style.display = 'none';
    document.getElementById('menu-host').style.display = '';
    const code = generateRoomCode();
    document.getElementById('menu-code').textContent = code;
    document.getElementById('menu-wait').textContent = 'Waiting for opponent...';
    document.getElementById('menu-status').style.display = 'none';

    peer = new Peer('tdpro-' + code, PEER_CONFIG);
    peer.on('open', function() {
        // Ready, waiting for connection
    });
    peer.on('connection', function(c) {
        conn = c;
        isHost = true;
        conn.on('open', function() {
            setupConnection();
            // Send game config (entry groups) so both boards match
            conn.send({ type: 'init', entryGroups: ENTRY_GROUPS, exitGroups: EXIT_GROUPS });
            document.getElementById('menu-wait').textContent = '';
            document.getElementById('menu-status').textContent = 'Opponent connected!';
            document.getElementById('menu-status').style.display = '';
            setTimeout(startDuel, 800);
        });
    });
    peer.on('error', function(err) {
        document.getElementById('menu-wait').textContent = 'Error: ' + err.type;
    });
}

function menuShowJoin() {
    document.getElementById('menu-duel').style.display = 'none';
    document.getElementById('menu-join').style.display = '';
    setTimeout(function() { document.getElementById('join-code').focus(); }, 100);
}

function menuJoinRoom() {
    if (typeof Peer === 'undefined') { showMessage('Connection error'); return; }
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if (code.length !== 4) return;
    document.getElementById('join-error').style.display = 'none';

    peer = new Peer(undefined, PEER_CONFIG);
    peer.on('open', function() {
        conn = peer.connect('tdpro-' + code, { reliable: true });
        conn.on('open', function() {
            isHost = false;
            setupConnection();
            // Don't startDuel yet — wait for 'init' message from host
        });
        conn.on('error', function() {
            document.getElementById('join-error').textContent = 'Connection failed';
            document.getElementById('join-error').style.display = '';
        });
    });
    peer.on('error', function(err) {
        document.getElementById('join-error').textContent = 'Error: ' + err.type;
        document.getElementById('join-error').style.display = '';
    });
}

function menuBackToDuel() {
    document.getElementById('menu-join').style.display = 'none';
    document.getElementById('menu-host').style.display = 'none';
    document.getElementById('menu-duel').style.display = '';
    if (peer) { peer.destroy(); peer = null; conn = null; }
}

function menuCancelHost() {
    menuBackToDuel();
}

let _duelDisconnectTimer = null;
let _duelDisconnectCountdown = 0;

function setupConnection() {
    conn.on('data', handlePeerMessage);
    conn.on('close', function() {
        if (!duelEnded) {
            _duelDisconnectCountdown = 8;
            showMessage('Opponent disconnected — win in 8s...');
            _duelDisconnectTimer = setInterval(function() {
                _duelDisconnectCountdown--;
                if (_duelDisconnectCountdown <= 0) {
                    clearInterval(_duelDisconnectTimer);
                    _duelDisconnectTimer = null;
                    if (!duelEnded) {
                        duelEnded = true;
                        duelResultTitle = 'VICTORY';
                        duelResultSub = 'Opponent disconnected';
                        playSfx('victory');
                        submitRankedResult('win');
                    }
                } else {
                    showMessage('Opponent disconnected — win in ' + _duelDisconnectCountdown + 's...');
                }
            }, 1000);
        }
    });
}

function startDuel() {
    isDuel = true;
    resetWaveBar();
    document.getElementById('wave').textContent = '0/' + WAVES.length;
    duelEnded = false;
    duelResultTitle = '';
    duelResultSub = '';
    opponentFinished = false;
    duelStartTimer = 20; // 20s countdown before wave 1
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('opp-panel').classList.add('active');
    document.getElementById('emote-bar').style.display = 'flex';
    document.getElementById('emote-display').style.display = 'flex';
    document.getElementById('multi-player-list').style.display = 'none';
    initOpponentCanvas();
    resizeGame();
}

function handlePeerMessage(data) {
    if (data.type === 'init') {
        setEntryGroups(data.entryGroups);
        if (data.exitGroups) setExitGroups(data.exitGroups);
        startDuel();
    } else if (data.type === 'wave_start') {
        // Ignore if we already started this wave (both timers fired)
        if (data.waveNum !== undefined && data.waveNum <= waveNum) return;
        var duelCatchUp = data.waveNum !== undefined && data.waveNum > waveNum + 1;
        if (duelCatchUp) {
            // Behind by multiple waves (tab was hidden): skip ahead cleanly
            enemies = [];
            projectiles = [];
            enemiesToSpawn = 0;
            waveActive = false;
            nextWaveTimer = 0;
            duelStartTimer = 0;
            waveNum = data.waveNum - 1;
        } else {
            // Flush remaining unspawned enemies from current wave
            if (waveActive && enemiesToSpawn > 0) {
                var wd2 = WAVES[waveNum - 1];
                while (enemiesToSpawn > 0) {
                    var sr2;
                    if (waveSpawnIdx < waveSpawnRows.length) sr2 = waveSpawnRows[waveSpawnIdx++];
                    else { var v2 = getValidEntryRows(); if (v2.length) sr2 = v2[Math.floor(Math.random() * v2.length)]; }
                    var _fi2 = wd2.count - enemiesToSpawn;
                    var _ft2 = wd2.types ? wd2.types[_fi2 % wd2.types.length] : wd2.type;
                    if (sr2 !== undefined) enemies.push(new Enemy(sr2, wd2.hp, _ft2));
                    enemiesToSpawn--;
                }
            }
            waveActive = false;
            nextWaveTimer = 0;
            duelStartTimer = 0; // clear countdown so wave 1 guard doesn't block
        }
        startWave(false); // don't echo back
    } else if (data.type === 'status') {
        opponentLives = data.lives;
        opponentScore = data.score;
        opponentWave = data.wave;
        if (data.tw) {
            oppBoardData = { towers: data.tw, enemies: data.en };
            drawOpponentBoard();
        }
        updateOpponentUI();
    } else if (data.type === 'game_over') {
        // Opponent died -> I win
        if (!duelEnded) {
            duelEnded = true;
            duelResultTitle = 'VICTORY';
            duelResultSub = 'Opponent has been eliminated';
            playSfx('victory');
            submitRankedResult('win');
        }
    } else if (data.type === 'game_complete') {
        opponentFinished = true;
        opponentFinalScore = data.score;
        opponentFinalTime = data.time;
        checkDuelEnd();
    } else if (data.type === 'emote') {
        if (data.id >= 0 && data.id < EMOTES.length) {
            showEmotePopup(EMOTES[data.id], false);
        }
    }
}

function updateOpponentUI() {
    document.getElementById('opp-lives').textContent = opponentLives;
    document.getElementById('opp-score').textContent = opponentScore;
}

function checkDuelEnd() {
    if (duelEnded) return;
    if (!opponentFinished) return;
    // Check if I also finished all waves
    if (waveNum < WAVES.length || waveActive || enemies.length > 0) return;
    if (lives <= 0) return;

    gameEndTime = gameEndTime || Date.now();
    const myTime = gameEndTime - gameStartTime;
    duelEnded = true;

    let myFinal = finalScore();
    if (myFinal > opponentFinalScore) {
        duelResultTitle = 'VICTORY';
        duelResultSub = 'Score: ' + myFinal + ' vs ' + opponentFinalScore;
    } else if (myFinal < opponentFinalScore) {
        duelResultTitle = 'DEFEAT';
        duelResultSub = 'Score: ' + myFinal + ' vs ' + opponentFinalScore;
    } else if (myTime < opponentFinalTime) {
        duelResultTitle = 'VICTORY';
        duelResultSub = 'Faster! (' + (myTime / 1000).toFixed(1) + 's vs ' + (opponentFinalTime / 1000).toFixed(1) + 's)';
    } else if (myTime > opponentFinalTime) {
        duelResultTitle = 'DEFEAT';
        duelResultSub = 'Too slow! (' + (myTime / 1000).toFixed(1) + 's vs ' + (opponentFinalTime / 1000).toFixed(1) + 's)';
    } else {
        duelResultTitle = 'DRAW';
        duelResultSub = 'Scores and times are equal!';
    }
    playSfx(duelResultTitle === 'VICTORY' ? 'victory' : 'gameover');
    submitRankedResult(duelResultTitle === 'VICTORY' ? 'win' : (duelResultTitle === 'DEFEAT' ? 'loss' : 'draw'));
}

// === MULTIPLAYER MENU ===
function menuShowMulti() {
    document.getElementById('menu-main').style.display = 'none';
    document.getElementById('menu-multi').style.display = '';
    if (currentUser) document.getElementById('multi-name').value = currentUser.username;
}
function menuMultiBack() {
    document.getElementById('menu-multi').style.display = 'none';
    document.getElementById('menu-main').style.display = '';
}
const _rndNames = ['Shadow','Phantom','Blaze','Vortex','Neon','Cipher','Nova','Pulse','Flux','Drift','Spark','Glitch','Echo','Byte','Hexa','Pixel','Turbo','Zinc','Onyx','Razor','Storm','Frost','Volt','Chaos','Omega'];
let _myRndName = _rndNames[Math.floor(Math.random() * _rndNames.length)] + Math.floor(Math.random() * 100);
function getMultiName() {
    let n = (document.getElementById('multi-name').value || '').trim();
    return n || (currentUser ? currentUser.username : _myRndName);
}
function menuMultiCreate() {
    if (typeof Peer === 'undefined') { showMessage('Connection error'); return; }
    document.getElementById('menu-multi').style.display = 'none';
    document.getElementById('menu-multi-host').style.display = '';
    let code = generateRoomCode();
    document.getElementById('multi-code').textContent = code;
    document.getElementById('multi-lobby-list').textContent = 'Waiting for players...';
    document.getElementById('multi-start-btn').disabled = true;
    multiPlayers.clear();
    multiConns = [];
    let myName = getMultiName();
    peer = new Peer('tdmulti-' + code, PEER_CONFIG);
    peer.on('open', function() {
        myPlayerId = peer.id;
        isHost = true;
        multiPlayers.set(myPlayerId, { conn: null, name: myName, lives: 20, score: 0, wave: 0, boardData: null, alive: true });
        updateMultiLobbyUI();
    });
    peer.on('connection', function(c) {
        c.on('open', function() {
            c.on('data', function(data) { handleMultiHostMessage(data, c); });
            c.on('close', function() { handleMultiDisconnect(c.peer); });
        });
    });
    peer.on('error', function(err) {
        document.getElementById('multi-lobby-list').textContent = 'Error: ' + err.type;
    });
}
function menuMultiShowJoin() {
    document.getElementById('menu-multi').style.display = 'none';
    document.getElementById('menu-multi-join').style.display = '';
    setTimeout(function() { document.getElementById('multi-join-code').focus(); }, 100);
}
function menuMultiJoin() {
    if (typeof Peer === 'undefined') { showMessage('Connection error'); return; }
    let code = document.getElementById('multi-join-code').value.toUpperCase().trim();
    if (code.length !== 4) return;
    document.getElementById('multi-join-error').style.display = 'none';
    let myName = getMultiName();
    peer = new Peer(undefined, PEER_CONFIG);
    peer.on('open', function() {
        myPlayerId = peer.id;
        conn = peer.connect('tdmulti-' + code, { reliable: true });
        conn.on('open', function() {
            isHost = false;
            conn.send({ type: 'multi_join', name: myName });
            conn.on('data', handleMultiJoinerMessage);
            conn.on('close', function() {
                if (!multiEnded && isMulti) {
                    conn = null;
                    attemptHostMigration();
                }
            });
            document.getElementById('menu-multi-join').style.display = 'none';
            document.getElementById('menu-multi-lobby').style.display = '';
        });
        conn.on('error', function() {
            document.getElementById('multi-join-error').textContent = 'Connection failed';
            document.getElementById('multi-join-error').style.display = '';
        });
    });
    peer.on('error', function(err) {
        document.getElementById('multi-join-error').textContent = 'Error: ' + err.type;
        document.getElementById('multi-join-error').style.display = '';
    });
}
function menuMultiBackToMenu() {
    document.getElementById('menu-multi-join').style.display = 'none';
    document.getElementById('menu-multi').style.display = '';
    if (peer) { peer.destroy(); peer = null; conn = null; }
}
function menuMultiCancel() {
    document.getElementById('menu-multi-host').style.display = 'none';
    document.getElementById('menu-multi').style.display = '';
    if (peer) { peer.destroy(); peer = null; }
    multiPlayers.clear(); multiConns = [];
}
function menuMultiLeave() {
    document.getElementById('menu-multi-lobby').style.display = 'none';
    document.getElementById('menu-multi').style.display = '';
    if (conn) conn.close();
    if (peer) { peer.destroy(); peer = null; conn = null; }
}
function menuMultiStart() {
    let roster = [];
    multiPlayers.forEach(function(p, id) { roster.push({ id: id, name: p.name }); });
    _multiRoster = roster.slice();
    _multiHostId = myPlayerId;
    multiConns.forEach(function(c) {
        if (c.open) c.send({ type: 'multi_init', entryGroups: ENTRY_GROUPS, exitGroups: EXIT_GROUPS, players: roster, hostId: myPlayerId });
    });
    startMultiGame(roster);
}
function updateMultiLobbyUI() {
    let list = document.getElementById('multi-lobby-list');
    let html = '';
    let count = 0;
    multiPlayers.forEach(function(p, id) {
        count++;
        let isMe = id === myPlayerId;
        html += '<div style="color:' + (isMe ? '#00f0ff' : '#607888') + ';font-size:10px;padding:2px 0">' + (isMe ? p.name + ' (Host)' : p.name) + '</div>';
    });
    list.innerHTML = html;
    document.getElementById('multi-start-btn').disabled = count < 2;
}

// === MULTIPLAYER HOST MESSAGE HANDLER ===
function handleMultiHostMessage(data, senderConn) {
    let senderId = senderConn.peer;
    if (data.type === 'multi_chat') {
        multiConns.forEach(function(c) { if (c.open && c.peer !== senderConn.peer) c.send(data); });
        appendChatMsg('host', data.name, data.text);
        return;
    }
    if (data.type === 'multi_join') {
        if (multiPlayers.size >= 50) { senderConn.send({ type: 'lobby_full' }); senderConn.close(); return; }
        multiPlayers.set(senderId, { conn: senderConn, name: data.name || ('P' + multiPlayers.size), lives: 20, score: 0, wave: 0, boardData: null, alive: true });
        multiConns.push(senderConn);
        updateMultiLobbyUI();
        let roster = [];
        multiPlayers.forEach(function(p, id) { roster.push({ id: id, name: p.name }); });
        multiConns.forEach(function(c) { if (c.open) c.send({ type: 'multi_lobby', players: roster }); });
    } else if (data.type === 'my_status') {
        let p = multiPlayers.get(senderId);
        if (p) {
            p.lives = data.lives; p.score = data.score; p.wave = data.wave;
            if (data.tw) p.boardData = { towers: data.tw, enemies: data.en };
            p.alive = data.lives > 0;
        }
    } else if (data.type === 'multi_wave_request') {
        // A joiner requested to launch the next wave — host starts it for everyone
        if (data.waveNum !== undefined && data.waveNum <= waveNum) return;
        // Flush host's remaining unspawned enemies if wave still active
        if (waveActive && enemiesToSpawn > 0) {
            let wd = WAVES[waveNum - 1];
            while (enemiesToSpawn > 0) {
                let sr;
                if (waveSpawnIdx < waveSpawnRows.length) sr = waveSpawnRows[waveSpawnIdx++];
                else { let v = getValidEntryRows(); if (v.length) sr = v[Math.floor(Math.random() * v.length)]; }
                const _fi = wd.count - enemiesToSpawn;
                const _ft = wd.types ? wd.types[_fi % wd.types.length] : wd.type;
                if (sr !== undefined) enemies.push(new Enemy(sr, wd.hp, _ft));
                enemiesToSpawn--;
            }
        }
        waveActive = false;
        startWave(true); // host starts + broadcasts multi_wave_start to all
    } else if (data.type === 'multi_game_over') {
        let p2 = multiPlayers.get(senderId);
        if (p2) p2.alive = false;
        checkMultiEnd();
    } else if (data.type === 'multi_game_complete') {
        let p3 = multiPlayers.get(senderId);
        if (p3) { p3.finished = true; p3.finalScore = data.score; p3.finalTime = data.time; }
        checkMultiEnd();
    }
}

// === MULTIPLAYER JOINER MESSAGE HANDLER ===
function handleMultiJoinerMessage(data) {
    if (data.type === 'multi_back_to_lobby') {
        resetGameState();
        isDuel = false; isMulti = false;
        document.getElementById('opp-panel').classList.remove('active');
        document.getElementById('multi-player-list').style.display = 'none';
        document.getElementById('menu-overlay').style.display = '';
        document.getElementById('menu-multi-lobby').style.display = '';
        document.getElementById('multi-chat-msgs-lobby').innerHTML = '';
        return;
    }
    if (data.type === 'multi_chat') {
        appendChatMsg('lobby', data.name, data.text);
        return;
    }
    if (data.type === 'new_host') {
        _multiHostId = data.hostId;
        cleanupMigration();
        showMessage('New host connected');
        return;
    }
    if (data.type === 'lobby_full') {
        showMessage('Lobby full (50 max)');
        if (conn) conn.close();
        if (peer) { peer.destroy(); peer = null; conn = null; }
        document.getElementById('menu-multi-lobby').style.display = 'none';
        document.getElementById('menu-multi-join').style.display = '';
        document.getElementById('multi-join-error').textContent = 'Lobby full (50 players max)';
        document.getElementById('multi-join-error').style.display = '';
        return;
    }
    if (data.type === 'multi_lobby') {
        let el = document.getElementById('multi-lobby-players');
        el.innerHTML = data.players.map(function(p) {
            return '<div style="color:' + (p.id === myPlayerId ? '#00f0ff' : '#607888') + ';font-size:10px;padding:2px 0">' + escapeHtml(p.name) + '</div>';
        }).join('');
    } else if (data.type === 'multi_init') {
        setEntryGroups(data.entryGroups);
        if (data.exitGroups) setExitGroups(data.exitGroups);
        _multiRoster = data.players.slice();
        _multiHostId = data.hostId;
        multiPlayers.clear();
        data.players.forEach(function(p) {
            if (p.id !== myPlayerId) {
                multiPlayers.set(p.id, { conn: null, name: p.name, lives: 20, score: 0, wave: 0, boardData: null, alive: true });
            }
        });
        startMultiGame(data.players);
    } else if (data.type === 'multi_status') {
        data.players.forEach(function(p) {
            if (p.id === myPlayerId) return;
            let ex = multiPlayers.get(p.id);
            if (ex) {
                ex.lives = p.lives; ex.score = p.score; ex.wave = p.wave; ex.alive = p.alive;
                if (p.tw) ex.boardData = { towers: p.tw, enemies: p.en };
            } else {
                multiPlayers.set(p.id, { conn: null, name: p.name, lives: p.lives, score: p.score, wave: p.wave, boardData: p.tw ? { towers: p.tw, enemies: p.en } : null, alive: p.alive });
            }
        });
        updateMultiPlayerListUI();
        updateMultiOpponentView();
    } else if (data.type === 'multi_wave_start') {
        if (data.waveNum !== undefined && data.waveNum <= waveNum) return;
        var catchingUp = data.waveNum !== undefined && data.waveNum > waveNum + 1;
        if (catchingUp) {
            // Behind by multiple waves (tab was hidden): skip ahead cleanly
            enemies = [];
            projectiles = [];
            enemiesToSpawn = 0;
            waveActive = false;
            nextWaveTimer = 0;
            multiStartTimer = 0;
            waveNum = data.waveNum - 1;
        } else {
            // Normal: flush remaining unspawned enemies from current wave
            if (waveActive && enemiesToSpawn > 0) {
                var wd = WAVES[waveNum - 1];
                while (enemiesToSpawn > 0) {
                    var sr;
                    if (waveSpawnIdx < waveSpawnRows.length) sr = waveSpawnRows[waveSpawnIdx++];
                    else { var v = getValidEntryRows(); if (v.length) sr = v[Math.floor(Math.random() * v.length)]; }
                    var _fi = wd.count - enemiesToSpawn;
                    var _ft = wd.types ? wd.types[_fi % wd.types.length] : wd.type;
                    if (sr !== undefined) enemies.push(new Enemy(sr, wd.hp, _ft));
                    enemiesToSpawn--;
                }
            }
            waveActive = false; nextWaveTimer = 0; multiStartTimer = 0;
        }
        startWave(false);
    } else if (data.type === 'multi_end') {
        multiEnded = true;
        let myRank = data.rankings.findIndex(function(r) { return r.id === myPlayerId; });
        multiResultTitle = myRank === 0 ? 'VICTORY' : 'DEFEAT';
        multiResultSub = data.rankings.map(function(r, i) { return (i + 1) + '. ' + r.name + ' - ' + r.score + 'pts'; }).join('\n');
        playSfx(myRank === 0 ? 'victory' : 'gameover');
        saveMultiScoreToSolo();
    }
}

// === START MULTI GAME ===
function startMultiGame(playerRoster) {
    isMulti = true;
    isDuel = false;
    resetWaveBar();
    document.getElementById('wave').textContent = '0/' + WAVES.length;
    multiEnded = false;
    multiResultTitle = '';
    multiResultSub = '';
    _multiScoreSaved = false;
    multiStartTimer = 20;
    for (let i = 0; i < playerRoster.length; i++) {
        if (playerRoster[i].id !== myPlayerId) { selectedViewPlayer = playerRoster[i].id; break; }
    }
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('opp-panel').classList.add('active');
    document.getElementById('emote-bar').style.display = 'none';
    document.getElementById('emote-display').style.display = 'none';
    document.getElementById('multi-player-list').style.display = 'block';
    initOpponentCanvas();
    resizeGame();
    updateMultiPlayerListUI();
}

// === PLAYER LIST UI ===
function updateMultiPlayerListUI() {
    let listEl = document.getElementById('multi-player-list');
    if (!listEl) return;
    let arr = [];
    multiPlayers.forEach(function(p, id) {
        if (id === myPlayerId) {
            arr.push({ id: id, name: p.name + ' (You)', lives: lives, score: score, wave: waveNum, alive: lives > 0 });
        } else {
            arr.push({ id: id, name: p.name, lives: p.lives, score: p.score, wave: p.wave, alive: p.alive });
        }
    });
    // Add self if host (host is in multiPlayers) — already covered above
    // Add self if joiner (joiner is NOT in multiPlayers)
    if (!isHost && !multiPlayers.has(myPlayerId)) {
        let myName = getMultiName();
        arr.push({ id: myPlayerId, name: myName + ' (You)', lives: lives, score: score, wave: waveNum, alive: lives > 0 });
    }
    arr.sort(function(a, b) { return b.score - a.score || b.lives - a.lives; });
    let html = '';
    for (let i = 0; i < arr.length; i++) {
        let p = arr[i];
        let sel = p.id === selectedViewPlayer ? ' selected' : '';
        let dead = !p.alive ? ' dead' : '';
        html += '<div class="mp-row' + sel + dead + '" onclick="selectMultiPlayer(\'' + escapeHtml(p.id) + '\')">'
              + '<span class="mp-rank">' + (i + 1) + '</span>'
              + '<span class="mp-name">' + escapeHtml(p.name) + '</span>'
              + '<span class="mp-score">' + p.score + 'pts</span>'
              + '<span class="mp-lives">' + p.lives + 'hp</span>'
              + '</div>';
    }
    listEl.innerHTML = html;
}

function selectMultiPlayer(playerId) {
    if (playerId === myPlayerId) return;
    selectedViewPlayer = playerId;
    updateMultiPlayerListUI();
    updateMultiOpponentView();
}

function updateMultiOpponentView() {
    if (!selectedViewPlayer) return;
    let p = multiPlayers.get(selectedViewPlayer);
    if (!p) return;
    document.getElementById('opp-lives').textContent = p.lives;
    document.getElementById('opp-score').textContent = p.score;
    let label = document.querySelector('.opp-label');
    if (label) label.textContent = p.name;
    if (p.boardData) { oppBoardData = p.boardData; drawOpponentBoard(); }
}

let _multiScoreSaved = false;
function saveMultiScoreToSolo() {
    if (_multiScoreSaved || !authToken) return;
    _multiScoreSaved = true;
    fetchWithTimeout(SERVER_URL + '/api/solo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
        body: JSON.stringify({ bestWave: waveNum, bestScore: finalScore() })
    }).catch(function() { showMessage('Score save failed'); });
}

function broadcastMultiStatus() {
    let allP = [];
    multiPlayers.forEach(function(p, id) {
        allP.push({ id: id, name: p.name, lives: p.lives, score: p.score, wave: p.wave, alive: p.alive, tw: p.boardData ? p.boardData.towers : [], en: p.boardData ? p.boardData.enemies : [] });
    });
    multiConns.forEach(function(c) { if (c.open) c.send({ type: 'multi_status', players: allP }); });
    updateMultiPlayerListUI();
    updateMultiOpponentView();
}

// === HOST MIGRATION ===
function cleanupMigration() {
    if (_migrationTimer) { clearTimeout(_migrationTimer); _migrationTimer = null; }
    if (_migrationConnHandler && peer) { peer.off('connection', _migrationConnHandler); _migrationConnHandler = null; }
}

function attemptHostMigration() {
    if (multiEnded || !isMulti) return;
    // Cleanup previous migration attempt
    cleanupMigration();

    let oldHostId = _multiHostId;
    // Remove old host from players and roster
    multiPlayers.delete(oldHostId);
    _multiRoster = _multiRoster.filter(function(r) { return r.id !== oldHostId; });

    // Elect new host: first alive player in roster
    let newHostId = null;
    for (let i = 0; i < _multiRoster.length; i++) {
        let rid = _multiRoster[i].id;
        let rp = multiPlayers.get(rid);
        if (rid === myPlayerId) {
            if (lives > 0) { newHostId = rid; break; }
        } else if (rp && rp.alive) {
            newHostId = rid; break;
        }
    }
    if (!newHostId) {
        multiEnded = true;
        multiResultTitle = 'DISCONNECTED';
        multiResultSub = 'All players disconnected';
        showMessage('All players disconnected');
        return;
    }
    _multiHostId = newHostId;

    // Start migration timeout (15s)
    _migrationTimer = setTimeout(function() {
        _migrationTimer = null;
        if (!multiEnded && isMulti) {
            multiEnded = true;
            multiResultTitle = 'DISCONNECTED';
            multiResultSub = 'Host migration failed';
            showMessage('Connection lost');
        }
    }, 15000);

    if (newHostId === myPlayerId) {
        // I become the new host
        isHost = true;
        multiConns = [];
        // Add myself to multiPlayers if not present
        if (!multiPlayers.has(myPlayerId)) {
            let myName = getMultiName();
            multiPlayers.set(myPlayerId, { conn: null, name: myName, lives: lives, score: score, wave: waveNum, boardData: null, alive: lives > 0 });
        } else {
            let me = multiPlayers.get(myPlayerId);
            me.lives = lives; me.score = score; me.wave = waveNum; me.alive = lives > 0;
        }
        showMessage('You are now host');
        // Connect to all other alive players
        let otherIds = _multiRoster.filter(function(r) { return r.id !== myPlayerId; }).map(function(r) { return r.id; });
        for (let j = 0; j < otherIds.length; j++) {
            (function(targetId) {
                let c = peer.connect(targetId, { reliable: true });
                c.on('open', function() {
                    if (_migrationTimer) { clearTimeout(_migrationTimer); _migrationTimer = null; }
                    multiConns.push(c);
                    c.send({ type: 'new_host', hostId: myPlayerId });
                    c.on('data', function(data) { handleMultiHostMessage(data, c); });
                    c.on('close', function() { handleMultiDisconnect(c.peer); });
                    broadcastMultiStatus();
                });
            })(otherIds[j]);
        }
        // Listen for incoming connections from late joiners
        _migrationConnHandler = function(c) {
            c.on('open', function() {
                multiConns.push(c);
                c.send({ type: 'new_host', hostId: myPlayerId });
                c.on('data', function(data) { handleMultiHostMessage(data, c); });
                c.on('close', function() { handleMultiDisconnect(c.peer); });
                broadcastMultiStatus();
            });
        };
        peer.on('connection', _migrationConnHandler);
        // Cancel timeout once at least one connection succeeds
        if (otherIds.length === 0) cleanupMigration();
    } else {
        // Someone else is the new host, wait for their connection
        showMessage('Host migrating...');
        _migrationConnHandler = function(c) {
            c.on('open', function() {
                conn = c;
                cleanupMigration();
                conn.on('data', handleMultiJoinerMessage);
                conn.on('close', function() {
                    if (!multiEnded && isMulti) {
                        conn = null;
                        attemptHostMigration();
                    }
                });
            });
        };
        peer.on('connection', _migrationConnHandler);
    }
}

// === MULTI GAME END ===
function checkMultiEnd() {
    if (multiEnded || !isHost) return;
    let aliveCount = 0;
    let allDone = true;
    multiPlayers.forEach(function(p) {
        if (p.alive) aliveCount++;
        if (p.alive && !p.finished) allDone = false;
    });
    // Game ends when 1 or 0 players alive, OR all alive players finished all waves
    if (aliveCount > 1 && !allDone) return;
    multiEnded = true;
    // Update host's own data before building rankings
    let me = multiPlayers.get(myPlayerId);
    if (me) { me.score = score; me.lives = lives; me.alive = lives > 0; }
    let rankings = [];
    multiPlayers.forEach(function(p, id) {
        let fs = p.finalScore || (p.score + (p.alive ? p.lives * 10 : 0));
        rankings.push({ id: id, name: p.name, score: fs, alive: p.alive, time: p.finalTime || 0 });
    });
    rankings.sort(function(a, b) {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.score - a.score;
    });
    multiConns.forEach(function(c) { if (c.open) c.send({ type: 'multi_end', rankings: rankings }); });
    let myRank = rankings.findIndex(function(r) { return r.id === myPlayerId; });
    multiResultTitle = myRank === 0 ? 'VICTORY' : 'DEFEAT';
    multiResultSub = rankings.map(function(r, i) { return (i + 1) + '. ' + r.name + ' - ' + r.score + 'pts'; }).join('\n');
    playSfx(myRank === 0 ? 'victory' : 'gameover');
    saveMultiScoreToSolo();
}

function handleMultiDisconnect(peerId) {
    let p = multiPlayers.get(peerId);
    if (p) {
        p.alive = false;
        multiConns = multiConns.filter(function(c) { return c.peer !== peerId; });
        if (isMulti) checkMultiEnd();
    }
}

document.addEventListener('keydown', function(e) {
    // Enter to join room
    if (e.key === 'Enter' && document.getElementById('menu-join').style.display !== 'none') {
        menuJoinRoom();
        return;
    }
    if (e.key === 'Enter' && document.getElementById('menu-multi-join').style.display !== 'none') {
        menuMultiJoin();
        return;
    }
    // Ignore shortcuts if menu is open or typing in input
    if (document.getElementById('menu-overlay').style.display !== 'none') return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    // Space = launch next wave
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        startWave();
    }
    // U = upgrade selected tower
    if (e.key === 'u' || e.key === 'U') {
        if (selectedTower) upgradeSelected();
    }
    // S = sell selected tower
    if (e.key === 's' || e.key === 'S') {
        if (selectedTower) sellSelected();
    }
    // 1-9 = select tower type
    let num = parseInt(e.key);
    if (num >= 1 && num <= TOWER_TYPES.length) {
        toggleTowerMode(num - 1);
    }
});

// === OPPONENT MINI-BOARD ===
// Tower colors matching L1: Cannon, Sniper, Freeze, Splash, Exorcist, Tesla, Booster, Grenade(skip), Laser
const OPP_TOWER_COLORS = ['#5cf','#f90','#cfefff','#f6a','#b6f','#ee0','#5fa',null,'#f2f'];

function initOpponentCanvas() {
    let oc = document.getElementById('opp-canvas');
    oc.width = Math.round(CANVAS_W * 0.75);
    oc.height = Math.round(CANVAS_H * 0.75);
}

function drawOpponentBoard() {
    if (!oppBoardData) return;
    let oc = document.getElementById('opp-canvas');
    let ox = oc.getContext('2d');
    let sc = 0.75;
    oc.width = Math.round(CANVAS_W * sc);
    oc.height = Math.round(CANVAS_H * sc);
    ox.save();
    ox.scale(sc, sc);

    // Background
    ox.fillStyle = '#0a0e16';
    ox.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Entry zones
    for (let ei = 0; ei < ENTRY_ROWS.length; ei++) {
        ox.fillStyle = '#061810';
        ox.fillRect(0, ENTRY_ROWS[ei] * CS, CS, CS);
    }
    // Exit zones
    let outX = GX + GRID * CS;
    for (let xi = 0; xi < EXIT_ROWS.length; xi++) {
        ox.fillStyle = '#180808';
        ox.fillRect(outX, EXIT_ROWS[xi] * CS, CS, CS);
    }

    // Grid area
    ox.fillStyle = '#0c1018';
    ox.fillRect(GX, 0, GRID * CS, CANVAS_H);

    // Subtle grid lines
    ox.strokeStyle = '#ffffff06';
    ox.lineWidth = 0.5;
    for (let r = 0; r <= GRID; r++) {
        ox.beginPath(); ox.moveTo(GX, r * CS); ox.lineTo(GX + GRID * CS, r * CS); ox.stroke();
    }
    for (let c = 0; c <= GRID; c++) {
        ox.beginPath(); ox.moveTo(GX + c * CS, 0); ox.lineTo(GX + c * CS, CANVAS_H); ox.stroke();
    }

    // Separators
    ox.strokeStyle = '#00f0ff15';
    ox.lineWidth = 1;
    ox.beginPath(); ox.moveTo(GX, 0); ox.lineTo(GX, CANVAS_H); ox.stroke();
    ox.beginPath(); ox.moveTo(outX, 0); ox.lineTo(outX, CANVAS_H); ox.stroke();

    // IN / OUT labels
    ox.fillStyle = '#00ff88';
    ox.font = '600 9px "JetBrains Mono", monospace';
    ox.textAlign = 'center'; ox.textBaseline = 'middle';
    for (let gi = 0; gi < ENTRY_GROUPS.length; gi++) {
        let g = ENTRY_GROUPS[gi];
        let cy = (g[0] + g[g.length - 1]) / 2 * CS + CS / 2;
        ox.fillText('IN', CS / 2, cy);
    }
    ox.fillStyle = '#ff0066';
    ox.font = '600 9px "JetBrains Mono", monospace';
    for (let egi = 0; egi < EXIT_GROUPS.length; egi++) {
        let eg = EXIT_GROUPS[egi];
        let ecy = (eg[0] + eg[eg.length - 1]) / 2 * CS + CS / 2;
        ox.fillText('OUT', outX + CS / 2, ecy);
    }

    // Towers (skip grenade index 7)
    for (let ti = 0; ti < oppBoardData.towers.length; ti++) {
        let tw = oppBoardData.towers[ti];
        let tc = OPP_TOWER_COLORS[tw.i];
        if (!tc) continue; // skip grenade
        ox.fillStyle = tc;
        ox.fillRect(GX + tw.c * CS + 2, tw.r * CS + 2, CS - 4, CS - 4);
    }

    // Enemies
    for (let eii = 0; eii < oppBoardData.enemies.length; eii++) {
        let en = oppBoardData.enemies[eii];
        let et = ENEMY_TYPES[en.t];
        ox.fillStyle = et ? et.color : '#ff0000';
        ox.beginPath();
        ox.arc(GX + en.gx * CS, en.gy * CS, CS * 0.3 * (en.s || 1), 0, Math.PI * 2);
        ox.fill();
    }

    ox.restore();
}

// === EMOTES ===
function sendEmote(id) {
    if (!isDuel || duelEnded) return;
    let now = Date.now();
    // Rate limit: max 3 emotes per 10s
    _emoteSendTimes = _emoteSendTimes.filter(function(t) { return now - t < 10000; });
    if (_emoteSendTimes.length >= 3) return;
    _emoteSendTimes.push(now);
    if (conn && conn.open) conn.send({ type: 'emote', id: id });
    showEmotePopup(EMOTES[id], true);
}

function showEmotePopup(emoji, isMine) {
    if (_emoteMuted) return;
    let el = document.getElementById('emote-display');
    if (!el) return;
    let span = document.createElement('span');
    span.className = 'emote-pop ' + (isMine ? 'mine' : 'enemy');
    span.textContent = emoji;
    el.appendChild(span);
    setTimeout(function() { if (span.parentNode) span.parentNode.removeChild(span); }, 2500);
}

function toggleEmoteMute() {
    _emoteMuted = !_emoteMuted;
    let btn = document.getElementById('emote-mute-btn');
    if (btn) {
        btn.classList.toggle('muted', _emoteMuted);
        btn.textContent = _emoteMuted ? '\u{1F507}' : '\u{1F508}';
    }
    let bar = document.getElementById('emote-bar');
    if (bar) {
        let btns = bar.querySelectorAll('.emote-btn');
        for (let i = 0; i < btns.length; i++) btns[i].style.display = _emoteMuted ? 'none' : '';
    }
    let ed = document.getElementById('emote-display');
    if (ed) ed.innerHTML = '';
}

// === MULTI CHAT ===
function sendMultiChat(source) {
    let inputId = source === 'host' ? 'multi-chat-input-host' : 'multi-chat-input-lobby';
    let input = document.getElementById(inputId);
    let text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    let myName = getMultiName();
    let msg = { type: 'multi_chat', name: myName, text: text };
    if (isHost) {
        multiConns.forEach(function(c) { if (c.open) c.send(msg); });
        appendChatMsg('host', myName, text);
    } else {
        if (conn && conn.open) conn.send(msg);
        appendChatMsg('lobby', myName, text);
    }
}

function appendChatMsg(target, name, text) {
    let msgsId = target === 'host' ? 'multi-chat-msgs-host' : 'multi-chat-msgs-lobby';
    let el = document.getElementById(msgsId);
    if (!el) return;
    let div = document.createElement('div');
    div.style.cssText = 'font-size:9px;padding:2px 0;color:#607888;word-break:break-word';
    div.innerHTML = '<span style="color:#00f0ff;font-weight:700">' + escapeHtml(name) + '</span> ' + escapeHtml(text);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
}

// === LEADERBOARD ===
let currentLbType = 'elo';

function showLeaderboard() {
    document.getElementById('lb-overlay').style.display = 'flex';
    loadLeaderboard('elo');
}

function hideLeaderboard() {
    document.getElementById('lb-overlay').style.display = 'none';
}

async function loadLeaderboard(type) {
    currentLbType = type;
    // Update active tab
    document.querySelectorAll('.lb-tab').forEach(function(t) { t.classList.remove('active'); });
    let tabs = document.querySelectorAll('.lb-tab');
    if (type === 'elo') tabs[0].classList.add('active');
    else if (type === 'solo') tabs[1].classList.add('active');
    else tabs[2].classList.add('active');

    let listEl = document.getElementById('lb-list');
    let loadEl = document.getElementById('lb-loading');
    listEl.innerHTML = '';
    loadEl.style.display = '';

    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/solo/leaderboard?type=' + type);
        let data = await r.json();
        loadEl.style.display = 'none';

        if (!data.length) {
            listEl.innerHTML = '<div style="color:#405060;font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:20px 0">No data yet</div>';
            return;
        }

        listEl.innerHTML = data.map(function(u, i) {
            let rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            let val = '';
            if (type === 'elo') val = '<span class="lb-val" style="color:' + (i === 0 ? '#ffaa00' : '#ff0066') + '">' + u.elo + '</span><span style="color:#405060;font-size:9px;margin-left:6px">' + u.gamesPlayed + 'G</span>';
            else if (type === 'solo') val = '<span class="lb-val" style="color:#00ff88">' + u.bestScore + '</span><span style="color:#405060;font-size:9px;margin-left:6px">W' + u.bestWave + '</span>';
            else val = '<span class="lb-val">' + u.gamesPlayed + '</span><span style="color:#405060;font-size:9px;margin-left:6px">' + (u.gamesWon || 0) + 'W</span>';
            return '<div class="lb-row"><span class="lb-rank ' + rankClass + '">' + (i + 1) + '</span><span class="lb-name">' + u.username + '</span>' + val + '</div>';
        }).join('');
    } catch (err) {
        loadEl.style.display = 'none';
        listEl.innerHTML = '<div style="color:#ff0066;font-size:9px;padding:20px 0">Failed to load</div>';
    }
}

// === SOLO END OVERLAY (save score without account) ===
let _pendingWave = 0;
let _pendingScore = 0;

function showSoloEndOverlay() {
    _pendingWave = waveNum;
    _pendingScore = finalScore();
    document.getElementById('solo-end-score').textContent = _pendingScore;
    document.getElementById('solo-end-error').textContent = '';
    document.getElementById('solo-guest-name').value = '';
    document.getElementById('solo-login-email').value = '';
    document.getElementById('solo-login-pass').value = '';
    document.getElementById('solo-end-overlay').style.display = 'flex';
}

function hideSoloEndOverlay() {
    document.getElementById('solo-end-overlay').style.display = 'none';
}

async function saveSoloGuest() {
    let name = document.getElementById('solo-guest-name').value.trim();
    let errEl = document.getElementById('solo-end-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Enter a pseudo'; return; }
    if (name.length < 3 || name.length > 20) { errEl.textContent = 'Name must be 3-20 characters'; return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { errEl.textContent = 'Letters, numbers, _ and - only'; return; }
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/solo/guest-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guestName: name, bestWave: _pendingWave, bestScore: _pendingScore })
        });
        let data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error'; return; }
        hideSoloEndOverlay();
    } catch (e) {
        errEl.textContent = 'Server unreachable';
    }
}

async function saveSoloLogin() {
    let loginVal = document.getElementById('solo-login-email').value.trim();
    let pass = document.getElementById('solo-login-pass').value;
    let errEl = document.getElementById('solo-end-error');
    errEl.textContent = '';
    if (!loginVal || !pass) { errEl.textContent = 'Login and password required'; return; }
    try {
        let r = await fetchWithTimeout(SERVER_URL + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginVal, password: pass })
        });
        let data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error'; return; }
        authToken = data.token;
        localStorage.setItem('tdpro_token', authToken);
        currentUser = data.user;
        updateProfileBtn();
        // Save the pending score
        await fetchWithTimeout(SERVER_URL + '/api/solo/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
            body: JSON.stringify({ bestWave: _pendingWave, bestScore: _pendingScore })
        });
        hideSoloEndOverlay();
    } catch (e) {
        errEl.textContent = 'Server unreachable';
    }
}
