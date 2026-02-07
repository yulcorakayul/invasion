// === CONFIG ===
const GRID = 20;

// Measure bar overhead with canvas hidden, then compute CS to fit viewport
let CS = (function() {
    const c = document.getElementById('game');
    c.style.display = 'none';
    const wb = document.getElementById('wb-waves');
    const tmp = document.createElement('div');
    tmp.className = 'wc';
    tmp.innerHTML = '<span class="wn">1/20</span><span class="wt">Norm</span><span class="wc-hp">5x 60hp</span>';
    wb.appendChild(tmp);
    const barsH = document.getElementById('wrap').offsetHeight;
    wb.removeChild(tmp);
    c.style.display = '';
    return Math.max(18, Math.min(28, Math.floor((window.innerHeight - barsH - 10) / GRID)));
})();

let GX = CS;
let CANVAS_W = (GRID + 2) * CS;
let CANVAS_H = GRID * CS;

const ENTRY_ROWS = [8, 9, 10, 11, 12];
const ENTRY_COL = 0;
const EXIT_COL = GRID - 1;

const TOWER_TYPES = [
    {
        name: 'Canon', desc: 'Tourelle polyvalente, tir rapide.', bg: '#0a1020',
        levels: [null,
            { cost: 15, damage: 10, range: 3,   fireRate: 0.8,  color: '#5cf' },
            { cost: 20, damage: 16, range: 3.2, fireRate: 0.7,  color: '#5df' },
            { cost: 30, damage: 24, range: 3.5, fireRate: 0.6,  color: '#6ef' },
            { cost: 45, damage: 34, range: 3.8, fireRate: 0.5,  color: '#7ff' },
            { cost: 65, damage: 48, range: 4,   fireRate: 0.4,  color: '#8ff' },
        ],
    },
    {
        name: 'Sniper', desc: 'Longue portee, degats eleves, tir lent.', bg: '#100a08',
        levels: [null,
            { cost: 25, damage: 35,  range: 6,   fireRate: 1.8, color: '#f90' },
            { cost: 35, damage: 55,  range: 6.5, fireRate: 1.6, color: '#fa0' },
            { cost: 50, damage: 80,  range: 7,   fireRate: 1.4, color: '#fb0' },
            { cost: 70, damage: 110, range: 7.5, fireRate: 1.2, color: '#fc0' },
            { cost: 100,damage: 150, range: 8,   fireRate: 1.0, color: '#fd0' },
        ],
    },
    {
        name: 'Gel', desc: 'Ralentit les ennemis touches.', bg: '#081018', slow: true,
        levels: [null,
            { cost: 10, damage: 2,  range: 2.5, fireRate: 0.5,  color: '#0cf', slowFactor: 0.5,  slowDur: 1.5 },
            { cost: 15, damage: 4,  range: 2.8, fireRate: 0.45, color: '#0df', slowFactor: 0.45, slowDur: 1.8 },
            { cost: 25, damage: 6,  range: 3,   fireRate: 0.4,  color: '#0ef', slowFactor: 0.4,  slowDur: 2.0 },
            { cost: 35, damage: 9,  range: 3.3, fireRate: 0.35, color: '#0ff', slowFactor: 0.35, slowDur: 2.3 },
            { cost: 50, damage: 12, range: 3.5, fireRate: 0.3,  color: '#2ff', slowFactor: 0.3,  slowDur: 2.5 },
        ],
    },
    {
        name: 'Splash', desc: 'Degats de zone, longue portee.', bg: '#140810', splash: true,
        levels: [null,
            { cost: 20, damage: 8,  range: 5,   fireRate: 1.2, color: '#f66', splashR: 1.5 },
            { cost: 30, damage: 14, range: 5.5, fireRate: 1.1, color: '#f77', splashR: 1.8 },
            { cost: 45, damage: 22, range: 6,   fireRate: 1.0, color: '#f88', splashR: 2.0 },
            { cost: 65, damage: 32, range: 6.5, fireRate: 0.9, color: '#f99', splashR: 2.2 },
            { cost: 90, damage: 45, range: 7,   fireRate: 0.8, color: '#faa', splashR: 2.5 },
        ],
    },
    {
        name: 'Exorciste', desc: 'Tres puissant, cible uniquement les fantomes.', bg: '#0c0a18', ghostOnly: true,
        levels: [null,
            { cost: 20, damage: 40,  range: 3.5, fireRate: 1.0, color: '#af0' },
            { cost: 30, damage: 65,  range: 4,   fireRate: 0.9, color: '#bf0' },
            { cost: 45, damage: 95,  range: 4.5, fireRate: 0.8, color: '#cf0' },
            { cost: 65, damage: 130, range: 5,   fireRate: 0.7, color: '#df0' },
            { cost: 90, damage: 180, range: 5.5, fireRate: 0.6, color: '#ef0' },
        ],
    },
    {
        name: 'Tesla', desc: 'Aura electrique, touche tous les ennemis proches.', bg: '#101008', aura: true,
        levels: [null,
            { cost: 15, damage: 5,  range: 1.5, fireRate: 0.3,  color: '#ff0' },
            { cost: 25, damage: 9,  range: 1.8, fireRate: 0.28, color: '#ff2' },
            { cost: 35, damage: 14, range: 2.0, fireRate: 0.25, color: '#ff4' },
            { cost: 50, damage: 20, range: 2.2, fireRate: 0.22, color: '#ff6' },
            { cost: 70, damage: 28, range: 2.5, fireRate: 0.2,  color: '#ff8' },
        ],
    },
];

const ENEMY_TYPES = {
    normal:   { speed: 1.8, color: '#d33', stroke: '#f66', reward: 8,  label: 'Normal', pts: 1 },
    ghost:    { speed: 2.0, color: '#88f', stroke: '#aaf', reward: 10, label: 'Fantome', ghost: true, pts: 2 },
    boss:     { speed: 1.0, color: '#a40', stroke: '#c62', reward: 30, label: 'Boss', scale: 1.6, pts: 5 },
    splitter: { speed: 2.2, color: '#4d4', stroke: '#6f6', reward: 5,  label: 'Division', splits: 2, splitHpRatio: 0.4, pts: 1 },
};

const WAVES = [
    { count: 5,  hp: 60,   type: 'normal' },
    { count: 6,  hp: 80,   type: 'normal' },
    { count: 4,  hp: 50,   type: 'ghost' },
    { count: 7,  hp: 100,  type: 'normal' },
    { count: 2,  hp: 600,  type: 'boss' },
    { count: 8,  hp: 70,   type: 'splitter' },
    { count: 8,  hp: 130,  type: 'normal' },
    { count: 6,  hp: 90,   type: 'ghost' },
    { count: 9,  hp: 110,  type: 'splitter' },
    { count: 3,  hp: 1000, type: 'boss' },
    { count: 10, hp: 170,  type: 'normal' },
    { count: 7,  hp: 130,  type: 'ghost' },
    { count: 10, hp: 150,  type: 'splitter' },
    { count: 11, hp: 220,  type: 'normal' },
    { count: 4,  hp: 1800, type: 'boss' },
    { count: 8,  hp: 200,  type: 'ghost' },
    { count: 12, hp: 280,  type: 'normal' },
    { count: 10, hp: 200,  type: 'splitter' },
    { count: 9,  hp: 250,  type: 'ghost' },
    { count: 5,  hp: 3000, type: 'boss' },
];
const SPAWN_INT = 0.7;

// === STATE ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

let grid = [];
let towers = [];
let enemies = [];
let projectiles = [];
let gold = 100;
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
let waveDuration = 0;

function spawnGoldText(x, y, amount) {
    floatingTexts.push({ x, y, text: '+' + amount + 'g', life: 0.8, maxLife: 0.8 });
}

function killEnemy(e) {
    e.alive = false;
    gold += e.reward;
    score += (ENEMY_TYPES[e.typeName] || {}).pts || 1;
    spawnGoldText(e.x, e.y, e.reward);
    updateUI();
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
    if (!ghost && grid[startR][startC] !== 0) return null;
    const vis = Array.from({ length: GRID }, () => Array(GRID).fill(false));
    const par = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const q = [[startR, startC]];
    vis[startR][startC] = true;
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
    while (q.length) {
        const [r, c] = q.shift();
        if (c === endC && ENTRY_ROWS.includes(r)) {
            const path = [];
            let cur = [r, c];
            while (cur) { path.unshift(cur); cur = par[cur[0]][cur[1]]; }
            return path;
        }
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !vis[nr][nc] && (ghost || grid[nr][nc] === 0)) {
                vis[nr][nc] = true;
                par[nr][nc] = [r, c];
                q.push([nr, nc]);
            }
        }
    }
    return null;
}

function pathExists(testGrid) {
    const old = grid;
    grid = testGrid;
    let found = false;
    for (const row of ENTRY_ROWS) {
        if (findPath(row, ENTRY_COL, EXIT_COL)) { found = true; break; }
    }
    grid = old;
    return found;
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
    }
    get typeDef() { return TOWER_TYPES[this.type]; }
    get stats() { return this.typeDef.levels[this.level]; }

    upgrade() {
        const lvls = this.typeDef.levels;
        if (this.level >= lvls.length - 1) return false;
        const next = lvls[this.level + 1];
        if (gold < next.cost) return false;
        gold -= next.cost;
        this.totalCost += next.cost;
        this.level++;
        return true;
    }

    update(dt) {
        const st = this.stats;
        const td = this.typeDef;
        if (this.pulseTimer > 0) this.pulseTimer -= dt;
        this.fireTimer -= dt;
        if (this.fireTimer > 0) return;

        // Aura: damage all in range
        if (td.aura) {
            this.fireTimer = st.fireRate;
            let hit = false;
            for (const e of enemies) {
                if (e.hp <= 0 || !e.alive) continue;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < st.range * CS) {
                    e.hp -= st.damage;
                    hit = true;
                    if (e.hp <= 0) killEnemy(e);
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
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < st.range * CS && d < bestD) { best = e; bestD = d; }
        }
        if (best) {
            this.angle = Math.atan2(best.y - this.y, best.x - this.x);
            const opts = {};
            if (td.splash) { opts.splash = true; opts.splashR = st.splashR; }
            if (td.slow) { opts.slowFactor = st.slowFactor; opts.slowDur = st.slowDur; }
            projectiles.push(new Projectile(this.x, this.y, best, st.damage, st.color, opts));
            this.fireTimer = st.fireRate;
        }
    }

    draw() {
        const { x, y, level, type } = this;
        const st = this.stats;
        const td = this.typeDef;
        const bx = GX + this.col * CS, by = this.row * CS;

        ctx.fillStyle = td.bg;
        ctx.fillRect(bx, by, CS, CS);

        switch (type) {
            case 0: this._drawCannon(x, y, st, level); break;
            case 1: this._drawSniper(x, y, st, level); break;
            case 2: this._drawGel(x, y, st, level); break;
            case 3: this._drawSplash(x, y, st, level); break;
            case 4: this._drawExorciste(x, y, st, level); break;
            case 5: this._drawTesla(x, y, st, level); break;
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
            ctx.beginPath();
            ctx.arc(x, y, st.range * CS, 0, Math.PI * 2);
            ctx.strokeStyle = '#00f0ff30';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 1;
            ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 6;
            ctx.strokeRect(bx + 1, by + 1, CS - 2, CS - 2);
            ctx.shadowBlur = 0;
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
        const spd = this.baseSpeed * (this.slowTimer > 0 ? this.slowMult : 1);
        if (this.wpIdx >= this.waypoints.length) {
            this.alive = false;
            lives--;
            updateUI();
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
        if (this.ghost) ctx.globalAlpha = 0.65;

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

        if (this.ghost) ctx.globalAlpha = 1;

        // slow ring
        if (this.slowTimer > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#0cf';
            ctx.lineWidth = 1.5;
            ctx.stroke();
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
            this.target.hp -= this.damage;
            if (this.slowFactor) {
                this.target.slowTimer = this.slowDur;
                this.target.slowMult = this.slowFactor;
            }
            if (this.target.hp <= 0) killEnemy(this.target);
            if (this.splash) {
                for (const e of enemies) {
                    if (e === this.target || e.hp <= 0 || !e.alive) continue;
                    const d = Math.hypot(e.x - this.target.x, e.y - this.target.y);
                    if (d < this.splashR * CS) {
                        e.hp -= Math.floor(this.damage * 0.5);
                        if (this.slowFactor) { e.slowTimer = this.slowDur; e.slowMult = this.slowFactor; }
                        if (e.hp <= 0) killEnemy(e);
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
        wtEl.textContent = '(' + ENEMY_TYPES[WAVES[waveNum - 1].type].label + ')';
    } else if (waveNum < WAVES.length) {
        wtEl.textContent = '\u2192 ' + ENEMY_TYPES[WAVES[waveNum].type].label;
    } else {
        wtEl.textContent = '';
    }

    document.getElementById('enemies-left').textContent = enemies.filter(e => e.alive).length + enemiesToSpawn;
    document.getElementById('score').textContent = score;
    for (let i = 0; i < TOWER_TYPES.length; i++) {
        const btn = document.getElementById('tbtn-' + i);
        if (btn) btn.disabled = gold < TOWER_TYPES[i].levels[1].cost && placingType !== i;
    }

    const infoDesc = document.getElementById('info-desc');
    const infoTower = document.getElementById('info-tower');
    if (selectedTower) {
        infoDesc.style.display = 'none';
        infoTower.style.display = 'flex';
        const st = selectedTower.stats;
        document.getElementById('tow-name').textContent = selectedTower.typeDef.name;
        document.getElementById('tow-level').textContent = selectedTower.level;
        document.getElementById('tow-damage').textContent = st.damage;
        document.getElementById('tow-range').textContent = st.range;
        document.getElementById('tow-rate').textContent = st.fireRate.toFixed(2) + 's';
        const btn = document.getElementById('up-btn');
        const lvls = selectedTower.typeDef.levels;
        if (selectedTower.level >= lvls.length - 1) {
            btn.textContent = 'MAX';
            btn.disabled = true;
        } else {
            const c = lvls[selectedTower.level + 1].cost;
            btn.textContent = 'Niv.' + (selectedTower.level + 1) + ' (' + c + 'g)';
            btn.disabled = gold < c;
        }
        const refund = Math.floor(selectedTower.totalCost * 0.6);
        document.getElementById('sell-btn').textContent = 'Vendre (' + refund + 'g)';
    } else if (placingType >= 0) {
        infoTower.style.display = 'none';
        infoDesc.style.display = 'flex';
        const tt = TOWER_TYPES[placingType];
        const lv1 = tt.levels[1];
        document.getElementById('sel-name').textContent = tt.name;
        document.getElementById('sel-desc').textContent = tt.desc;
        document.getElementById('desc-damage').textContent = lv1.damage;
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
    if (selectedTower.upgrade()) { showMessage('Ameliore !'); updateUI(); }
    else showMessage('Pas assez d\'or');
}

function sellSelected() {
    if (!selectedTower) return;
    const { row, col } = selectedTower;
    grid[row][col] = 0;
    towers = towers.filter(t => t !== selectedTower);
    const refund = Math.floor(selectedTower.totalCost * 0.6);
    gold += refund;
    selectedTower = null;
    updateUI();
    showMessage('Vendu +' + refund + 'g');
    for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); }
}

function getValidEntryRows() {
    return ENTRY_ROWS.filter(r => findPath(r, ENTRY_COL, EXIT_COL));
}

function startWave() {
    if (waveActive && enemiesToSpawn > 0) return;
    if (waveNum >= WAVES.length) return;
    nextWaveTimer = 0;
    if (getValidEntryRows().length === 0) { showMessage('Chemin bloque !'); return; }
    waveNum++;
    waveActive = true;
    const w = WAVES[waveNum - 1];
    enemiesToSpawn = w.count;
    spawnTimer = 0;
    // Timer = durée totale de la vague (spawns + traversée)
    const spd = ENEMY_TYPES[w.type].speed;
    waveDuration = (w.count - 1) * SPAWN_INT + 21 / spd;
    nextWaveTimer = waveDuration;
    showMessage('Vague ' + waveNum + ' lancee');
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
    if (grid[row][col] !== 0) { showMessage('Occupe'); return; }
    if (gold < cost) { showMessage('Pas assez d\'or'); return; }
    const test = grid.map(r => [...r]);
    test[row][col] = 1;
    if (!pathExists(test)) { showMessage('Chemin bloque'); return; }
    grid[row][col] = 1;
    towers.push(new Tower(row, col, placingType));
    gold -= cost;
    updateUI();
    for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!hoveredCell) return;
    const { row, col } = hoveredCell;
    const tower = getTowerAt(row, col);
    if (!tower) return;
    grid[row][col] = 0;
    towers = towers.filter(t => t !== tower);
    const refund = Math.floor(tower.totalCost * 0.6);
    gold += refund;
    if (selectedTower === tower) selectedTower = null;
    updateUI();
    showMessage('Vendu +' + refund + 'g');
    for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); }
});

// === DRAW ===
function drawScene() {
    // Background (exterior)
    ctx.fillStyle = '#030308';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // IN zone
    for (const row of ENTRY_ROWS) {
        ctx.fillStyle = '#061810';
        ctx.fillRect(0, row * CS, CS, CS);
    }
    ctx.fillStyle = '#00ff88';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 8;
    ctx.fillText('IN', CS / 2, ENTRY_ROWS[2] * CS + CS / 2);
    ctx.shadowBlur = 0;

    // OUT zone
    const outX = GX + GRID * CS;
    for (const row of ENTRY_ROWS) {
        ctx.fillStyle = '#180808';
        ctx.fillRect(outX, row * CS, CS, CS);
    }
    ctx.fillStyle = '#ff0066';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.shadowColor = '#ff0066'; ctx.shadowBlur = 8;
    ctx.fillText('OUT', outX + CS / 2, ENTRY_ROWS[2] * CS + CS / 2);
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
        const ok = grid[hoveredCell.row][hoveredCell.col] === 0 && gold >= tt.cost;
        ctx.fillStyle = ok ? '#00ff8818' : '#ff006618';
        ctx.fillRect(hx, hy, CS, CS);
        ctx.strokeStyle = ok ? '#00ff88' : '#ff0066';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx + 1, hy + 1, CS - 2, CS - 2);
        if (ok) {
            ctx.beginPath();
            ctx.arc(hx + CS / 2, hy + CS / 2, tt.range * CS, 0, Math.PI * 2);
            ctx.strokeStyle = '#00f0ff30';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

}

// === GAME LOOP ===
let lastTime = 0;

function gameLoop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    if (waveActive && enemiesToSpawn > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            const waveData = WAVES[waveNum - 1];
            const et = ENEMY_TYPES[waveData.type];
            // Ghost enemies don't need valid entry rows (they pass through)
            let spawnRow;
            if (et.ghost) {
                spawnRow = ENTRY_ROWS[Math.floor(Math.random() * ENTRY_ROWS.length)];
            } else {
                const valid = getValidEntryRows();
                if (valid.length === 0) { enemiesToSpawn = 0; }
                else spawnRow = valid[Math.floor(Math.random() * valid.length)];
            }
            if (spawnRow !== undefined) {
                enemies.push(new Enemy(spawnRow, waveData.hp, waveData.type));
                enemiesToSpawn--;
                spawnTimer = SPAWN_INT;
                updateUI();
            }
        }
    }

    for (const t of towers) t.update(dt);
    for (const e of enemies) e.update(dt);
    for (const p of projectiles) p.update(dt);

    // Handle splitter deaths
    const newEnemies = [];
    for (const e of enemies) {
        if (!e.alive && e.canSplit && e.splits > 0) {
            for (let i = 0; i < e.splits; i++) {
                const childHp = Math.floor(e.maxHp * e.splitHpRatio);
                const offset = (i === 0 ? -1 : 1) * CS * 0.3;
                newEnemies.push(new Enemy(0, childHp, e.typeName, { x: e.x, y: e.y + offset }));
            }
        }
    }
    enemies = enemies.filter(e => e.alive);
    enemies.push(...newEnemies);
    projectiles = projectiles.filter(p => p.alive);

    if (waveActive && enemiesToSpawn === 0 && enemies.length === 0) {
        waveActive = false;
        if (waveNum >= WAVES.length) {
            if (lives > 0) showMessage('Victoire !');
        } else {
            if (lives > 0) showMessage('Vague ' + waveNum + ' terminee');
        }
        updateUI();
    }

    if (nextWaveTimer > 0) {
        nextWaveTimer -= dt;
        if (nextWaveTimer <= 0) {
            nextWaveTimer = 0;
            if (waveNum < WAVES.length && lives > 0) startWave();
        }
    }

    if (lives <= 0) {
        lives = 0;
        updateUI();
        drawScene();
        for (const t of towers) t.draw();
        for (const e of enemies) e.draw();
        ctx.fillStyle = 'rgba(3,3,8,0.8)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#ff0066';
        ctx.font = '700 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff0066'; ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#506070';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText('SCORE: ' + score, CANVAS_W / 2, CANVAS_H / 2 + 20);
        return;
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

    updateUI();
    drawScene();
    for (const t of towers) t.draw();
    for (const p of projectiles) p.draw();
    for (const e of enemies) e.draw();

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

    requestAnimationFrame(gameLoop);
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
        }
    }
}

// === WAVE BAR ===
const WAVE_LABELS = { normal: 'Normal', ghost: 'Fantome', boss: 'Boss', splitter: 'Division' };
const WAVE_SHORT = { normal: 'Norm', ghost: 'Fant', boss: 'Boss', splitter: 'Div' };
const WAVE_BG = { normal: '#3a1828', ghost: '#281840', boss: '#3a2010', splitter: '#183a20' };
const WAVE_BG_ACTIVE = { normal: '#602040', ghost: '#402060', boss: '#604020', splitter: '#206040' };

let _wbBuilt = false;
const _wbEls = [];
let _wbCellW = 0;
let _wbInner = null;

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
        el.style.background = WAVE_BG[w.type];
        const nSpan = document.createElement('span'); nSpan.className = 'wn';
        nSpan.textContent = (i + 1) + '/' + WAVES.length;
        const tSpan = document.createElement('span'); tSpan.className = 'wt';
        tSpan.textContent = WAVE_SHORT[w.type];
        const hpSpan = document.createElement('span'); hpSpan.className = 'wc-hp';
        hpSpan.textContent = w.count + 'x ' + w.hp + 'hp';
        el.appendChild(nSpan); el.appendChild(tSpan); el.appendChild(hpSpan);
        el.title = 'Vague ' + (i + 1) + ' — ' + w.count + 'x ' + WAVE_LABELS[w.type] + ' (HP: ' + w.hp + ')';
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
        const isActive = i === waveNum - 1 && waveActive;
        const isDone = waveActive ? i < waveNum - 1 : i < waveNum;
        item.el.style.background = isActive ? WAVE_BG_ACTIVE[w.type] : WAVE_BG[w.type];
        item.el.style.opacity = isDone ? '0.5' : '1';
        if (isActive) {
            item.el.classList.add('active');
            item.hpSpan.textContent = alive + '/' + w.count + ' restants';
        } else {
            item.el.classList.remove('active');
            item.hpSpan.textContent = w.count + 'x ' + w.hp + 'hp';
        }
    }

    const allDead = !waveActive && alive === 0;
    const canLaunch = allDead && waveNum < WAVES.length && lives > 0;
    goBtn.disabled = !canLaunch;
    if (waveNum >= WAVES.length && allDead) {
        goBtn.textContent = 'GG';
        goBtn.disabled = true;
    } else if (allDead && waveNum < WAVES.length) {
        goBtn.textContent = 'Lancer ' + (waveNum + 1);
    } else if (waveActive || nextWaveTimer > 0) {
        goBtn.textContent = alive + ' restants';
    } else {
        goBtn.textContent = 'Lancer ' + (waveNum + 1);
    }
}

drawTowerIcons();
updateWaveBar();
updateUI();
requestAnimationFrame(gameLoop);
