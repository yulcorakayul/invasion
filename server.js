const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const MAP=6000, MAX_P=100, P_RAD=15, B_RAD=4, B_SPD=450, B_RNG=1280;
const P_SPD=280, CD=0.4, SAFE=100, SHRINK=120;
const BOT_VIS=500, BOT_ERR=0.18;
const BOOST_SPD=600, BOOST_DUR=0.18, BOOST_CD=1.5;
const MAG=5, RELOAD=3;
const REF_W=1920, REF_H=1080;
const TICK_RATE=50;
const LOBBY_TIME=30, COUNTDOWN_TIME=3, GAMEOVER_TIME=5;

const NAMES=["Shadow","Phantom","Ninja","Viper","Storm","Blaze","Frost","Thunder","Hawk","Wolf","Lion","Eagle","Cobra","Tiger","Bear","Fox","Raven","Shark","Panther","Reaper","Ghost","Sniper","Ace","Blade","Arrow","Flash","Spark","Doom","Fury","Rage","Chaos","Void","Hex","Jinx","Pixel","Nova","Atlas","Titan","Zeus","Mars","Apollo","Loki","Thor","Odin","Crypt","Drift","Edge","Flux","Glitch","Havoc","Icon","Karma","Myth","Neon","Omega","Pulse","Quest","Rogue","Surge","Toxic","Ultra","Volt","Warp","Xeno","Yeti","Zeal","Blitz","Crash","Drake","Ember","Fang","Grim","Haze","Iris","Jade","Knox","Luna","Mist","Nash","Onyx","Pike","Rex","Scar","Tusk","Axel","Bolt","Claw","Dusk","Echo","Fuse","Grip","Hunt","Iron","Jolt","Kite","Lynx","Maze","Nuke","Orb","Pyro","Rift","Sage","Thorn","Vale","Wisp","Zap","Crow"];

const dist=(x1,y1,x2,y2)=>Math.sqrt((x2-x1)**2+(y2-y1)**2);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rndCol=()=>`hsl(${Math.random()*360|0},70%,55%)`;

const MIME={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.xml':'application/xml','.txt':'text/plain'};

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if(url.endsWith('/')) url += 'index.html';
  const safePath = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);
  fs.readFile(filePath, (err, data) => {
    if(err) {
      fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
        if(err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {'Content-Type':'text/html'});
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = req.url.split('?')[0];
  if(url === '/battle/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else { socket.destroy(); }
});

let game = null;
const clients = new Map();

function mkPlayer(id, human, name) {
  const pad = 400;
  return {
    id, human,
    x: pad + Math.random() * (MAP - pad * 2),
    y: pad + Math.random() * (MAP - pad * 2),
    ang: Math.random() * Math.PI * 2,
    alive: true,
    col: human ? '#00ff88' : rndCol(),
    name: human ? (name || 'Player') : NAMES[id % NAMES.length] + (id >= NAMES.length ? id : ''),
    cd: 0, kills: 0, baseCD: CD,
    ammo: MAG, reloading: 0,
    boost: 0, boostCd: 0,
    tx: MAP/2, ty: MAP/2, mt: 0, sd: 0.5 + Math.random() * 0.8,
    skinId: 'default',
  };
}

function resetGame() {
  const players = [];
  for(let i = 0; i < MAX_P; i++) players.push(mkPlayer(i, false));
  game = {
    players, proj: [],
    bnd: { l:0, t:0, r:MAP, b:MAP },
    state: 'LOBBY', lobbyTimer: LOBBY_TIME,
    cdTimer: COUNTDOWN_TIME, goTimer: GAMEOVER_TIME,
    time: 0, lastTick: Date.now(),
    alive: MAX_P, events: [],
  };
  let slotIdx = 0;
  for(const [ws, client] of clients) {
    if(slotIdx < MAX_P) {
      const p = game.players[slotIdx];
      p.human = true; p.col = '#00ff88';
      p.name = client.name || 'Player';
      p.skinId = client.skin || 'default';
      client.id = slotIdx;
      safeSend(ws, JSON.stringify({t:'id', id: slotIdx}));
      slotIdx++;
    }
  }
  console.log('[Game] Reset. ' + clients.size + ' player(s) in lobby.');
}

function fire(g, p) {
  if(p.cd > 0 || p.ammo <= 0 || p.reloading > 0) return;
  p.cd = p.baseCD; p.ammo--;
  if(p.ammo <= 0) p.reloading = RELOAD;
  const c = Math.cos(p.ang), s = Math.sin(p.ang);
  g.proj.push({ x: p.x+c*(P_RAD+B_RAD+2), y: p.y+s*(P_RAD+B_RAD+2), vx: c*B_SPD, vy: s*B_SPD, oid: p.id, d: 0 });
  g.events.push({t:'shoot', x: p.x, y: p.y});
  if(p.ammo <= 0) g.events.push({t:'reload', x: p.x, y: p.y});
}

function updHuman(p, g, input, dt) {
  if(!p.alive) return;
  p.boostCd = Math.max(0, p.boostCd - dt);
  if(input.boost && p.boostCd <= 0 && p.boost <= 0) { p.boost = BOOST_DUR; p.boostCd = BOOST_CD; }
  p.boost = Math.max(0, p.boost - dt);
  const d = input.dist || 0;
  if(d > 0.02) {
    const base = Math.min(P_SPD, d * P_SPD);
    const sp = p.boost > 0 ? BOOST_SPD : base;
    p.x += Math.cos(input.ang) * sp * dt;
    p.y += Math.sin(input.ang) * sp * dt;
    p.ang = input.ang;
  }
  p.cd = Math.max(0, p.cd - dt);
  if(p.reloading > 0) { p.reloading = Math.max(0, p.reloading - dt); if(p.reloading <= 0) p.ammo = MAG; }
  const b = g.bnd;
  p.x = clamp(p.x, b.l+P_RAD, b.r-P_RAD);
  p.y = clamp(p.y, b.t+P_RAD, b.b-P_RAD);
  if(input.shooting && p.cd <= 0) fire(g, p);
}

function updBot(bot, g, dt) {
  if(!bot.alive) return;
  const b = g.bnd;
  bot.cd = Math.max(0, bot.cd - dt);
  if(bot.reloading > 0) { bot.reloading = Math.max(0, bot.reloading - dt); if(bot.reloading <= 0) bot.ammo = MAG; }
  bot.mt -= dt; bot.sd -= dt;
  if(bot.mt <= 0) {
    bot.mt = 1 + Math.random() * 2.5;
    const cx=(b.l+b.r)/2, cy=(b.t+b.b)/2, w=b.r-b.l, h=b.b-b.t;
    bot.tx = clamp(cx+(Math.random()-0.5)*w*0.6, b.l+SAFE, b.r-SAFE);
    bot.ty = clamp(cy+(Math.random()-0.5)*h*0.6, b.t+SAFE, b.b-SAFE);
  }
  const bd = 120;
  if(bot.x-b.l<bd) bot.tx=Math.max(bot.tx, bot.x+200);
  if(b.r-bot.x<bd) bot.tx=Math.min(bot.tx, bot.x-200);
  if(bot.y-b.t<bd) bot.ty=Math.max(bot.ty, bot.y+200);
  if(b.b-bot.y<bd) bot.ty=Math.min(bot.ty, bot.y-200);
  for(const pr of g.proj) {
    if(pr.oid === bot.id) continue;
    const dd = dist(bot.x, bot.y, pr.x, pr.y);
    if(dd < 130) {
      const pa = Math.atan2(pr.vy, pr.vx);
      const da = pa + (Math.random() > 0.5 ? 1 : -1) * Math.PI/2;
      bot.tx = bot.x + Math.cos(da)*200;
      bot.ty = bot.y + Math.sin(da)*200;
      bot.mt = 0.3; break;
    }
  }
  bot.boostCd = Math.max(0, bot.boostCd - dt);
  bot.boost = Math.max(0, bot.boost - dt);
  const dx=bot.tx-bot.x, dy=bot.ty-bot.y, dd=Math.sqrt(dx*dx+dy*dy);
  if(dd > 5) {
    const sp = Math.min(P_SPD*0.9, dd/180*P_SPD);
    bot.x += (dx/dd)*sp*dt; bot.y += (dy/dd)*sp*dt;
    bot.ang = Math.atan2(dy, dx);
  }
  if(bot.cd <= 0 && bot.sd <= 0) {
    let cls=null, cd2=BOT_VIS;
    for(const p of g.players) {
      if(p===bot||!p.alive) continue;
      const dd2=dist(bot.x,bot.y,p.x,p.y);
      if(dd2<cd2){cd2=dd2;cls=p;}
    }
    if(cls) {
      const aa=Math.atan2(cls.y-bot.y, cls.x-bot.x);
      bot.ang = aa + (Math.random()-0.5)*BOT_ERR*2;
      fire(g, bot); bot.sd = 0.3 + Math.random()*0.7;
    }
  }
  bot.x=clamp(bot.x,b.l+P_RAD,b.r-P_RAD);
  bot.y=clamp(bot.y,b.t+P_RAD,b.b-P_RAD);
}

function updProj(g, dt) {
  const b = g.bnd;
  for(let i=g.proj.length-1;i>=0;i--) {
    const p=g.proj[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.d+=B_SPD*dt;
    if(p.d>B_RNG||p.x<b.l||p.x>b.r||p.y<b.t||p.y>b.b) g.proj.splice(i,1);
  }
}

function collisions(g) {
  for(let i=g.proj.length-1;i>=0;i--) {
    const pr=g.proj[i];
    for(const p of g.players) {
      if(!p.alive||p.id===pr.oid) continue;
      if(dist(pr.x,pr.y,p.x,p.y)<P_RAD+B_RAD) {
        p.alive=false; g.proj.splice(i,1); g.alive--;
        g.events.push({t:'kill',x:p.x,y:p.y,col:p.col,vid:p.id});
        const killer=g.players[pr.oid];
        if(killer&&killer.alive){killer.kills++;killer.baseCD=Math.max(0.08,killer.baseCD-0.1);killer.boostCd=0;}
        break;
      }
    }
  }
}

function updShrink(g, dt) {
  if(g.alive<=1) return;
  const ratio=Math.max(0,(g.alive-2)/(MAX_P-2));
  const tW=REF_W+(MAP-REF_W)*ratio, tH=REF_H+(MAP-REF_H)*ratio;
  const b=g.bnd, cW=b.r-b.l, cH=b.b-b.t;
  const alive=g.players.filter(p=>p.alive);
  let mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;
  for(const p of alive){if(p.x<mnX)mnX=p.x;if(p.x>mxX)mxX=p.x;if(p.y<mnY)mnY=p.y;if(p.y>mxY)mxY=p.y;}
  const sm=SHRINK*dt;
  if(cW>tW+1){const rm=Math.min(cW-tW,sm),mL=mnX-b.l,mR=b.r-mxX,tot=mL+mR;if(tot>SAFE*2){let dL=rm*(mL/tot),dR=rm*(mR/tot);dL=Math.min(dL,Math.max(0,mL-SAFE));dR=Math.min(dR,Math.max(0,mR-SAFE));b.l+=dL;b.r-=dR;}}
  if(cH>tH+1){const rm=Math.min(cH-tH,sm),mT=mnY-b.t,mB=b.b-mxY,tot=mT+mB;if(tot>SAFE*2){let dT=rm*(mT/tot),dB=rm*(mB/tot);dT=Math.min(dT,Math.max(0,mT-SAFE));dB=Math.min(dB,Math.max(0,mB-SAFE));b.t+=dT;b.b-=dB;}}
}

function buildState() {
  const g=game;
  const p=g.players.map(pl=>[pl.id,pl.alive?1:0,Math.round(pl.x),Math.round(pl.y),+pl.ang.toFixed(3),pl.col,pl.name,pl.ammo,+pl.reloading.toFixed(2),+pl.boost.toFixed(3),+pl.boostCd.toFixed(2),+pl.cd.toFixed(2),pl.kills,pl.human?1:0,+pl.baseCD.toFixed(2),pl.skinId||'default']);
  const b=g.proj.map(pr=>[Math.round(pr.x),Math.round(pr.y),Math.round(pr.vx),Math.round(pr.vy),pr.oid]);
  return {t:'state',s:g.state,lt:+g.lobbyTimer.toFixed(1),alive:g.alive,time:+g.time.toFixed(2),cd:g.state==='COUNTDOWN'?Math.max(0,Math.ceil(g.cdTimer)):0,p,b,bnd:{l:Math.round(g.bnd.l),t:Math.round(g.bnd.t),r:Math.round(g.bnd.r),b:Math.round(g.bnd.b)},ev:g.events};
}

function broadcast(msg) { const data=typeof msg==='string'?msg:JSON.stringify(msg); for(const [ws] of clients) safeSend(ws,data); }
function safeSend(ws, data) { try{if(ws.readyState===1)ws.send(data);}catch(e){} }

function tick() {
  if(!game) return;
  const now=Date.now(), dt=Math.min((now-game.lastTick)/1000, 0.1);
  game.lastTick=now; game.time+=dt; game.events=[];
  if(game.state==='LOBBY') {
    game.lobbyTimer-=dt;
    if(game.lobbyTimer<=0){game.state='COUNTDOWN';game.cdTimer=COUNTDOWN_TIME;console.log('[Game] Lobby ended. '+countHumans()+' human(s).');}
  } else if(game.state==='COUNTDOWN') {
    game.cdTimer-=dt;
    if(game.cdTimer<=0){game.state='PLAYING';console.log('[Game] GO! '+game.alive+' alive.');}
  } else if(game.state==='PLAYING') {
    for(const [ws,client] of clients){if(client.id>=0&&client.id<MAX_P){const p=game.players[client.id];if(p&&p.human)updHuman(p,game,client.input,dt);}}
    for(const p of game.players){if(!p.human)updBot(p,game,dt);}
    updProj(game,dt); collisions(game); updShrink(game,dt);
    const alivePlayers=game.players.filter(p=>p.alive);
    const aliveHumans=alivePlayers.filter(p=>p.human);
    if(alivePlayers.length<=1){game.state='GAMEOVER';game.goTimer=GAMEOVER_TIME;console.log('[Game] Over! Winner: '+(alivePlayers[0]?alivePlayers[0].name:'none'));}
    else if(aliveHumans.length===0&&countHumans()>0){game.state='GAMEOVER';game.goTimer=GAMEOVER_TIME;console.log('[Game] All humans eliminated.');}
  } else if(game.state==='GAMEOVER') {
    for(const p of game.players){if(!p.human)updBot(p,game,dt);}
    updProj(game,dt);collisions(game);updShrink(game,dt);
    game.goTimer-=dt; if(game.goTimer<=0) resetGame();
  }
  broadcast(buildState());
}

function countHumans(){let n=0;for(const[,c]of clients)if(c.id>=0)n++;return n;}

wss.on('connection', (ws) => {
  console.log('[WS] Connected. Total: '+(clients.size+1));
  const client={id:-1,input:{ang:0,dist:0,shooting:false,boost:false},name:'Player',skin:'default'};
  clients.set(ws, client);
  if(game.state==='LOBBY') assignSlot(ws,client);
  else safeSend(ws, JSON.stringify({t:'wait'}));
  ws.on('message', (raw) => {
    try {
      const msg=JSON.parse(raw.toString());
      if(msg.t==='join'){
        client.name=(msg.name||'Player').slice(0,20);
        client.skin=(msg.skin||'default').slice(0,30);
        if(client.id>=0&&game.players[client.id]){game.players[client.id].name=client.name;game.players[client.id].skinId=client.skin;}
        else if(game.state==='LOBBY') assignSlot(ws,client);
      } else if(msg.t==='input'){
        client.input.ang=typeof msg.ang==='number'?msg.ang:0;
        client.input.dist=typeof msg.dist==='number'?clamp(msg.dist,0,1):0;
        client.input.shooting=!!msg.shooting;
        client.input.boost=!!msg.boost;
      }
    } catch(e){}
  });
  ws.on('close', () => {
    console.log('[WS] Disconnected. ID: '+client.id);
    if(client.id>=0&&game.players[client.id]){
      const p=game.players[client.id];
      p.human=false; p.name=NAMES[p.id%NAMES.length]+(p.id>=NAMES.length?p.id:'');
      p.col=rndCol(); p.skinId='default';
    }
    clients.delete(ws);
  });
  ws.on('error', ()=>{});
});

function assignSlot(ws, client) {
  for(let i=0;i<MAX_P;i++){
    const p=game.players[i];
    if(!p.human){
      p.human=true;p.col='#00ff88';p.name=client.name;p.skinId=client.skin;
      client.id=i;
      safeSend(ws, JSON.stringify({t:'id',id:i}));
      console.log('[WS] Slot '+i+' -> '+client.name);
      return;
    }
  }
  safeSend(ws, JSON.stringify({t:'wait'}));
}

resetGame();
setInterval(tick, TICK_RATE);
server.listen(PORT, () => {
  console.log('[Server] Battle.io on port '+PORT);
  console.log('[Server] http://localhost:'+PORT+'/battle/');
});
