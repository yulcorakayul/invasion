// === CONFIG ===
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
const EXIT_ROWS = [8, 9, 10, 11, 12];
const ENTRY_COL = 0;
const EXIT_COL = GRID - 1;

function setEntryGroups(groups) {
    ENTRY_GROUPS.splice(0, ENTRY_GROUPS.length, ...groups);
    ENTRY_GROUP_WEIGHTS.splice(0, ENTRY_GROUP_WEIGHTS.length, ...groups.map(g => g.length));
    ENTRY_ROWS.splice(0, ENTRY_ROWS.length, ...groups.flat());
}

function pickEntryRow(validRows) {
    const groups = ENTRY_GROUPS.map((g, i) => ({ rows: g.filter(r => validRows.includes(r)), w: ENTRY_GROUP_WEIGHTS[i] })).filter(g => g.rows.length > 0);
    if (groups.length === 0) return undefined;
    let totalW = groups.reduce((s, g) => s + g.w, 0);
    let rng = Math.random() * totalW;
    for (const g of groups) { rng -= g.w; if (rng <= 0) return g.rows[Math.floor(Math.random() * g.rows.length)]; }
    const last = groups[groups.length - 1];
    return last.rows[Math.floor(Math.random() * last.rows.length)];
}

const TOWER_TYPES = [
    // ── Tier 1 (cheap 10-15g) ──
    {
        name: 'Cannon', desc: 'Versatile turret, fast fire rate.', bg: '#0a1020',
        levels: [null,
            { cost: 15, damage: 10, range: 3,   fireRate: 0.8,  color: '#5cf' },
            { cost: 20, damage: 16, range: 3.2, fireRate: 0.7,  color: '#5df' },
            { cost: 30, damage: 24, range: 3.5, fireRate: 0.6,  color: '#6ef' },
            { cost: 45, damage: 34, range: 3.8, fireRate: 0.5,  color: '#7ff' },
            { cost: 65, damage: 48, range: 4,   fireRate: 0.4,  color: '#8ff' },
        ],
    },
    // ── Tier 3 (expensive 30g) ──
    {
        name: 'Sniper', desc: 'Long range, high damage, slow fire.', bg: '#100a08',
        levels: [null,
            { cost: 30, damage: 40,  range: 6,   fireRate: 1.8, color: '#f90' },
            { cost: 40, damage: 65,  range: 6.5, fireRate: 1.6, color: '#fa0' },
            { cost: 55, damage: 95,  range: 7,   fireRate: 1.4, color: '#fb0' },
            { cost: 75, damage: 130, range: 7.5, fireRate: 1.2, color: '#fc0' },
            { cost: 100,damage: 175, range: 8,   fireRate: 1.0, color: '#fd0' },
        ],
    },
    // ── Tier 1 (cheap 10g) ──
    {
        name: 'Freeze', desc: 'Slows down hit enemies.', bg: '#081018', slow: true,
        levels: [null,
            { cost: 10, damage: 2,  range: 2.5, fireRate: 0.5,  color: '#0cf', slowFactor: 0.5,  slowDur: 1.5 },
            { cost: 15, damage: 4,  range: 2.8, fireRate: 0.45, color: '#0df', slowFactor: 0.45, slowDur: 1.8 },
            { cost: 25, damage: 6,  range: 3,   fireRate: 0.4,  color: '#0ef', slowFactor: 0.4,  slowDur: 2.0 },
            { cost: 35, damage: 9,  range: 3.3, fireRate: 0.35, color: '#0ff', slowFactor: 0.35, slowDur: 2.3 },
            { cost: 50, damage: 12, range: 3.5, fireRate: 0.3,  color: '#2ff', slowFactor: 0.3,  slowDur: 2.5 },
        ],
    },
    // ── Tier 2 (mid 25g) ──
    {
        name: 'Splash', desc: 'Area damage, long range.', bg: '#140810', splash: true,
        levels: [null,
            { cost: 25, damage: 8,  range: 5,   fireRate: 1.2, color: '#f66', splashR: 1.5 },
            { cost: 35, damage: 15, range: 5.5, fireRate: 1.1, color: '#f77', splashR: 1.8 },
            { cost: 50, damage: 24, range: 6,   fireRate: 1.0, color: '#f88', splashR: 2.0 },
            { cost: 70, damage: 35, range: 6.5, fireRate: 0.9, color: '#f99', splashR: 2.2 },
            { cost: 95, damage: 50, range: 7,   fireRate: 0.8, color: '#faa', splashR: 2.5 },
        ],
    },
    // ── Tier 2 (mid 25g, ghost only) ──
    {
        name: 'Exorcist', desc: 'Very powerful, targets ghosts only.', bg: '#0c0a18', ghostOnly: true,
        levels: [null,
            { cost: 25, damage: 45,  range: 3.5, fireRate: 1.0, color: '#af0' },
            { cost: 35, damage: 70,  range: 4,   fireRate: 0.9, color: '#bf0' },
            { cost: 50, damage: 100, range: 4.5, fireRate: 0.8, color: '#cf0' },
            { cost: 70, damage: 140, range: 5,   fireRate: 0.7, color: '#df0' },
            { cost: 95, damage: 190, range: 5.5, fireRate: 0.6, color: '#ef0' },
        ],
    },
    // ── Tier 2 (mid 20g) ──
    {
        name: 'Tesla', desc: 'Electric aura, hits all nearby enemies.', bg: '#101008', aura: true,
        levels: [null,
            { cost: 20, damage: 5,  range: 1.5, fireRate: 0.3,  color: '#ff0' },
            { cost: 30, damage: 9,  range: 1.8, fireRate: 0.28, color: '#ff2' },
            { cost: 45, damage: 14, range: 2.0, fireRate: 0.25, color: '#ff4' },
            { cost: 60, damage: 20, range: 2.2, fireRate: 0.22, color: '#ff6' },
            { cost: 80, damage: 28, range: 2.5, fireRate: 0.2,  color: '#ff8' },
        ],
    },
    // ── Tier 2 (mid 20g, support) ──
    {
        name: 'Booster', desc: 'Boosts adjacent towers.', bg: '#101810', booster: true,
        levels: [null,
            { cost: 20, damage: 0, range: 1.5, fireRate: 1, color: '#0f8', boostPct: 0.25 },
            { cost: 25, damage: 0, range: 1.5, fireRate: 1, color: '#0fa', boostPct: 0.35 },
            { cost: 35, damage: 0, range: 1.5, fireRate: 1, color: '#0fc', boostPct: 0.45 },
            { cost: 50, damage: 0, range: 1.5, fireRate: 1, color: '#2ff', boostPct: 0.55 },
            { cost: 70, damage: 0, range: 1.5, fireRate: 1, color: '#4ff', boostPct: 0.65 },
        ],
    },
    // ── Tier 1 (cheap 12g, one-shot) ──
    {
        name: 'Grenade', desc: 'Single explosion, then self-destructs.', bg: '#181008', grenade: true,
        levels: [null,
            { cost: 12, damage: 80,  range: 2.5, fireRate: 1, color: '#f80', splashR: 2.5 },
            { cost: 18, damage: 130, range: 3,   fireRate: 1, color: '#f90', splashR: 3 },
            { cost: 28, damage: 200, range: 3.5, fireRate: 1, color: '#fa0', splashR: 3.5 },
            { cost: 40, damage: 300, range: 4,   fireRate: 1, color: '#fb0', splashR: 4 },
            { cost: 55, damage: 450, range: 4.5, fireRate: 1, color: '#fc0', splashR: 4.5 },
        ],
    },
    // ── Tier 3 (expensive 30g) ──
    {
        name: 'Laser', desc: 'Beam across 3 tiles in a line.', bg: '#100818', laser: true,
        levels: [null,
            { cost: 30, damage: 18, range: 3, fireRate: 1.2, color: '#f0f' },
            { cost: 40, damage: 30, range: 3, fireRate: 1.0, color: '#f2f' },
            { cost: 55, damage: 45, range: 3, fireRate: 0.8, color: '#f4f' },
            { cost: 75, damage: 65, range: 3, fireRate: 0.6, color: '#f6f' },
            { cost: 100,damage: 90, range: 3, fireRate: 0.5, color: '#f8f' },
        ],
    },
];

const ENEMY_TYPES = {
    normal:   { speed: 1.8, color: '#d33', stroke: '#f66', reward: 5,  label: 'Normal', pts: 1 },
    ghost:    { speed: 2.0, color: '#88f', stroke: '#aaf', reward: 6, label: 'Ghost', ghost: true, pts: 2 },
    splitter: { speed: 2.2, color: '#4d4', stroke: '#6f6', reward: 4,  label: 'Splitter', splits: 2, splitHpRatio: 0.4, pts: 1 },
    fast:     { speed: 3.5, color: '#ee0', stroke: '#ff8', reward: 4,  label: 'Fast', scale: 0.8, pts: 1 },
    swarm:    { speed: 1.8, color: '#0bb', stroke: '#0ee', reward: 2,  label: 'Swarm', scale: 0.85, spawnInt: 0.15, pts: 1 },
    shield:   { speed: 1.5, color: '#6ae', stroke: '#8cf', reward: 7, label: 'Shield', shield: 10, pts: 2 },
    stealth:  { speed: 2.2, color: '#446', stroke: '#668', reward: 5, label: 'Stealth', stealth: true, scale: 0.85, pts: 2 },
    regen:    { speed: 1.6, color: '#2a4', stroke: '#4e6', reward: 6, label: 'Regen', regenRate: 0.08, pts: 2 },
    boss_normal:   { speed: 0.7, color: '#c40', stroke: '#e62', reward: 20,  label: 'Boss',       scale: 1.7, pts: 5 },
    boss_ghost:    { speed: 0.6, color: '#66c', stroke: '#88e', reward: 22,  label: 'Boss Gho',  scale: 1.6, ghost: true, pts: 6 },
    boss_splitter: { speed: 0.5, color: '#2a2', stroke: '#4e4', reward: 22,  label: 'Boss Spl',   scale: 1.6, splits: 2, splitHpRatio: 0.4, pts: 6 },
    boss_fast:     { speed: 1.5, color: '#cc0', stroke: '#ee2', reward: 22,  label: 'Boss Fst',   scale: 1.4, pts: 6 },
    boss_swarm:    { speed: 0.7, color: '#099', stroke: '#0cc', reward: 15,  label: 'Boss Swm',   scale: 1.6, spawnInt: 0.5, pts: 5 },
    boss_shield:   { speed: 0.5, color: '#68a', stroke: '#8be', reward: 25,  label: 'Boss Shd',   scale: 1.7, shield: 30, pts: 7 },
};

const WAVES = [
    // --- Early (1-10) ---
    { count: 5,  hp: 30,    type: 'normal' },        // 1   totalHP: 150
    { count: 6,  hp: 45,    type: 'normal' },        // 2   totalHP: 270
    { count: 4,  hp: 40,    type: 'ghost' },         // 3   totalHP: 160
    { count: 8,  hp: 30,    type: 'fast' },          // 4   totalHP: 240
    { count: 12, hp: 22,    type: 'swarm' },         // 5   totalHP: 264
    { count: 6,  hp: 55,    type: 'splitter' },      // 6   totalHP: 330+splits
    { count: 5,  hp: 85,    type: 'shield' },        // 7   totalHP: 425
    { count: 8,  hp: 100,   type: 'normal' },        // 8   totalHP: 800
    { count: 2,  hp: 800,   type: 'boss_normal' },   // 9   BOSS  totalHP: 1600
    { count: 10, hp: 50,    type: 'stealth' },        // 10  totalHP: 500
    // --- Mid-early (11-20) ---
    { count: 7,  hp: 130,   type: 'ghost' },         // 11  totalHP: 910
    { count: 20, hp: 70,    type: 'swarm' },         // 12  totalHP: 1400
    { count: 8,  hp: 150,   type: 'splitter' },      // 13  totalHP: 1200+splits
    { count: 8,  hp: 180,   type: 'shield' },        // 14  totalHP: 1440
    { count: 8,  hp: 180,   type: 'regen' },          // 15  totalHP: 1440 (+regen)
    { count: 14, hp: 120,   type: 'fast' },          // 16  totalHP: 1680
    { count: 2,  hp: 2000,  type: 'boss_ghost' },    // 17  BOSS  totalHP: 4000
    { count: 25, hp: 100,   type: 'swarm' },         // 18  totalHP: 2500
    { count: 8,  hp: 220,   type: 'ghost' },         // 19  totalHP: 1760
    { count: 10, hp: 200,   type: 'splitter' },      // 20  totalHP: 2000+splits
    // --- Mid (21-30) ---
    { count: 12, hp: 300,   type: 'normal' },        // 21  totalHP: 3600
    { count: 10, hp: 320,   type: 'shield' },        // 22  totalHP: 3200
    { count: 14, hp: 120,   type: 'stealth' },        // 23  totalHP: 1680
    { count: 28, hp: 150,   type: 'swarm' },         // 24  totalHP: 4200
    { count: 3,  hp: 3500,  type: 'boss_fast' },     // 25  BOSS  totalHP: 10500
    { count: 10, hp: 280,   type: 'splitter' },      // 26  totalHP: 2800+splits
    { count: 10, hp: 350,   type: 'regen' },          // 27  totalHP: 3500 (+regen)
    { count: 14, hp: 400,   type: 'normal' },        // 28  totalHP: 5600
    { count: 12, hp: 380,   type: 'shield' },        // 29  totalHP: 4560
    { count: 30, hp: 200,   type: 'swarm' },         // 30  totalHP: 6000
    // --- Mid-late (31-40) ---
    { count: 18, hp: 280,   type: 'fast' },          // 31  totalHP: 5040
    { count: 12, hp: 400,   type: 'ghost' },         // 32  totalHP: 4800
    { count: 3,  hp: 6000,  type: 'boss_splitter' }, // 33  BOSS  totalHP: 18000+splits
    { count: 12, hp: 400,   type: 'splitter' },      // 34  totalHP: 4800+splits
    { count: 12, hp: 500,   type: 'regen' },          // 35  totalHP: 6000 (+regen)
    { count: 14, hp: 500,   type: 'shield' },        // 36  totalHP: 7000
    { count: 35, hp: 280,   type: 'swarm' },         // 37  totalHP: 9800
    { count: 18, hp: 200,   type: 'stealth' },        // 38  totalHP: 3600
    { count: 14, hp: 480,   type: 'ghost' },         // 39  totalHP: 6720
    { count: 3,  hp: 8500,  type: 'boss_swarm' },    // 40  BOSS  totalHP: 25500
    // --- Late (41-50) ---
    { count: 16, hp: 700,   type: 'normal' },        // 41  totalHP: 11200
    { count: 14, hp: 500,   type: 'splitter' },      // 42  totalHP: 7000+splits
    { count: 16, hp: 650,   type: 'shield' },        // 43  totalHP: 10400
    { count: 38, hp: 380,   type: 'swarm' },         // 44  totalHP: 14440
    { count: 20, hp: 250,   type: 'stealth' },        // 45  totalHP: 5000
    { count: 14, hp: 700,   type: 'regen' },          // 46  totalHP: 9800 (+regen)
    { count: 18, hp: 850,   type: 'normal' },        // 47  totalHP: 15300
    { count: 4,  hp: 14000, type: 'boss_shield' },   // 48  BOSS  totalHP: 56000
    { count: 18, hp: 800,   type: 'shield' },        // 49  totalHP: 14400
    { count: 20, hp: 1000,  type: 'normal' },        // 50  totalHP: 20000
];
const SPAWN_INT = 0.7;

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
let gold = 80;
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

function spawnGoldText(x, y, amount) {
    floatingTexts.push({ x, y, text: '+' + amount + 'g', life: 0.8, maxLife: 0.8 });
}

function killEnemy(e) {
    e.alive = false;
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
    if (!ghost && grid[startR][startC] !== 0) return null;
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
    let allOk = true;
    for (const group of ENTRY_GROUPS) {
        let groupOk = false;
        for (const row of group) {
            if (findPath(row, ENTRY_COL, EXIT_COL)) { groupOk = true; break; }
        }
        if (!groupOk) { allOk = false; break; }
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
            lives--;
            playSfx('hit');
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
        if (this.stealth) {
            const flicker = 0.15 + 0.15 * Math.sin(performance.now() * 0.008);
            ctx.globalAlpha = flicker;
        }
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
        if (selectedTower.typeDef.booster) {
            document.getElementById('tow-damage').textContent = '+' + Math.round(st.boostPct * 100) + '%';
        } else {
            var boostMul = selectedTower.getBoostMultiplier();
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
        const refund = Math.floor(selectedTower.totalCost * 0.6);
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
    const refund = Math.floor(selectedTower.totalCost * 0.6);
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
    nextWaveTimer = 0;
    waveDuration = 0;
    if (getValidEntryRows().length === 0) { showMessage('Path blocked!'); return; }
    waveNum++;
    waveActive = true;
    const w = WAVES[waveNum - 1];
    enemiesToSpawn = w.count;
    spawnTimer = 0;
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
    // Track game start time for tiebreaker
    if (isDuel && waveNum === 1) gameStartTime = Date.now();
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
    if (gold < cost) { showMessage('Not enough gold'); return; }
    const test = grid.map(r => [...r]);
    test[row][col] = 1;
    if (!pathExists(test)) { showMessage('Path blocked'); return; }
    grid[row][col] = 1;
    towers.push(new Tower(row, col, placingType));
    gold -= cost;
    playSfx('place');
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
    playSfx('sell');
    updateUI();
    showMessage('Sold +' + refund + 'g');
    for (const e of enemies) { if (e.alive && !e.ghost) e.recalcPath(); }
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

    // OUT zone
    const outX = GX + GRID * CS;
    for (const row of EXIT_ROWS) {
        ctx.fillStyle = '#180808';
        ctx.fillRect(outX, row * CS, CS, CS);
    }
    ctx.fillStyle = '#ff0066';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.shadowColor = '#ff0066'; ctx.shadowBlur = 8;
    ctx.fillText('OUT', outX + CS / 2, EXIT_ROWS[2] * CS + CS / 2);
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
    if (isDuel && document.hidden) return; // background interval handles it
    requestAnimationFrame(gameLoop);
}

function gameLoop(time) {
    if (!time) time = performance.now();
    const rawDt = (time - lastTime) / 1000;
    lastTime = time;
    // In duel: allow larger dt so background tabs catch up (up to 0.5s per step)
    const dt = Math.min(rawDt, isDuel ? 0.5 : 0.05) * (isDuel ? 1 : gameSpeed);

    if (waveActive && enemiesToSpawn > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            const waveData = WAVES[waveNum - 1];
            const et = ENEMY_TYPES[waveData.type];
            // Pick entry row weighted by group (top 30%, mid 40%, bottom 30%)
            let spawnRow;
            if (et.ghost) {
                spawnRow = pickEntryRow(ENTRY_ROWS);
            } else {
                const valid = getValidEntryRows();
                if (valid.length === 0) { enemiesToSpawn = 0; }
                else spawnRow = pickEntryRow(valid);
            }
            if (spawnRow !== undefined) {
                enemies.push(new Enemy(spawnRow, waveData.hp, waveData.type));
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
    for (const e of enemies) {
        if (!e.alive && e.canSplit && e.splits > 0) {
            for (let i = 0; i < e.splits; i++) {
                const childHp = Math.floor(e.maxHp * e.splitHpRatio);
                const spreadY = (i === 0 ? -1 : 1) * CS * 0.4;
                const jumpX = CS * 1.0; // jump 1 cell forward
                newEnemies.push(new Enemy(0, childHp, e.typeName, { x: e.x + jumpX, y: e.y + spreadY }));
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
                    if (conn) conn.send({ type: 'game_complete', score, time: gameEndTime - gameStartTime });
                    if (opponentFinished) checkDuelEnd();
                    else { showMessage('Done! Waiting...'); playSfx('victory'); }
                } else {
                    showMessage('Victory!'); playSfx('victory');
                }
            }
        } else {
            if (lives > 0) showMessage('Wave ' + waveNum + ' complete');
            if (waveNum >= 1 && nextWaveTimer <= 0) {
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
                startWave(false); // auto-launch: don't sync
            }
        }
    }

    // Duel: 15-second countdown before wave 1
    if (isDuel && duelStartTimer > 0) {
        duelStartTimer -= dt;
        if (duelStartTimer <= 0) {
            duelStartTimer = 0;
            startWave(false); // both timers fire independently
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
            }
        }
        updateUI();
        drawScene();
        for (const t of towers) t.draw();
        for (const e of enemies) e.draw();
        ctx.fillStyle = 'rgba(3,3,8,0.8)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        if (isDuel && duelResultTitle) {
            const isWin = duelResultTitle === 'VICTORY';
            ctx.fillStyle = isWin ? '#00ff88' : '#ff0066';
            ctx.font = '700 14px "Press Start 2P", monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
            ctx.fillText(duelResultTitle, CANVAS_W / 2, CANVAS_H / 2 - 15);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#506070';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillText(duelResultSub, CANVAS_W / 2, CANVAS_H / 2 + 15);
        } else {
            ctx.fillStyle = '#ff0066';
            ctx.font = '700 14px "Press Start 2P", monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ff0066'; ctx.shadowBlur = 20;
            ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#506070';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillText('SCORE: ' + score, CANVAS_W / 2, CANVAS_H / 2 + 20);
        }
        showReplayBtn();
        return;
    }

    // Duel result overlay (when opponent dies but I'm still alive)
    if (duelEnded && duelResultTitle && lives > 0) {
        updateUI();
        drawScene();
        for (const t of towers) t.draw();
        for (const p of projectiles) p.draw();
        for (const e of enemies) e.draw();
        ctx.fillStyle = 'rgba(3,3,8,0.8)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const isWin = duelResultTitle === 'VICTORY';
        ctx.fillStyle = isWin ? '#00ff88' : '#ff0066';
        ctx.font = '700 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
        ctx.fillText(duelResultTitle, CANVAS_W / 2, CANVAS_H / 2 - 15);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#506070';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(duelResultSub, CANVAS_W / 2, CANVAS_H / 2 + 15);
        showReplayBtn();
        scheduleLoop();
        return;
    }

    // Solo victory overlay
    if (!isDuel && waveNum >= WAVES.length && !waveActive && enemies.length === 0 && lives > 0) {
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
        ctx.fillText('SCORE: ' + score, CANVAS_W / 2, CANVAS_H / 2 + 15);
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
                tw: towers.map(function(t) { return { r: t.row, c: t.col, i: t.typeIdx }; }),
                en: enemies.filter(function(e) { return e.alive; }).map(function(e) {
                    return { gx: (e.x - GX) / CS, gy: e.y / CS, t: e.typeName, s: ENEMY_TYPES[e.typeName].scale || 1 };
                })
            });
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

    scheduleLoop();
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
};
const WAVE_SHORT = {
    normal: 'Norm', ghost: 'Ghst', splitter: 'Spl', fast: 'Fast', swarm: 'Swrm', shield: 'Shld',
    stealth: 'Stlh', regen: 'Regn',
    boss_normal: 'B.Nrm', boss_ghost: 'B.Gho', boss_splitter: 'B.Spl',
    boss_fast: 'B.Fst', boss_swarm: 'B.Swm', boss_shield: 'B.Shd',
};
const WAVE_BG = {
    normal: '#3a1828', ghost: '#281840', splitter: '#183a20', fast: '#383810', swarm: '#103838', shield: '#182838',
    stealth: '#202030', regen: '#183818',
    boss_normal: '#3a2010', boss_ghost: '#301848', boss_splitter: '#204020',
    boss_fast: '#404010', boss_swarm: '#104040', boss_shield: '#203040',
};
const WAVE_BG_ACTIVE = {
    normal: '#602040', ghost: '#402060', splitter: '#206040', fast: '#606020', swarm: '#206060', shield: '#204060',
    boss_normal: '#604020', boss_ghost: '#502068', boss_splitter: '#306030',
    boss_fast: '#606030', boss_swarm: '#306060', boss_shield: '#305060',
};

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
        el.title = 'Wave ' + (i + 1) + ' — ' + w.count + 'x ' + WAVE_LABELS[w.type] + ' (HP: ' + w.hp + ')';
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
    } else if (waveNum === 0) {
        goBtn.textContent = 'Launch 1';
        goBtn.disabled = lives <= 0;
    } else if (waveActive && alive > 0) {
        goBtn.textContent = alive + ' left';
        goBtn.disabled = true;
    } else if (isDuel && duelEnded) {
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
    if (!isDuel) return;
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
let isMuted = false;
let musicStarted = false;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.25;
    musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
}

function toggleMute() {
    initAudio();
    isMuted = !isMuted;
    masterGain.gain.setTargetAtTime(isMuted ? 0 : 1, audioCtx.currentTime, 0.05);
    document.getElementById('mute-btn').classList.toggle('muted', isMuted);
    document.getElementById('mute-icon-on').style.display = isMuted ? 'none' : '';
    document.getElementById('mute-icon-off').style.display = isMuted ? '' : 'none';
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
    document.getElementById('replay-btn').style.display = '';
}

function toggleSpeed() {
    if (isDuel) return;
    gameSpeed = gameSpeed === 1 ? 2 : 1;
    var btn = document.getElementById('speed-btn');
    btn.textContent = 'x' + gameSpeed;
    btn.classList.toggle('fast', gameSpeed === 2);
}

function menuStartSolo() {
    isDuel = false;
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('speed-btn').style.display = '';
}

function menuShowDuel() {
    document.getElementById('menu-main').style.display = 'none';
    document.getElementById('menu-duel').style.display = '';
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
    if (typeof Peer === 'undefined') { alert('PeerJS non charge'); return; }
    document.getElementById('menu-duel').style.display = 'none';
    document.getElementById('menu-host').style.display = '';
    const code = generateRoomCode();
    document.getElementById('menu-code').textContent = code;
    document.getElementById('menu-wait').textContent = 'Waiting for opponent...';
    document.getElementById('menu-status').style.display = 'none';

    peer = new Peer('tdpro-' + code);
    peer.on('open', function() {
        // Ready, waiting for connection
    });
    peer.on('connection', function(c) {
        conn = c;
        isHost = true;
        conn.on('open', function() {
            setupConnection();
            // Send game config (entry groups) so both boards match
            conn.send({ type: 'init', entryGroups: ENTRY_GROUPS });
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
    if (typeof Peer === 'undefined') { alert('PeerJS non charge'); return; }
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if (code.length !== 4) return;
    document.getElementById('join-error').style.display = 'none';

    peer = new Peer();
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

function setupConnection() {
    conn.on('data', handlePeerMessage);
    conn.on('close', function() {
        if (!duelEnded) {
            duelEnded = true;
            duelResultTitle = 'VICTORY';
            duelResultSub = 'Opponent disconnected';
            showMessage('Opponent disconnected');
            playSfx('victory');
        }
    });
}

function startDuel() {
    isDuel = true;
    duelEnded = false;
    duelResultTitle = '';
    duelResultSub = '';
    opponentFinished = false;
    duelStartTimer = 15; // 15s countdown before wave 1
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('opp-bar').style.display = 'flex';
    initOpponentCanvas();
    // Recalculate BARS_H with opponent bar visible
    const wrapH = document.getElementById('wrap').offsetHeight;
    BARS_H = wrapH - canvas.height;
    resizeGame();
}

function handlePeerMessage(data) {
    if (data.type === 'init') {
        setEntryGroups(data.entryGroups);
        startDuel();
    } else if (data.type === 'wave_start') {
        // Force start even if current wave still active
        waveActive = false;
        nextWaveTimer = 0;
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
        }
    } else if (data.type === 'game_complete') {
        opponentFinished = true;
        opponentFinalScore = data.score;
        opponentFinalTime = data.time;
        checkDuelEnd();
    }
}

function updateOpponentUI() {
    document.getElementById('opp-lives').textContent = opponentLives;
    document.getElementById('opp-score').textContent = opponentScore;
    document.getElementById('opp-wave').textContent = opponentWave;
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

    if (score > opponentFinalScore) {
        duelResultTitle = 'VICTORY';
        duelResultSub = 'Score: ' + score + ' vs ' + opponentFinalScore;
    } else if (score < opponentFinalScore) {
        duelResultTitle = 'DEFEAT';
        duelResultSub = 'Score: ' + score + ' vs ' + opponentFinalScore;
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
}

document.addEventListener('keydown', function(e) {
    // Enter to join room
    if (e.key === 'Enter' && document.getElementById('menu-join').style.display !== 'none') {
        menuJoinRoom();
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
    var num = parseInt(e.key);
    if (num >= 1 && num <= TOWER_TYPES.length) {
        toggleTowerMode(num - 1);
    }
});

// === OPPONENT MINI-BOARD ===
const OPP_TOWER_COLORS = ['#ff0066','#00f0ff','#88ccff','#ff8800','#aa44ff','#5588ff','#00ff88','#ff4400','#ff00ff'];

function initOpponentCanvas() {
    var oc = document.getElementById('opp-canvas');
    oc.width = Math.round(CANVAS_W * 0.75);
    oc.height = Math.round(CANVAS_H * 0.75);
    oc.style.display = 'block';
}

function drawOpponentBoard() {
    if (!oppBoardData) return;
    var oc = document.getElementById('opp-canvas');
    var ox = oc.getContext('2d');
    var sc = 0.75;
    oc.width = Math.round(CANVAS_W * sc);
    oc.height = Math.round(CANVAS_H * sc);
    ox.save();
    ox.scale(sc, sc);

    // Background
    ox.fillStyle = '#0a0e16';
    ox.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Entry zones
    for (var ei = 0; ei < ENTRY_ROWS.length; ei++) {
        ox.fillStyle = '#061810';
        ox.fillRect(0, ENTRY_ROWS[ei] * CS, CS, CS);
    }
    // Exit zones
    var outX = GX + GRID * CS;
    for (var xi = 0; xi < EXIT_ROWS.length; xi++) {
        ox.fillStyle = '#180808';
        ox.fillRect(outX, EXIT_ROWS[xi] * CS, CS, CS);
    }

    // Grid area
    ox.fillStyle = '#0c1018';
    ox.fillRect(GX, 0, GRID * CS, CANVAS_H);

    // Subtle grid lines
    ox.strokeStyle = '#ffffff06';
    ox.lineWidth = 0.5;
    for (var r = 0; r <= GRID; r++) {
        ox.beginPath(); ox.moveTo(GX, r * CS); ox.lineTo(GX + GRID * CS, r * CS); ox.stroke();
    }
    for (var c = 0; c <= GRID; c++) {
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
    for (var gi = 0; gi < ENTRY_GROUPS.length; gi++) {
        var g = ENTRY_GROUPS[gi];
        var cy = (g[0] + g[g.length - 1]) / 2 * CS + CS / 2;
        ox.fillText('IN', CS / 2, cy);
    }
    ox.fillStyle = '#ff0066';
    ox.font = '600 11px "JetBrains Mono", monospace';
    ox.fillText('OUT', outX + CS / 2, EXIT_ROWS[2] * CS + CS / 2);

    // Towers
    for (var ti = 0; ti < oppBoardData.towers.length; ti++) {
        var tw = oppBoardData.towers[ti];
        ox.fillStyle = OPP_TOWER_COLORS[tw.i] || '#00f0ff';
        ox.fillRect(GX + tw.c * CS + 2, tw.r * CS + 2, CS - 4, CS - 4);
    }

    // Enemies
    for (var eii = 0; eii < oppBoardData.enemies.length; eii++) {
        var en = oppBoardData.enemies[eii];
        var et = ENEMY_TYPES[en.t];
        ox.fillStyle = et ? et.color : '#ff0000';
        ox.beginPath();
        ox.arc(GX + en.gx * CS, en.gy * CS, CS * 0.3 * (en.s || 1), 0, Math.PI * 2);
        ox.fill();
    }

    ox.restore();
}
