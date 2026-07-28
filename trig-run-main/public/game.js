'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────
const W=1200, H=600, GROUND=H-68;
const GRAVITY=0.8, JUMP_FORCE=-12, SPEED=5.7, BUFFER=20, GRID=34;
const SHIP_THRUST=-0.45, SHIP_GRAV=0.4, SHIP_MAXVY=8;
const COL={
  bg1:'#01447a', bg2:'#008cff',
  ground:'#01447a', groundLine:'#ffffff',
  spike:'#000', platform:'#666', platformTop:'#aaaaaa',
  orb:'#ffdd00', particle:['#00eaff','#ffffff','#ffdd00','#00ff88']
};

// ─── CANVAS ──────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

// ─── STATE ───────────────────────────────────────────────────
let gameState = 'title'; // title | playing | dead | paused
let gameMode  = 'cube';  // cube | ship
let player, particles = [], levelObjects = [];
let camX = 0, jumpHeld = false, jumpBuffer = 0;
let attempts = 0, best = 0;
let savedLevels = [], currentLevelBest = {}, currentLevelId = 'builtin';
let selectedIcon = 0, playerColor1 = '#00eaff', playerColor2 = '#003355';
let customLevelObjects = [];
let lastTime = null;

// ─── AUTH STATE ──────────────────────────────────────────────
let authToken = localStorage.getItem('trun_auth_token') || '';
let currentUser = null;

function authFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {});
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(url, opts);
}

function updateTitleUserBar() {
  const display = document.getElementById('title-user-display');
  const btn = document.getElementById('title-auth-btn');
  if (!display || !btn) return;
  if (currentUser) {
    display.textContent = currentUser.displayName || currentUser.username;
    display.onclick = openProfile;
    btn.textContent = 'PROFILE';
    btn.onclick = openProfile;
  } else {
    display.textContent = '';
    display.onclick = null;
    btn.textContent = 'LOGIN';
    btn.onclick = openAuthModal;
  }
}

function restoreSession() {
  if (!authToken) return;
  fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + authToken } })
    .then(r => r.json())
    .then(d => {
      if (d.success && d.user) {
        currentUser = d.user;
      } else {
        authToken = '';
        localStorage.removeItem('trun_auth_token');
      }
      updateTitleUserBar();
    })
    .catch(() => {
      authToken = '';
      localStorage.removeItem('trun_auth_token');
      updateTitleUserBar();
    });
}

// ─── AUTH MODAL ──────────────────────────────────────────────
function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('auth-login-error').textContent = '';
  document.getElementById('auth-reg-error').textContent = '';
}
function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}
function switchAuthTab(tab) {
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-form-login').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('auth-form-register').style.display = tab === 'register' ? 'flex' : 'none';
  document.getElementById('auth-login-error').textContent = '';
  document.getElementById('auth-reg-error').textContent = '';
}
function doLogin() {
  const username = document.getElementById('auth-login-user').value.trim();
  const password = document.getElementById('auth-login-pass').value;
  const errEl = document.getElementById('auth-login-error');
  if (!username || !password) { errEl.textContent = 'Fill in all fields'; return; }
  errEl.textContent = '';
  fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        authToken = d.token;
        currentUser = d.user;
        localStorage.setItem('trun_auth_token', authToken);
        updateTitleUserBar();
        closeAuthModal();
      } else {
        errEl.textContent = d.error || 'Login failed';
      }
    })
    .catch(e => { errEl.textContent = 'Connection error'; });
}
function doRegister() {
  const username = document.getElementById('auth-reg-user').value.trim();
  const password = document.getElementById('auth-reg-pass').value;
  const password2 = document.getElementById('auth-reg-pass2').value;
  const errEl = document.getElementById('auth-reg-error');
  if (!username || !password) { errEl.textContent = 'Fill in all fields'; return; }
  if (password !== password2) { errEl.textContent = 'Passwords do not match'; return; }
  errEl.textContent = '';
  fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        authToken = d.token;
        currentUser = d.user;
        localStorage.setItem('trun_auth_token', authToken);
        updateTitleUserBar();
        closeAuthModal();
      } else {
        errEl.textContent = d.error || 'Registration failed';
      }
    })
    .catch(e => { errEl.textContent = 'Connection error'; });
}
function doLogout() {
  authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  authToken = '';
  currentUser = null;
  localStorage.removeItem('trun_auth_token');
  updateTitleUserBar();
  closeProfile();
}

// ─── PROFILE ─────────────────────────────────────────────────
function openProfile() {
  if (!currentUser) { openAuthModal(); return; }
  hideAll();
  document.getElementById('profile-screen').classList.add('show');
  document.getElementById('profile-username').textContent = currentUser.username;
  document.getElementById('profile-display').textContent = 'Display: ' + (currentUser.displayName || currentUser.username);
  document.getElementById('profile-avatar').textContent = (currentUser.displayName || currentUser.username)[0].toUpperCase();
  const date = new Date(currentUser.createdAt).toLocaleDateString();
  document.getElementById('profile-joined').textContent = 'Joined: ' + date;
  document.getElementById('profile-stats').textContent = 'Levels uploaded: ' + (currentUser.levelsUploaded || 0);
  document.getElementById('profile-display-input').value = currentUser.displayName || currentUser.username;
  document.getElementById('profile-edit').style.display = 'block';
  document.getElementById('profile-msg').textContent = '';
  document.getElementById('profile-logout-btn').style.display = 'inline-block';
  fetchProfileLevels();
}
function closeProfile() {
  hideAll();
  document.getElementById('title-screen').classList.add('show');
}
function saveProfile() {
  const displayName = document.getElementById('profile-display-input').value.trim();
  const msgEl = document.getElementById('profile-msg');
  if (!displayName) { msgEl.textContent = 'Display name required'; return; }
  authFetch('/api/auth/profile', { method: 'PUT', body: { displayName } })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        currentUser = d.user;
        msgEl.textContent = 'Saved!';
        msgEl.style.color = '#0f8';
        document.getElementById('profile-display').textContent = 'Display: ' + currentUser.displayName;
        document.getElementById('profile-avatar').textContent = currentUser.displayName[0].toUpperCase();
        updateTitleUserBar();
      } else {
        msgEl.textContent = d.error || 'Failed';
        msgEl.style.color = '#f44';
      }
    })
    .catch(() => { msgEl.textContent = 'Connection error'; });
}
function fetchProfileLevels() {
  const grid = document.getElementById('profile-levels-grid');
  grid.innerHTML = '';
  authFetch('/api/levels/mine')
    .then(r => r.json())
    .then(d => {
      if (d.levels.length === 0) {
        grid.innerHTML = '<p style="color:#445;font-size:11px;letter-spacing:1px;">No levels uploaded yet.</p>';
        return;
      }
      d.levels.forEach(l => {
        const card = document.createElement('div');
        card.className = 'profile-lv-card';
        const date = new Date(l.uploadedAt).toLocaleDateString();
        card.innerHTML = `<div class="profile-lv-name">${l.name}</div><div class="profile-lv-meta">${l.downloads} downloads · ${date}</div>`;
        grid.appendChild(card);
      });
    })
    .catch(() => { grid.innerHTML = '<p style="color:#f44;font-size:11px;">Failed to load levels</p>'; });
}

function resetPlayer(){
  player = {x:150, y:GROUND-GRID, vy:0, size:GRID, onGround:false, angle:0, dead:false};
  gameMode = 'cube';
  camX = 0;
  particles = [];
  jumpHeld = false;
  jumpBuffer = 0;
}

// ─── SAVE / LOAD ─────────────────────────────────────────────
function saveGame(){
  try {
    localStorage.setItem('trun_save', JSON.stringify({
      selectedIcon, playerColor1, playerColor2,
      savedLevels, currentLevelBest
    }));
  } catch(e){}
}
function loadGame(){
  try {
    const d = JSON.parse(localStorage.getItem('trun_save')||'{}');
    if(d.selectedIcon != null) selectedIcon = d.selectedIcon;
    if(d.playerColor1) playerColor1 = d.playerColor1;
    if(d.playerColor2) playerColor2 = d.playerColor2;
    if(d.savedLevels)  savedLevels  = d.savedLevels;
    if(d.currentLevelBest) currentLevelBest = d.currentLevelBest;
  } catch(e){}
}

// ─── LEVEL GENERATION ────────────────────────────────────────
function generateBuiltinLevel(){
  levelObjects = [];
  const G = GROUND;
  const sp = (x, y) => levelObjects.push({type:'spike', x, y: y !== undefined ? y : G-GRID, w:GRID, h:GRID, rotation:0});
  const cs = (x) => levelObjects.push({type:'spike', x, y:GRID*0.5, w:GRID, h:GRID, rotation:2});
  const bl = (x,y,w,h) => levelObjects.push({type:'block', x, y, w:w??GRID, h:h??GRID});
  const pt = (x,mode) => levelObjects.push({type:'portal', x, y:G-140, w:34, h:140, toMode:mode});
  const dc = (x,y,w,h,col) => levelObjects.push({type:'deco', x, y, w, h, color:col||'#0d1b2a'});

  // ── SECTION 1: Easy cube intro (x 400–2600) ─────────────────
  sp(440);
  sp(680);
  sp(920);

  sp(1092);
  sp(1126);
  bl(1160, G-GRID, 34, GRID);
  sp(1194);
  sp(1228);
  sp(1262);
  bl(1296, G-GRID*2, 34, GRID);
  bl(1296, G-GRID, 34, GRID);

  sp(1520); sp(1554);

  bl(1760, G-GRID, 102, GRID);

  sp(2160);
  sp(2194);

  // ── SECTION 2: Slightly harder cube (x 2600–4200) ───────────
  bl(2584, G-GRID, 34, GRID);
  sp(2618);
  sp(2652);
  sp(2686);
  bl(2720, G-GRID, 34, GRID);
  bl(2720, G-GRID*2, 34, GRID);
  sp(2754);
  sp(2788);
  sp(2822);

  sp(3200); sp(3234);

  bl(3400, G-GRID, 272, GRID);
  sp(3600, G-GRID*2); sp(3634, G-GRID*2);

  sp(3780);

  sp(3960); sp(3994);

  // ── SECTION 3: Ship (x 4200–6400) ───────────────────────────
  pt(4200, 'ship');

  const ceilH = Math.floor(G * 0.30);
  const floorH = Math.floor(G * 0.20);

  bl(4700, 0,    400, ceilH);
  dc(4700, 0,    400, ceilH, '#091520');

  bl(5200, G-floorH, 300, floorH);
  dc(5200, G-floorH, 300, floorH, '#091520');

  bl(5700, 0,         300, ceilH);
  bl(5700, G-floorH,  300, floorH);
  dc(5700, 0,         300, ceilH,    '#091520');
  dc(5700, G-floorH,  300, floorH,   '#091520');

  bl(6100, 0, 200, Math.floor(G*0.25));
  dc(6100, 0, 200, Math.floor(G*0.25), '#091520');
  bl(6400, 0, 34, 380);

  // ── SECTION 4: Return to cube (x 6400–8800) ─────────────────
  pt(6400, 'cube');

  sp(6640);
  sp(6880);

  bl(7080, G-GRID, 68, GRID);
  sp(7200);

  sp(7400); sp(7434);

  bl(7620, G-GRID, 780, GRID);

  sp(7900, G-GRID*2); sp(7934, G-GRID*2); sp(7968, G-GRID*2);

  levelObjects.push({type:'end', x:8400, y:0, w:12, h:H});
}

// Bug fix: generateBuiltinLevel2 used `G` without ever defining it in this scope,
// causing a ReferenceError whenever level 2 was selected. Added `const G = GROUND`.
function generateBuiltinLevel2(){
  levelObjects = [];
  const G = GROUND;   // ← FIX: was missing, broke all sp/ju/pt helper positions
  const sp = (x, y) => levelObjects.push({type:'spike', x, y: y !== undefined ? y : G-GRID, w:GRID, h:GRID, rotation:0});
  const bl = (x,y,w,h) => levelObjects.push({type:'block', x, y:y??G-GRID, w:w??GRID, h:h??GRID});
  const ju = (x, y) => levelObjects.push({type:'jumppad', x, y: y !== undefined ? y : G-10, w:GRID, h:10});
  const pt = (x,mode) => levelObjects.push({type:'portal', x, y:G-140, w:34, h:140, toMode:mode});
  const dc = (x,y,w,h,col) => levelObjects.push({type:'deco', x, y, w, h, color:col||'#0d1b2a'});

  // Opening singles
  for(let x=500; x<900; x+=200) sp(x);

  // Jump pad launch into spike cluster
  ju(966);
  sp(1000); sp(1034); sp(1068); sp(1102);

  // Staircase section
  bl(1300, G-GRID,    34, GRID);
  bl(1334, G-GRID*2,  34, GRID*2);
  bl(1368, G-GRID*3,  34, GRID*3);
  sp(1402);

  // Ship section
  pt(1800, 'ship');
  const ceilH = Math.floor(G * 0.28);
  const floorH = Math.floor(G * 0.18);
  bl(2200, 0,          350, ceilH);
  dc(2200, 0,          350, ceilH,    '#091520');
  bl(2700, G-floorH,   300, floorH);
  dc(2700, G-floorH,   300, floorH,   '#091520');
  bl(3100, 0,          300, ceilH);
  bl(3100, G-floorH,   300, floorH);
  dc(3100, 0,          300, ceilH,    '#091520');
  dc(3100, G-floorH,   300, floorH,   '#091520');

  // Back to cube
  pt(3600, 'cube');
  sp(3900); sp(3934); sp(3968);
  bl(4200, G-GRID, 200, GRID);
  sp(4450); sp(4484);

  // Double jump-pad challenge
  ju(4800);
  sp(4834); sp(4868); sp(4902);
  ju(5100);
  sp(5134); sp(5168);

  // Final stretch
  bl(5500, G-GRID, 600, GRID);
  sp(5600, G-GRID*2); sp(5634, G-GRID*2); sp(5668, G-GRID*2);

  levelObjects.push({type:'end', x:6200, y:0, w:12, h:H});
}

// ─── PARTICLES ───────────────────────────────────────────────
function spawnParticles(x,y,n,col){
  for(let i=0;i<n;i++){
    const a=(Math.PI*2*i)/n+Math.random()*.5, sp=2+Math.random()*4;
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,life:1,decay:.03+Math.random()*.03,size:4+Math.random()*5,color:col||COL.particle[i%4]});
  }
}

// ─── ICONS ───────────────────────────────────────────────────
const ICONS = [
  // 0: Classic cube
  (c,p,s,sz)=>{
    c.fillStyle=p; c.fillRect(-sz/2,-sz/2,sz,sz);
    c.fillStyle=s; c.fillRect(-sz/2+4,-sz/2+4,sz-8,sz-8);
    c.strokeStyle=p; c.lineWidth=2;
    c.beginPath(); c.moveTo(-sz/2,-sz/2); c.lineTo(sz/2,sz/2); c.stroke();
    c.beginPath(); c.moveTo(sz/2,-sz/2); c.lineTo(-sz/2,sz/2); c.stroke();
  },
  // 1: Diamond
  (c,p,s,sz)=>{
    c.fillStyle=p;
    c.beginPath(); c.moveTo(0,-sz/2); c.lineTo(sz/2,0); c.lineTo(0,sz/2); c.lineTo(-sz/2,0); c.closePath(); c.fill();
    c.fillStyle=s;
    c.beginPath(); c.moveTo(0,-sz/4); c.lineTo(sz/4,0); c.lineTo(0,sz/4); c.lineTo(-sz/4,0); c.closePath(); c.fill();
  },
  // 2: Star
  (c,p,s,sz)=>{
    c.fillStyle=p;
    c.beginPath();
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5-Math.PI/2, b=a+Math.PI/5;
      i===0?c.moveTo(Math.cos(a)*sz/2,Math.sin(a)*sz/2):c.lineTo(Math.cos(a)*sz/2,Math.sin(a)*sz/2);
      c.lineTo(Math.cos(b)*sz/4,Math.sin(b)*sz/4);
    }
    c.closePath(); c.fill();
    c.fillStyle=s; c.beginPath(); c.arc(0,0,sz/6,0,Math.PI*2); c.fill();
  },
  // 3: Circle
  (c,p,s,sz)=>{
    c.fillStyle=p; c.beginPath(); c.arc(0,0,sz/2,0,Math.PI*2); c.fill();
    c.fillStyle=s; c.beginPath(); c.arc(0,0,sz/3,0,Math.PI*2); c.fill();
    c.fillStyle=p; c.beginPath(); c.arc(-sz/6,-sz/6,sz/8,0,Math.PI*2); c.fill();
  },
  // 4: Arrow
  (c,p,s,sz)=>{
    c.fillStyle=p;
    c.beginPath(); c.moveTo(sz/2,0); c.lineTo(-sz/4,-sz/2); c.lineTo(-sz/4,sz/2); c.closePath(); c.fill();
    c.fillStyle=s;
    c.beginPath(); c.moveTo(sz/4,0); c.lineTo(-sz/4,-sz/3); c.lineTo(-sz/4,sz/3); c.closePath(); c.fill();
  },
  // 5: Cross
  (c,p,s,sz)=>{
    const t=sz/4;
    c.fillStyle=p;
    c.fillRect(-t,-sz/2,t*2,sz); c.fillRect(-sz/2,-t,sz,t*2);
    c.fillStyle=s; c.beginPath(); c.arc(0,0,t/1.5,0,Math.PI*2); c.fill();
  },
];
function drawIconAt(c,idx,c1,c2,sz){
  const fn = ICONS[idx] || ICONS[0];
  c.save(); fn(c,c1,c2,sz); c.restore();
}

// ─── DRAW ────────────────────────────────────────────────────
const w2s = wx => wx - camX;

const bgCache = (()=>{
  const bc = document.createElement('canvas');
  bc.width = W; bc.height = H;
  const c = bc.getContext('2d');
  const g = c.createLinearGradient(0,0,0,H);
  g.addColorStop(0, COL.bg1); g.addColorStop(1, COL.bg2);
  c.fillStyle = g; c.fillRect(0,0,W,H);
  [[50,30],[120,60],[200,20],[300,50],[400,15],[500,40],[600,25],[700,55],[800,35],[900,70],[1000,25],[1100,50]]
    .forEach(([x,y])=>{ c.fillStyle='rgba(255,255,255,.5)'; c.beginPath(); c.arc(x,y,1.5,0,Math.PI*2); c.fill(); });
  return bc;
})();

function drawBg(){ ctx.drawImage(bgCache,0,0); }

function drawGround(){
  ctx.fillStyle = COL.ground;
  ctx.fillRect(0, GROUND, W, H-GROUND);
  ctx.strokeStyle = COL.groundLine; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0,GROUND); ctx.lineTo(W,GROUND); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,200,255,.06)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for(let gx=-(camX%40);gx<W;gx+=40){ ctx.moveTo(gx,GROUND); ctx.lineTo(gx,H); }
  ctx.stroke();
}

function drawSpike(o){
  const sx=w2s(o.x); if(sx>W+60||sx<-60) return;
  ctx.save();
  ctx.translate(sx+o.w/2, o.y+o.h/2);
  ctx.rotate((o.rotation||0)*Math.PI/2);
  ctx.fillStyle = COL.spike;
  ctx.beginPath(); ctx.moveTo(-o.w/2,o.h/2); ctx.lineTo(0,-o.h/2); ctx.lineTo(o.w/2,o.h/2); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
  ctx.restore();
}

function drawBlock(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  ctx.fillStyle=COL.platform; ctx.fillRect(sx,o.y,o.w,o.h);
  ctx.fillStyle=COL.platformTop; ctx.fillRect(sx,o.y,o.w,4);
  ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,o.y,o.w,o.h);
}

function drawSlab(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  ctx.fillStyle='#555577'; ctx.fillRect(sx,o.y,o.w,o.h);
  ctx.fillStyle='rgba(170,170,200,.6)'; ctx.fillRect(sx,o.y,o.w,3);
  ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1; ctx.strokeRect(sx,o.y,o.w,o.h);
}

function drawOrb(o){
  const sx=w2s(o.x); if(sx>W+60||sx<-60) return;
  const cx=sx+o.w/2, cy=o.y+o.h/2, r=o.w/2;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=COL.orb; ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(cx,cy,r*.4,0,Math.PI*2); ctx.fill();
}

function drawJumpPad(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  ctx.fillStyle='#ffaa00'; ctx.fillRect(sx,o.y,o.w,o.h);
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.moveTo(sx+o.w/2,o.y-10); ctx.lineTo(sx+o.w*.25,o.y+4); ctx.lineTo(sx+o.w*.75,o.y+4); ctx.closePath(); ctx.fill();
}

function drawPortal(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  const col = o.toMode==='ship' ? '#aa44ff' : '#44ffaa';
  ctx.strokeStyle=col; ctx.lineWidth=3; ctx.strokeRect(sx,o.y,o.w,o.h);
  ctx.fillStyle=col+'44'; ctx.fillRect(sx,o.y,o.w,o.h);
  ctx.fillStyle=col; ctx.font='bold 10px Arial Black';
  ctx.fillText(o.toMode==='ship'?'SHIP':'CUBE', sx+2, o.y+14);
}

function drawDeco(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  ctx.fillStyle=o.color||'#1a1a3a'; ctx.fillRect(sx,o.y,o.w,o.h);
  ctx.strokeStyle='rgba(0,200,255,.15)'; ctx.lineWidth=1; ctx.strokeRect(sx,o.y,o.w,o.h);
}

function drawDecoBlack(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  ctx.fillStyle='#000'; ctx.fillRect(sx,o.y,o.w,o.h);
}

function drawEndFlag(o){
  const sx=w2s(o.x); if(sx>W+110||sx<-110) return;
  ctx.fillStyle='rgba(0,255,136,0.18)';
  ctx.fillRect(sx, 0, o.w, H);
  ctx.strokeStyle='#0f8'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
  ctx.fillStyle='#0f8'; ctx.font='bold 13px Arial Black';
  ctx.fillText('FINISH', sx+6, H/2);
}

function drawParticles(){
  particles.forEach(p=>{
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x-camX-p.size/2, p.y-p.size/2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawPlayer(){
  if(!player || player.dead) return;
  if(gameMode==='ship'){ drawShip(); return; }
  const cx=150+player.size/2, cy=player.y+player.size/2;
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(player.angle);
  drawIconAt(ctx, selectedIcon, playerColor1, playerColor2, player.size);
  ctx.restore();
}

function drawShip(){
  const cx=150+player.size/2, cy=player.y+player.size/2;
  ctx.save(); ctx.translate(cx,cy);
  ctx.rotate(Math.max(-0.4,Math.min(0.4,player.vy*0.04)));
  const s=player.size;
  ctx.fillStyle=playerColor1;
  ctx.beginPath(); ctx.moveTo(s/2,0); ctx.lineTo(-s/2,-s*.35); ctx.lineTo(-s*.3,0); ctx.lineTo(-s/2,s*.35); ctx.closePath(); ctx.fill();
  ctx.fillStyle=playerColor2;
  ctx.beginPath(); ctx.moveTo(s*.1,0); ctx.lineTo(-s*.35,-s*.2); ctx.lineTo(-s*.2,0); ctx.lineTo(-s*.35,s*.2); ctx.closePath(); ctx.fill();
  if(jumpHeld){
    ctx.fillStyle='#ff8800';
    ctx.beginPath(); ctx.moveTo(-s*.3,0); ctx.lineTo(-s*.6,-s*.15); ctx.lineTo(-s*.7,0); ctx.lineTo(-s*.6,s*.15); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawProgressBar(){
  const endObj = levelObjects.find(o=>o.type==='end');
  const total = endObj ? endObj.x : 8000;
  const pct = Math.max(0, Math.min(1,(player.x-150)/(total-150)));
  const pctPct = Math.floor(pct*100)+'%';
  document.getElementById('hud-pct-fill').style.width = pctPct;
  document.getElementById('hud-pct-label').textContent = pctPct;
}

function gameDraw(){
  ctx.clearRect(0,0,W,H);
  drawBg();
  drawGround();
  // Draw deco layer first (background)
  levelObjects.forEach(o=>{
    if(o.type==='deco')           drawDeco(o);
    else if(o.type==='deco-black') drawDecoBlack(o);
  });
  // Draw interactive objects on top
  levelObjects.forEach(o=>{
    if(o.type==='spike'||o.type==='halfspike')  drawSpike(o);
    else if(o.type==='block')     drawBlock(o);
    else if(o.type==='slab')      drawSlab(o);
    else if(o.type==='orb')       drawOrb(o);
    else if(o.type==='jumppad')   drawJumpPad(o);
    else if(o.type==='portal')    drawPortal(o);
    else if(o.type==='end')       drawEndFlag(o);
  });
  drawParticles();
  drawPlayer();
  if(gameState==='playing'){
    drawProgressBar();
    document.getElementById('hud-attempts').textContent = 'Attempt '+attempts;
    const modeEl = document.getElementById('hud-mode');
    modeEl.textContent = gameMode.toUpperCase();
    modeEl.style.color = gameMode==='ship' ? '#aa44ff' : 'rgba(255,255,255,.2)';
    // Bug fix: removed the broken homepage-link textContent assignment.
    // The element now lives statically in index.html as a real <a> tag.
  }
}

// ─── COLLISION ───────────────────────────────────────────────
const rOver=(ax,ay,aw,ah,bx,by,bw,bh)=>ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;

function checkCollisions(){
  const sh=4, px=player.x+sh, py=player.y+sh, ps=player.size-sh*2;
  for(const o of levelObjects){
    if(o.x > camX+W+120 || o.x+(o.w||GRID) < camX-120) continue;
    if(o.type==='deco'||o.type==='deco-black') continue;

    if(o.type==='spike'||o.type==='halfspike'){
      const rot=o.rotation||0;
      let hx=o.x, hy=o.y, hw=o.w, hh=o.h;
      if(rot===0){ hx+=4; hy+=o.h/2; hw-=8; hh=o.h/2; }
      else if(rot===1){ hx+=o.w/2; hy+=4; hw=o.w/2; hh-=8; }
      else if(rot===2){ hx+=4; hw-=8; hh=o.h/2; }
      else { hy+=4; hw=o.w/2; hh-=8; }
      if(rOver(px,py,ps,ps,hx,hy,hw,hh)) return 'die';
    }
    else if(o.type==='block'||o.type==='slab'){
      if(rOver(px,py,ps,ps,o.x,o.y,o.w,o.h)){
        const prevY = player.y - player.vy;
        if(prevY+player.size <= o.y+10){ player.y=o.y-player.size; player.vy=0; player.onGround=true; }
        else return 'die';
      }
    }
    else if(o.type==='orb'){
      if(rOver(px,py,ps,ps,o.x,o.y,o.w,o.h)&&jumpHeld){
        player.vy=JUMP_FORCE; spawnParticles(150+player.size/2,player.y+player.size/2,8,COL.orb);
      }
    }
    else if(o.type==='jumppad'){
      if(rOver(px,py,ps,ps,o.x,o.y,o.w,o.h)){
        player.vy=JUMP_FORCE*1.25; player.onGround=false;
        spawnParticles(150+player.size/2,player.y+player.size,8,'#ffaa00');
      }
    }
    else if(o.type==='portal'){
      if(rOver(px,py,ps,ps,o.x,o.y,o.w,o.h)){
        gameMode = o.toMode;
        if(gameMode==='ship') player.vy=Math.min(player.vy,-1);
        else player.vy=0;
      }
    }
    else if(o.type==='end'){
      if(rOver(px,py,ps,ps,o.x,o.y,o.w,o.h)) return 'win';
    }
  }
  return null;
}

// ─── UPDATE ──────────────────────────────────────────────────
function update(dt){
  if(gameMode==='ship'){
    if(jumpHeld) player.vy+=SHIP_THRUST*dt;
    else         player.vy+=SHIP_GRAV*dt;
    player.vy = Math.max(-SHIP_MAXVY, Math.min(SHIP_MAXVY, player.vy));
    player.y += player.vy*dt;
    player.onGround = false;
    if(player.y<=0){ die(); return; }
    if(player.y+player.size>=GROUND){ player.y=GROUND-player.size; player.vy=0; player.onGround=true; }
  } else {
    if(jumpBuffer>0) jumpBuffer--;
    if((jumpBuffer>0||jumpHeld) && player.onGround){
      player.vy=JUMP_FORCE; player.onGround=false; jumpBuffer=0;
      spawnParticles(150+player.size/2, player.y+player.size, 5, playerColor1);
    }
    player.vy += GRAVITY*dt;
    player.y  += player.vy*dt;
    player.onGround = false;
    if(player.y+player.size>=GROUND){ player.y=GROUND-player.size; player.vy=0; player.onGround=true; }
    if(!player.onGround) player.angle += .1*dt;
    else { const t=Math.round(player.angle/(Math.PI/2))*(Math.PI/2); player.angle+=(t-player.angle)*.3; }
  }
  player.x += SPEED*dt;
  camX = player.x - 150;

  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=.15*dt; p.life-=p.decay*dt;
    if(p.life<=0) particles.splice(i,1);
  }

  const res = checkCollisions();
  if(res==='die') die();
  else if(res==='win') win();
}

// ─── STATE TRANSITIONS ───────────────────────────────────────
function die(){
  if(player.dead) return;
  player.dead = true;
  gameState = 'dead';
  const ov = document.getElementById('death-overlay');
  ov.classList.remove('show');
  void ov.offsetWidth; // force reflow so animation restarts
  ov.classList.add('show');
  spawnParticles(150+player.size/2, player.y+player.size/2, 20, playerColor1);
  saveGame();
  setTimeout(()=>{
    ov.classList.remove('show');
    attempts++;
    resetPlayer();
    gameState = 'playing';
    lastTime = null;
  }, 500);
}

function win(){
  currentLevelBest[currentLevelId] = 100;
  saveGame();
  player.dead = true;
  gameState = 'dead';
  spawnParticles(150+player.size/2, player.y+player.size/2, 30, '#0f8');
  setTimeout(()=>{ quitToTitle(); }, 1500);
}

function _beginPlay(){
  hideAll();
  attempts = 1;
  resetPlayer();
  document.getElementById('hud').classList.add('show');
  lastTime = null;
  gameState = 'playing';
}

function restartGame(){
  attempts++;
  resetPlayer();
  lastTime = null;
  gameState = 'playing';
  hideAll();
  document.getElementById('hud').classList.add('show');
}

function pauseGame(){
  gameState = 'paused';
  jumpHeld = false; jumpBuffer = 0;
  showPanel('pause-main');
  document.getElementById('pause-screen').classList.add('show');
}

function resumeGame(){
  gameState = 'playing';
  lastTime = null;
  document.getElementById('pause-screen').classList.remove('show');
}

function quitToTitle(){
  gameState = 'title';
  jumpHeld = false; jumpBuffer = 0;
  hideAll();
  document.getElementById('hud').classList.remove('show');
  document.getElementById('title-logo').textContent = 'TRIGONOMETRY RUN';
  document.getElementById('title-logo').style.cssText = '';
  document.getElementById('title-sub').textContent = 'STEREO MADNESS';
  document.getElementById('title-screen').classList.add('show');
}

function hideAll(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
}

function showPanel(id){
  document.querySelectorAll('#pause-screen .sub-panel').forEach(p=>p.classList.remove('show'));
  document.getElementById(id).classList.add('show');
}

function startBuiltinLevel(){
  currentLevelId = 'builtin';
  generateBuiltinLevel();
  best = currentLevelBest['builtin'] || 0;
  _beginPlay();
}

function startBuiltinLevel2(){
  currentLevelId = 'builtin2';
  generateBuiltinLevel2();   // ← now works: G is defined inside the function
  best = currentLevelBest['builtin2'] || 0;
  _beginPlay();
}

// ─── LEVEL SELECT ────────────────────────────────────────────
// Bug fix: removed `lsStarsAnimating` flag and `animateLsStars()` call.
// animateLsStars was never defined anywhere; animateStars() already handles
// both canvases in a single RAF loop started at boot — no extra call needed.
function openLevelSelect(){
  hideAll();
  renderLevelSelect();
  document.getElementById('levelselect-screen').classList.add('show');
}

function closeLevelSelect(){
  document.getElementById('levelselect-screen').classList.remove('show');
  document.getElementById('title-screen').classList.add('show');
}

function renderLevelSelect(){
  const grid = document.getElementById('ls-grid'); grid.innerHTML='';
  const mkCard=(html,cls,fn)=>{
    const d=document.createElement('div'); d.className='ls-card '+(cls||'');
    d.innerHTML=html; if(fn) d.addEventListener('click',fn); grid.appendChild(d); return d;
  };
  const bb=currentLevelBest['builtin']||0;
  mkCard(
    `<span class="ls-card-badge official">OFFICIAL</span><div class="ls-card-name">STEREO MADNESS</div><div class="ls-card-sub">LEVEL 1 • EASY</div>${bb?`<div class="ls-card-best">★ BEST: ${bb}%</div>`:'<div class="ls-card-sub">NOT PLAYED YET</div>'}`,
    'builtin',
    ()=>{ document.getElementById('levelselect-screen').classList.remove('show'); startBuiltinLevel(); }
  );
  const bd=currentLevelBest['builtin2']||0;
  mkCard(
    `<span class="ls-card-badge official">OFFICIAL</span><div class="ls-card-name">BACK ON TRACK</div><div class="ls-card-sub">LEVEL 2 • MEDIUM</div>${bd?`<div class="ls-card-best">★ BEST: ${bd}%</div>`:'<div class="ls-card-sub">NOT PLAYED YET</div>'}`,
    'builtin',
    ()=>{ document.getElementById('levelselect-screen').classList.remove('show'); startBuiltinLevel2(); }
  );
  savedLevels.forEach((lvl,i)=>{
    const cb=currentLevelBest['custom_'+i]||0;
    const card=mkCard(
      `<span class="ls-card-badge custom">CUSTOM</span><div class="ls-card-name">${lvl.name}</div><div class="ls-card-sub">${lvl.objects.length} OBJECTS</div>${cb?`<div class="ls-card-best">★ BEST: ${cb}%</div>`:'<div class="ls-card-sub">NOT PLAYED YET</div>'}<button class="ls-card-del" title="Delete">🗑</button>`,
      ''
    );
    card.querySelector('.ls-card-del').addEventListener('click', e=>{
      e.stopPropagation();
      if(confirm('Delete "'+lvl.name+'"?')){ delete currentLevelBest['custom_'+i]; savedLevels.splice(i,1); saveGame(); renderLevelSelect(); }
    });
    card.addEventListener('click',()=>{
      document.getElementById('levelselect-screen').classList.remove('show');
      currentLevelId='custom_'+i;
      levelObjects=JSON.parse(JSON.stringify(lvl.objects));
      best=currentLevelBest['custom_'+i]||0;
      _beginPlay();
    });
  });
  // "New Level" card
  const nc=document.createElement('div'); nc.className='ls-card';
  nc.style.cssText='border-style:dashed;border-color:rgba(0,200,255,.15);align-items:center;justify-content:center;min-height:90px;display:flex;flex-direction:column;';
  nc.innerHTML='<div style="color:#334;font-size:26px">+</div><div style="color:#334;font-size:10px;letter-spacing:2px">NEW LEVEL</div>';
  nc.addEventListener('click',()=>{ document.getElementById('levelselect-screen').classList.remove('show'); openEditorFromTitle(); });
  grid.appendChild(nc);
}

// ─── INPUT ───────────────────────────────────────────────────
document.addEventListener('keydown', e=>{
  if(e.code==='Space'||e.code==='ArrowUp'){
    e.preventDefault();
    if(gameState==='playing'){ jumpBuffer=BUFFER; jumpHeld=true; }
    else if(gameState==='paused') resumeGame();
  }
  if(e.code==='KeyR' && (gameState==='playing'||gameState==='dead'||gameState==='paused')) restartGame();
  if(e.code==='Escape'){
    if(gameState==='playing') pauseGame();
    else if(gameState==='paused') resumeGame();
  }
  if(document.getElementById('editor-screen').classList.contains('show')){
    if(e.code==='KeyQ'){ e.preventDefault(); setEdRotation(edRotation-1); }
    if(e.code==='KeyE'){ e.preventDefault(); setEdRotation(edRotation+1); }
  }
});
document.addEventListener('keyup', e=>{ if(e.code==='Space'||e.code==='ArrowUp') jumpHeld=false; });
canvas.addEventListener('mousedown', ()=>{ if(gameState==='playing'){ jumpBuffer=BUFFER; jumpHeld=true; } });
canvas.addEventListener('mouseup',   ()=>jumpHeld=false);
canvas.addEventListener('touchstart', e=>{ e.preventDefault(); if(gameState==='playing'){ jumpBuffer=BUFFER; jumpHeld=true; } },{passive:false});
canvas.addEventListener('touchend',  ()=>jumpHeld=false);

// ─── ICON KIT ────────────────────────────────────────────────
function renderIkGrid(){
  const grid=document.getElementById('ik-grid'); if(!grid) return;
  grid.innerHTML='';
  ICONS.forEach((_,i)=>{
    const cv=document.createElement('canvas'); cv.width=50; cv.height=50;
    cv.className='ik-cell'+(i===selectedIcon?' selected':'');
    const c=cv.getContext('2d'); c.save(); c.translate(25,25); drawIconAt(c,i,playerColor1,playerColor2,40); c.restore();
    cv.addEventListener('click',()=>{ selectedIcon=i; renderIkGrid(); renderIkPreview(); });
    grid.appendChild(cv);
  });
}
function renderIkPreview(){
  const pc=document.getElementById('ik-preview'); if(!pc) return;
  const c=pc.getContext('2d'); c.clearRect(0,0,56,56); c.save(); c.translate(28,28);
  drawIconAt(c,selectedIcon,playerColor1,playerColor2,44); c.restore();
  document.getElementById('ik-preview-label').textContent='Icon '+(selectedIcon+1);
}
function updateIconColors(){
  playerColor1=document.getElementById('ik-col1').value;
  playerColor2=document.getElementById('ik-col2').value;
  renderIkGrid(); renderIkPreview();
}
function openIconKitPanel(){
  showPanel('pause-iconkit');
  document.getElementById('ik-drawer').classList.remove('show');
  renderIkGrid(); renderIkPreview();
}

// ─── ICON DRAWER ─────────────────────────────────────────────
const IKD_COLS=16, IKD_ROWS=16, IKD_PX=15;
let ikdPixels=Array.from({length:IKD_ROWS},()=>Array(IKD_COLS).fill(null));
let ikdTool='draw', ikdColor='#00eaff', ikdMouseDown=false, ikdEventsInit=false;
const IKD_PALETTE=['#00eaff','#0055ff','#ff4444','#ff8800','#ffdd00','#00ff88','#aa00ff','#ff00aa','#ffffff','#aaaaaa','#555555','#000000','#003355','transparent'];

function openIconDrawer(){
  ['ik-preview-wrap','ik-grid','ik-colors','ik-kit-bottom-btns','pause-iconkit-title'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  document.getElementById('ik-drawer').classList.add('show');
  buildIkdPalette(); ikdRedraw(); initIkdEvents();
}
function closeIconDrawer(){
  document.getElementById('ik-drawer').classList.remove('show');
  ['ik-preview-wrap','ik-grid','ik-colors','ik-kit-bottom-btns','pause-iconkit-title'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='';
  });
  renderIkGrid(); renderIkPreview();
}
function buildIkdPalette(){
  const pal=document.getElementById('ikd-palette'); pal.innerHTML='';
  IKD_PALETTE.forEach(col=>{
    const sw=document.createElement('div');
    sw.className='ikd-swatch'+(col===ikdColor?' selected':'');
    sw.style.background=col==='transparent'?'repeating-conic-gradient(#555 0% 25%,#333 0% 50%) 0 0/8px 8px':col;
    sw.addEventListener('click',()=>{ ikdColor=col; buildIkdPalette(); });
    pal.appendChild(sw);
  });
}
function setIkdTool(t){
  ikdTool=t;
  document.querySelectorAll('.ikd-tool-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('ikdt-'+t).classList.add('active');
}
function ikdPickColor(v){ ikdColor=v; buildIkdPalette(); }
function ikdClear(){ ikdPixels=Array.from({length:IKD_ROWS},()=>Array(IKD_COLS).fill(null)); ikdRedraw(); }
function ikdPaint(col,row){
  if(col<0||col>=IKD_COLS||row<0||row>=IKD_ROWS) return;
  if(ikdTool==='draw')       ikdPixels[row][col]=ikdColor==='transparent'?null:ikdColor;
  else if(ikdTool==='erase') ikdPixels[row][col]=null;
  else if(ikdTool==='fill')  ikdFloodFill(col,row,ikdPixels[row][col],ikdColor==='transparent'?null:ikdColor);
  ikdRedraw();
}
function ikdFloodFill(col,row,target,repl){
  if(target===repl) return;
  const stack=[[col,row]];
  while(stack.length){
    const[c,r]=stack.pop();
    if(c<0||c>=IKD_COLS||r<0||r>=IKD_ROWS||ikdPixels[r][c]!==target) continue;
    ikdPixels[r][c]=repl; stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
}
function ikdRedraw(){
  const cv=document.getElementById('ikd-canvas'); if(!cv) return;
  const c=cv.getContext('2d'); c.clearRect(0,0,cv.width,cv.height);
  for(let r=0;r<IKD_ROWS;r++) for(let col=0;col<IKD_COLS;col++){
    c.fillStyle=(col+r)%2===0?'#1a1a2e':'#111122'; c.fillRect(col*IKD_PX,r*IKD_PX,IKD_PX,IKD_PX);
    if(ikdPixels[r][col]){ c.fillStyle=ikdPixels[r][col]; c.fillRect(col*IKD_PX,r*IKD_PX,IKD_PX,IKD_PX); }
  }
  c.strokeStyle='rgba(0,200,255,.1)'; c.lineWidth=1;
  for(let i=0;i<=IKD_COLS;i++){ c.beginPath(); c.moveTo(i*IKD_PX,0); c.lineTo(i*IKD_PX,cv.height); c.stroke(); }
  for(let i=0;i<=IKD_ROWS;i++){ c.beginPath(); c.moveTo(0,i*IKD_PX); c.lineTo(cv.width,i*IKD_PX); c.stroke(); }
  const pv=document.getElementById('ikd-preview-big'); if(!pv) return;
  const pc=pv.getContext('2d'); pc.clearRect(0,0,68,68); const px=68/IKD_COLS;
  for(let r=0;r<IKD_ROWS;r++) for(let col=0;col<IKD_COLS;col++){
    if(ikdPixels[r][col]){ pc.fillStyle=ikdPixels[r][col]; pc.fillRect(col*px,r*px,px,px); }
  }
}
function ikdSave(){
  const snap=ikdPixels.map(row=>[...row]);
  ICONS.push((c,p,s,size)=>{
    const cs=size/IKD_COLS;
    for(let r=0;r<IKD_ROWS;r++) for(let col=0;col<IKD_COLS;col++){
      if(snap[r][col]){ c.fillStyle=snap[r][col]; c.fillRect(-size/2+col*cs,-size/2+r*cs,cs,cs); }
    }
  });
  selectedIcon=ICONS.length-1; closeIconDrawer();
}
function initIkdEvents(){
  if(ikdEventsInit) return; ikdEventsInit=true;
  const cv=document.getElementById('ikd-canvas');
  const paint=e=>{ const[col,row]=[Math.floor(e.offsetX/IKD_PX),Math.floor(e.offsetY/IKD_PX)]; ikdPaint(col,row); };
  cv.addEventListener('mousedown', e=>{ ikdMouseDown=true; paint(e); });
  cv.addEventListener('mousemove', e=>{ if(ikdMouseDown) paint(e); });
  cv.addEventListener('mouseup',   ()=>ikdMouseDown=false);
  cv.addEventListener('mouseleave',()=>ikdMouseDown=false);
}

// ─── EDITOR ──────────────────────────────────────────────────
const edCanvas=document.getElementById('editor-canvas');
const edCtx=edCanvas.getContext('2d');
let edCamX=0, edTool='spike', edMouseDown=false, edMX=0, edMY=0;
let edObjects=[], currentEditorLevelName='', edPrevFrom='title', edRotation=0;

const ED_DEFS={
  spike:        ()=>({type:'spike',w:GRID,h:GRID}),
  halfspike:    ()=>({type:'halfspike',w:GRID,h:GRID/2}),
  block:        ()=>({type:'block',w:GRID,h:GRID}),
  slab:         ()=>({type:'slab',w:GRID,h:GRID/2}),
  orb:          ()=>({type:'orb',w:28,h:28}),
  jumppad:      ()=>({type:'jumppad',w:GRID,h:10}),
  'portal-ship':()=>({type:'portal',toMode:'ship',w:34,h:140}),
  'portal-cube':()=>({type:'portal',toMode:'cube',w:34,h:140}),
  deco:         ()=>({type:'deco',w:GRID,h:GRID,color:'#1a1a3a'}),
  'deco-black': ()=>({type:'deco-black',w:GRID,h:GRID}),
  end:          ()=>({type:'end',w:10,h:200}),
};

function initEditor(){
  const wrap=document.getElementById('editor-canvas-wrap');
  const ew=Math.max(wrap.clientWidth||900,900);
  edCanvas.width=ew; edCanvas.height=H+80;
  edObjects=JSON.parse(JSON.stringify(customLevelObjects));
  edCamX=0; updateEdCount(); drawEditor();
}
function setEdTool(t){
  edTool=t;
  document.querySelectorAll('.etbtn[id^=etool-]').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('etool-'+t); if(el) el.classList.add('active');
  document.getElementById('ed-tool-label').textContent='Tool: '+t;
}
function setEdRotation(r){
  edRotation=((r%4)+4)%4;
  ['ed-rot0','ed-rot1','ed-rot2','ed-rot3'].forEach((id,i)=>{
    const el=document.getElementById(id); if(el) el.classList.toggle('active',i===edRotation);
  });
  document.getElementById('ed-rot-label').textContent=['↑ UP','→ RIGHT','↓ DOWN','← LEFT'][edRotation];
  drawEditor();
}
function edSnapX(px){ return Math.floor((px+edCamX)/GRID)*GRID; }
function edSnapY(py){ return Math.min(Math.floor(py/GRID)*GRID, GROUND-GRID); }

function edPlaceAt(px,py){
  if(edTool==='erase'){ edEraseAt(px,py); return; }
  const def=ED_DEFS[edTool]; if(!def) return;
  const obj=Object.assign(def(),{x:edSnapX(px),y:edSnapY(py)});
  if(edTool==='spike'||edTool==='portal-ship'||edTool==='portal-cube') obj.rotation=edRotation;
  if(edTool==='slab')    obj.y=Math.min(Math.floor(py/GRID)*GRID+(GRID/2),GROUND-(GRID/2));
  if(edTool==='jumppad') obj.y=GROUND-10;
  if(edTool==='end')     obj.y=GROUND-200;
  if(!edObjects.find(o=>o.type===obj.type&&o.x===obj.x&&o.y===obj.y)){
    edObjects.push(obj); updateEdCount(); drawEditor();
  }
}
function edEraseAt(px,py){
  const wx=px+edCamX;
  for(let i=edObjects.length-1;i>=0;i--){
    const o=edObjects[i];
    if(wx>=o.x&&wx<=o.x+(o.w||GRID)&&py>=o.y&&py<=o.y+(o.h||GRID)){
      edObjects.splice(i,1); updateEdCount(); drawEditor(); return;
    }
  }
}
function updateEdCount(){ document.getElementById('ed-count').textContent='Objects: '+edObjects.length; }
function clearEditor(){ if(confirm('Clear all?')){ edObjects=[]; updateEdCount(); drawEditor(); } }

function drawEditor(){
  const ew=edCanvas.width, eh=edCanvas.height;
  edCtx.fillStyle='#090918'; edCtx.fillRect(0,0,ew,eh);
  edCtx.strokeStyle='rgba(0,80,180,.15)'; edCtx.lineWidth=1;
  for(let gx=-(edCamX%GRID);gx<ew;gx+=GRID){ edCtx.beginPath(); edCtx.moveTo(gx,0); edCtx.lineTo(gx,eh); edCtx.stroke(); }
  for(let gy=0;gy<eh;gy+=GRID){ edCtx.beginPath(); edCtx.moveTo(0,gy); edCtx.lineTo(ew,gy); edCtx.stroke(); }
  edCtx.strokeStyle='#00eaff'; edCtx.lineWidth=2;
  const edGround=Math.round(GROUND/GRID)*GRID;
  edCtx.beginPath(); edCtx.moveTo(0,edGround); edCtx.lineTo(ew,edGround); edCtx.stroke();
  edObjects.forEach(o=>{
    const sx=o.x-edCamX; if(sx>ew+110||sx+(o.w||GRID)<-110) return;
    if(o.type==='spike'||o.type==='halfspike'){
      const rot=(o.rotation||0)*Math.PI/2;
      edCtx.save(); edCtx.translate(sx+o.w/2,o.y+o.h/2); edCtx.rotate(rot);
      edCtx.fillStyle='#fff'; edCtx.beginPath(); edCtx.moveTo(-o.w/2,o.h/2); edCtx.lineTo(0,-o.h/2); edCtx.lineTo(o.w/2,o.h/2); edCtx.closePath(); edCtx.fill();
      edCtx.restore();
    } else if(o.type==='block'){
      edCtx.fillStyle='#555'; edCtx.fillRect(sx,o.y,o.w,o.h);
      edCtx.fillStyle='#888'; edCtx.fillRect(sx,o.y,o.w,3);
      edCtx.strokeStyle='rgba(255,255,255,.2)'; edCtx.lineWidth=1; edCtx.strokeRect(sx,o.y,o.w,o.h);
    } else if(o.type==='slab'){
      edCtx.fillStyle='#445566'; edCtx.fillRect(sx,o.y,o.w,o.h);
      edCtx.strokeStyle='rgba(255,255,255,.3)'; edCtx.lineWidth=1; edCtx.strokeRect(sx,o.y,o.w,o.h);
    } else if(o.type==='orb'){
      const cx=sx+o.w/2,cy=o.y+o.h/2,r=o.w/2;
      edCtx.beginPath(); edCtx.arc(cx,cy,r,0,Math.PI*2); edCtx.fillStyle='#ffdd00'; edCtx.fill();
      edCtx.fillStyle='#fff'; edCtx.beginPath(); edCtx.arc(cx,cy,r*.4,0,Math.PI*2); edCtx.fill();
    } else if(o.type==='jumppad'){
      edCtx.fillStyle='#ffaa00'; edCtx.fillRect(sx,o.y,o.w,o.h);
      edCtx.fillStyle='#fff'; edCtx.beginPath(); edCtx.moveTo(sx+o.w/2,o.y-8); edCtx.lineTo(sx+o.w*.25,o.y+2); edCtx.lineTo(sx+o.w*.75,o.y+2); edCtx.closePath(); edCtx.fill();
    } else if(o.type==='portal'){
      const col=o.toMode==='ship'?'#aa44ff':'#44ffaa';
      edCtx.strokeStyle=col; edCtx.lineWidth=2; edCtx.strokeRect(sx,o.y,o.w,o.h);
      edCtx.fillStyle=col+'44'; edCtx.fillRect(sx,o.y,o.w,o.h);
      edCtx.fillStyle=col; edCtx.font='8px Arial Black'; edCtx.fillText(o.toMode==='ship'?'SHIP':'CUBE',sx+2,o.y+12);
    } else if(o.type==='deco'){
      edCtx.fillStyle=o.color||'#1a1a3a'; edCtx.fillRect(sx,o.y,o.w,o.h);
      edCtx.strokeStyle='rgba(0,200,255,.2)'; edCtx.lineWidth=1; edCtx.strokeRect(sx,o.y,o.w,o.h);
    } else if(o.type==='deco-black'){
      edCtx.fillStyle='#000'; edCtx.fillRect(sx,o.y,o.w,o.h);
      edCtx.strokeStyle='#222'; edCtx.lineWidth=1; edCtx.strokeRect(sx,o.y,o.w,o.h);
    } else if(o.type==='end'){
      edCtx.fillStyle='rgba(0,255,136,0.12)'; edCtx.fillRect(sx,0,o.w,eh);
      edCtx.strokeStyle='#0f8'; edCtx.lineWidth=2;
      edCtx.beginPath(); edCtx.moveTo(sx,0); edCtx.lineTo(sx,eh); edCtx.stroke();
      edCtx.fillStyle='#0f8'; edCtx.font='bold 10px Arial Black'; edCtx.fillText('FINISH',sx+4,eh/2);
    }
  });
  // Ghost preview of current tool
  if(edTool!=='erase'){
    const def=ED_DEFS[edTool]; if(def){
      const g=def(); let gy2, gx2=edSnapX(edMX)-edCamX;
      if(edTool==='jumppad')    gy2=GROUND-10;
      else if(edTool==='end')   gy2=0;
      else if(edTool==='slab')  gy2=Math.min(Math.floor(edMY/GRID)*GRID+(GRID/2),GROUND-(GRID/2));
      else                      gy2=edSnapY(edMY);
      edCtx.globalAlpha=.35;
      const gc={'spike':'#f44','halfspike':'#f44','orb':'#ffdd00','jumppad':'#ffaa00','portal-ship':'#aa44ff','portal-cube':'#44ffaa','deco':'#334','deco-black':'#000'};
      edCtx.fillStyle=gc[edTool]||'#0088ff';
      if(edTool==='spike'||edTool==='halfspike'){
        edCtx.save(); edCtx.translate(gx2+g.w/2,gy2+g.h/2); edCtx.rotate(edRotation*Math.PI/2);
        edCtx.beginPath(); edCtx.moveTo(-g.w/2,g.h/2); edCtx.lineTo(0,-g.h/2); edCtx.lineTo(g.w/2,g.h/2); edCtx.closePath(); edCtx.fill();
        edCtx.restore();
      } else {
        edCtx.fillRect(gx2,gy2,g.w,g.h);
      }
      edCtx.globalAlpha=1;
    }
  }
  // X-axis ruler
  edCtx.fillStyle='rgba(0,200,255,.3)'; edCtx.font='9px Arial';
  for(let gx=-(edCamX%200);gx<ew;gx+=200) edCtx.fillText(Math.round(gx+edCamX),gx+2,eh-4);
}

edCanvas.addEventListener('mousedown', e=>{ e.preventDefault(); edMouseDown=true; if(e.button===2){edEraseAt(e.offsetX,e.offsetY);return;} edPlaceAt(e.offsetX,e.offsetY); });
edCanvas.addEventListener('mousemove', e=>{
  edMX=e.offsetX; edMY=e.offsetY;
  document.getElementById('ed-coords').textContent='x:'+edSnapX(edMX)+' y:'+edSnapY(edMY);
  if(edMouseDown){ if(e.buttons===2||edTool==='erase') edEraseAt(e.offsetX,e.offsetY); else edPlaceAt(e.offsetX,e.offsetY); }
  drawEditor();
});
edCanvas.addEventListener('mouseup',    ()=>edMouseDown=false);
edCanvas.addEventListener('mouseleave', ()=>edMouseDown=false);
edCanvas.addEventListener('contextmenu',e=>e.preventDefault());
edCanvas.addEventListener('wheel', e=>{ e.preventDefault(); edCamX=Math.max(0,edCamX+e.deltaY*1.5); drawEditor(); },{passive:false});

function playCustom(){
  customLevelObjects=JSON.parse(JSON.stringify(edObjects));
  if(!customLevelObjects.find(o=>o.type==='end')){
    const maxX=customLevelObjects.length?Math.max(...customLevelObjects.map(o=>o.x)):500;
    customLevelObjects.push({type:'end',x:maxX+400,y:GROUND-200,w:10,h:200});
  }
  const name=(currentEditorLevelName||prompt('Name your level:','My Level')||'My Level').trim()||'My Level';
  currentEditorLevelName=name;
  const ei=savedLevels.findIndex(l=>l.name===name);
  if(ei>=0) savedLevels[ei].objects=JSON.parse(JSON.stringify(customLevelObjects));
  else savedLevels.push({name,objects:JSON.parse(JSON.stringify(customLevelObjects))});
  const idx=savedLevels.findIndex(l=>l.name===name);
  currentLevelId='custom_'+idx;
  levelObjects=JSON.parse(JSON.stringify(customLevelObjects));
  best=currentLevelBest['custom_'+idx]||0;
  hideAll(); saveGame(); _beginPlay();
}
function openEditorFromTitle(){ edPrevFrom='title'; currentEditorLevelName=''; hideAll(); initEditor(); document.getElementById('editor-screen').classList.add('show'); }
function openEditorFromPause(){ edPrevFrom='pause'; document.getElementById('pause-screen').classList.remove('show'); initEditor(); document.getElementById('editor-screen').classList.add('show'); }
function closeEditor(){
  customLevelObjects=JSON.parse(JSON.stringify(edObjects)); hideAll();
  if(edPrevFrom==='pause') document.getElementById('pause-screen').classList.add('show');
  else document.getElementById('title-screen').classList.add('show');
}
function openHomePage(){
  document.getElementById('homepage-btn').innerHTML = '<a href="index.html">';
}
// ─── UPLOAD & BROWSE LEVELS ──────────────────────────────────
let uploaderId='', browseCurrentLevelId='';

function getOrCreateUploaderId(){
  if(!uploaderId){
    const saved=localStorage.getItem('trun_uploader_id');
    if(saved) uploaderId=saved;
    else{
      const chars='abcdefghijklmnopqrstuvwxyz0123456789';
      let id='user_';
      for(let i=0;i<12;i++) id+=chars[Math.floor(Math.random()*chars.length)];
      uploaderId=id;
      localStorage.setItem('trun_uploader_id',uploaderId);
    }
  }
  return uploaderId;
}

function uploadLevel(){
  if(edObjects.length===0){ alert('Cannot upload empty level'); return; }
  if(!currentUser){ openAuthModal(); return; }
  const name=prompt('Level name:',currentEditorLevelName||'My Level');
  if(!name) return;
  const trimmed=name.trim();
  if(trimmed.length===0) return;
  if(trimmed.length>100){ alert('Level name too long (max 100 chars)'); return; }
  
  // 1. Compression: encode all properties so rotation, portals, and deco colors survive the round-trip
  const rawString = edObjects.map(obj => {
    return [obj.type, obj.x, obj.y, obj.w||30, obj.h||30, obj.rotation||'', obj.toMode||'', obj.color||''].join(',');
  }).join(';');
  const compressedDataString = btoa(rawString);

  const button=document.querySelector('.etbtn.blue');
  button.disabled=true;
  button.textContent='⬆ UPLOADING...';
  
  // 2. We pass the lightweight compressed text string as the network payload
  const payload={
    name: trimmed,
    objects: compressedDataString
  };
  
  authFetch('/api/levels/upload',{method:'POST',body:payload})
    .then(r=>r.json())
    .then(d=>{
      if(d.success){
        alert(`✓ Level uploaded! ID: ${d.id}`);
        currentEditorLevelName=trimmed;
      } else alert('Upload failed: '+(d.error||'Unknown error'));
      button.disabled=false;
      button.textContent='⬆ UPLOAD';
    })
    .catch(e=>{
      alert('Upload error: '+e.message);
      button.disabled=false;
      button.textContent='⬆ UPLOAD';
    });
}

function openBrowseLevels(){
  hideAll();
  document.getElementById('browselevels-screen').classList.add('show');
  fetchBrowseLevels();
}

function closeBrowseLevels(){
  hideAll();
  document.getElementById('title-screen').classList.add('show');
}

// ─── BROWSE SORT ─────────────────────────────────────────────
let currentBrowseSort='recent';

function setBrowseSort(sort,btn){
  currentBrowseSort=sort;
  document.querySelectorAll('.bl-sort-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  fetchBrowseLevels();
}

// ─── SEARCH ──────────────────────────────────────────────────
let currentSearchTab='levels';
let searchDebounce=null;

function openSearchScreen(type){
  hideAll();
  document.getElementById('search-screen').classList.add('show');
  currentSearchTab=type||'levels';
  document.getElementById('search-input').value='';
  document.getElementById('search-levels-grid').innerHTML='';
  document.getElementById('search-users-grid').innerHTML='';
  document.getElementById('search-empty').style.display='none';
  document.getElementById('search-loading').style.display='none';
  document.getElementById('search-title').textContent=currentSearchTab==='levels'?'SEARCH LEVELS':'SEARCH USERS';
  document.querySelectorAll('.search-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.search-tab')[currentSearchTab==='levels'?0:1].classList.add('active');
  document.getElementById('search-levels-grid').style.display=currentSearchTab==='levels'?'grid':'none';
  document.getElementById('search-users-grid').style.display=currentSearchTab==='users'?'grid':'none';
  setTimeout(()=>document.getElementById('search-input').focus(),100);
}

function closeSearchScreen(){
  hideAll();
  document.getElementById('browselevels-screen').classList.add('show');
}

function switchSearchTab(tab,btn){
  currentSearchTab=tab;
  document.querySelectorAll('.search-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('search-levels-grid').style.display=tab==='levels'?'grid':'none';
  document.getElementById('search-users-grid').style.display=tab==='users'?'grid':'none';
  document.getElementById('search-title').textContent=tab==='levels'?'SEARCH LEVELS':'SEARCH USERS';
  document.getElementById('search-empty').style.display='none';
  doSearch();
}

function doSearch(){
  const q=document.getElementById('search-input').value.trim();
  const loading=document.getElementById('search-loading');
  const empty=document.getElementById('search-empty');
  const lvlGrid=document.getElementById('search-levels-grid');
  const usrGrid=document.getElementById('search-users-grid');

  if(!q){ lvlGrid.innerHTML=''; usrGrid.innerHTML=''; empty.style.display='none'; return; }

  loading.style.display='block';
  empty.style.display='none';

  if(currentSearchTab==='levels'){
    fetch(`/api/levels/search?q=${encodeURIComponent(q)}`)
      .then(r=>r.json())
      .then(d=>{
        loading.style.display='none';
        lvlGrid.innerHTML='';
        if(d.levels.length===0){
          empty.textContent='No levels found';
          empty.style.display='block';
          return;
        }
        d.levels.forEach(l=>{
          const card=document.createElement('div');
          card.className='bl-card';
          const date=new Date(l.uploadedAt).toLocaleDateString();
          const displayName=l.uploaderDisplayName||l.uploaderId||'Anonymous';
          card.innerHTML=`
            <div class="bl-card-name">${l.name}</div>
            <div class="bl-card-uploader">by ${displayName}</div>
            <div class="bl-card-date">${date}</div>
            <div class="bl-card-downloads">📥 ${l.downloads} ⭐ ${l.likes||0}</div>
          `;
          card.addEventListener('click',()=>previewLevel(l.id));
          lvlGrid.appendChild(card);
        });
      })
      .catch(()=>{
        loading.style.display='none';
        empty.textContent='Search failed';
        empty.style.display='block';
      });
  } else {
    fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
      .then(r=>r.json())
      .then(d=>{
        loading.style.display='none';
        usrGrid.innerHTML='';
        if(d.users.length===0){
          empty.textContent='No users found';
          empty.style.display='block';
          return;
        }
        d.users.forEach(u=>{
          const card=document.createElement('div');
          card.className='search-user-card';
          const initial=(u.displayName||u.username).charAt(0).toUpperCase();
          card.innerHTML=`
            <div class="search-user-avatar">${initial}</div>
            <div class="search-user-name">${u.username}</div>
            <div class="search-user-display">${u.displayName||u.username}</div>
            <div class="search-user-levels">📦 ${u.levelsUploaded} levels</div>
          `;
          card.addEventListener('click',()=>{
            closeSearchScreen();
            viewUserProfile(u.username);
          });
          usrGrid.appendChild(card);
        });
      })
      .catch(()=>{
        loading.style.display='none';
        empty.textContent='Search failed';
        empty.style.display='block';
      });
  }
}

function viewUserProfile(username){
  fetch(`/api/users/${username}`)
    .then(r=>r.json())
    .then(d=>{
      if(d.error){ alert(d.error); return; }
      hideAll();
      document.getElementById('profile-screen').classList.add('show');
      document.getElementById('profile-avatar').textContent=(d.displayName||d.username).charAt(0).toUpperCase();
      document.getElementById('profile-username').textContent=d.username;
      document.getElementById('profile-display').textContent='Display: '+(d.displayName||d.username);
      document.getElementById('profile-joined').textContent='Joined: '+new Date(d.createdAt).toLocaleDateString();
      document.getElementById('profile-stats').textContent='Levels uploaded: '+(d.levelsUploaded||0);
      document.getElementById('profile-edit').style.display='none';
      document.getElementById('profile-logout-btn').style.display=(currentUser && currentUser.username===d.username)?'inline-block':'none';
      const grid=document.getElementById('profile-levels-grid');
      grid.innerHTML='';
      if(d.levels.length===0){
        grid.innerHTML='<p style="grid-column:1/-1;color:#445;text-align:center;font-size:12px;">No levels uploaded yet</p>';
      } else {
        d.levels.forEach(l=>{
          const card=document.createElement('div');
          card.className='profile-lv-card';
          card.innerHTML=`
            <div class="profile-lv-name">${l.name}</div>
            <div class="profile-lv-meta">📥 ${l.downloads} • ${new Date(l.uploadedAt).toLocaleDateString()}</div>
          `;
          grid.appendChild(card);
        });
      }
    })
    .catch(e=>alert('Failed to load profile: '+e.message));
}

function fetchBrowseLevels(){
  const grid=document.getElementById('bl-grid');
  const loading=document.getElementById('bl-loading');
  grid.innerHTML='';
  loading.style.display='block';
  
  fetch(`/api/levels/recent?sort=${currentBrowseSort}`)
    .then(r=>r.json())
    .then(d=>{
      loading.style.display='none';
      if(d.levels.length===0){
        grid.innerHTML='<p style="grid-column:1/-1;color:#445;text-align:center;">No levels yet!</p>';
        return;
      }
      d.levels.forEach(l=>{
        const card=document.createElement('div');
        card.className='bl-card';
        const date=new Date(l.uploadedAt).toLocaleDateString();
        const displayName = l.uploaderDisplayName || l.uploaderId || 'Anonymous';
        card.innerHTML=`
          <div class="bl-card-name">${l.name}</div>
          <div class="bl-card-uploader">by ${displayName}</div>
          <div class="bl-card-date">${date}</div>
          <div class="bl-card-downloads">📥 ${l.downloads} ⭐ ${l.likes||0}</div>
        `;
        card.addEventListener('click',()=>previewLevel(l.id));
        grid.appendChild(card);
      });
    })
    .catch(e=>{
      loading.style.display='none';
      grid.innerHTML='<p style="grid-column:1/-1;color:#f44;text-align:center;">Failed to load levels</p>';
      console.error('Browse error:',e);
    });
}

function previewLevel(levelId){
  browseCurrentLevelId=levelId;
  const modal=document.getElementById('levelpreview-modal');
  const loading=document.getElementById('bl-loading');
  loading.style.display='block';
  
  fetch(`/api/levels/${levelId}`)
    .then(r=>r.json())
    .then(level=>{
      loading.style.display='none';
      document.getElementById('preview-level-name').textContent=level.name;
      const date=new Date(level.uploadedAt).toLocaleDateString();
      document.getElementById('preview-level-info').textContent=`By ${level.uploaderDisplayName || level.uploaderId || 'Anonymous'} • ${date} • ${level.downloads} downloads`;
      
      // Check if user can delete
      const delBtn=document.getElementById('preview-delete-btn');
      delBtn.style.display=(currentUser && currentUser.username===level.uploaderId)?'block':'none';
      
      // Draw preview
      drawLevelPreview(parseCompressedLevel(level.objects));
      modal.style.display='flex';
    })
    .catch(e=>{
      loading.style.display='none';
      alert('Failed to load level: '+e.message);
    });
}

function drawLevelPreview(objects){
  const cv=document.getElementById('preview-canvas');
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#01447a'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.fillStyle='#008cff'; ctx.fillRect(0,0,cv.width,cv.height-68);
  ctx.strokeStyle='#fff'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,cv.height-68); ctx.lineTo(cv.width,cv.height-68); ctx.stroke();
  
  objects.forEach(o=>{
    if(!o||!o.type) return;
    if(o.type==='spike'||o.type==='halfspike'){
      const rot=(o.rotation||0)*Math.PI/2;
      ctx.save(); ctx.translate(o.x+o.w/2,o.y+o.h/2); ctx.rotate(rot);
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.moveTo(-o.w/2,o.h/2); ctx.lineTo(0,-o.h/2); ctx.lineTo(o.w/2,o.h/2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if(o.type==='block'){
      ctx.fillStyle='#666'; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='#aaa'; ctx.fillRect(o.x,o.y,o.w,3);
    } else if(o.type==='slab'){
      ctx.fillStyle='#445566'; ctx.fillRect(o.x,o.y,o.w,o.h);
    } else if(o.type==='orb'){
      ctx.beginPath(); ctx.arc(o.x+o.w/2,o.y+o.h/2,o.w/2,0,Math.PI*2); ctx.fillStyle='#ffdd00'; ctx.fill();
    } else if(o.type==='jumppad'){
      ctx.fillStyle='#ffaa00'; ctx.fillRect(o.x,o.y,o.w,o.h);
    } else if(o.type==='portal'){
      ctx.strokeStyle=o.toMode==='ship'?'#aa44ff':'#44ffaa'; ctx.lineWidth=2; ctx.strokeRect(o.x,o.y,o.w,o.h);
    } else if(o.type==='deco'){
      ctx.fillStyle=o.color||'#1a1a3a'; ctx.fillRect(o.x,o.y,o.w,o.h);
    } else if(o.type==='deco-black'){
      ctx.fillStyle='#000'; ctx.fillRect(o.x,o.y,o.w,o.h);
    } else if(o.type==='end'){
      ctx.fillStyle='rgba(0,255,136,0.12)'; ctx.fillRect(o.x,0,o.w,cv.height);
      ctx.strokeStyle='#0f8'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(o.x,0); ctx.lineTo(o.x,cv.height); ctx.stroke();
    }
  });
}

function closeLevelPreview(){
  document.getElementById('levelpreview-modal').style.display='none';
}

// Helper parser function to reconstruct your blocks
function parseCompressedLevel(dataString) {
  if (!dataString || typeof dataString !== 'string') return dataString;
  try {
    const raw = atob(dataString);
    return raw.split(';').map(str => {
      const parts = str.split(',');
      const obj = {
        type: parts[0],
        x: parseInt(parts[1]),
        y: parseInt(parts[2]),
        w: parseInt(parts[3] || 30),
        h: parseInt(parts[4] || 30)
      };
      if (parts[5]) obj.rotation = parseInt(parts[5]);
      if (parts[6]) obj.toMode = parts[6];
      if (parts[7]) obj.color = parts[7];
      return obj;
    });
  } catch(e) {
    console.error("Parsing failed, structure might be corrupt:", e);
    return [];
  }
}

function loadBrowsedLevel(){
  if(!browseCurrentLevelId) return;
  fetch(`/api/levels/${browseCurrentLevelId}`)
    .then(r=>r.json())
    .then(level=>{
      // Convert the server string back into an object array for editing
      edObjects = parseCompressedLevel(level.objects);
      currentEditorLevelName=level.name;
      updateEdCount(); drawEditor();
      closeLevelPreview();
      closeBrowseLevels();
    })
    .catch(e=>alert('Failed to load level: '+e.message));
}

function playBrowsedLevel(){
  if(!browseCurrentLevelId) return;
  fetch(`/api/levels/${browseCurrentLevelId}`)
    .then(r=>r.json())
    .then(level=>{
      // Convert the server string back into an object array for gameplay
      customLevelObjects = parseCompressedLevel(level.objects);
      levelObjects=JSON.parse(JSON.stringify(customLevelObjects));
      if(!levelObjects.find(o=>o.type==='end')){
        const maxX=levelObjects.length?Math.max(...levelObjects.map(o=>o.x)):500;
        levelObjects.push({type:'end',x:maxX+400,y:GROUND-200,w:10,h:200});
      }
      currentLevelId='browsed_'+browseCurrentLevelId;
      best=0; attempts=0;
      hideAll(); closeLevelPreview(); closeBrowseLevels();
      saveGame(); _beginPlay();
    })
    .catch(e=>alert('Failed to load level: '+e.message));
}

function deleteCurrentBrowsedLevel(){
  if(!browseCurrentLevelId) return;
  if(!currentUser){ openAuthModal(); return; }
  if(!confirm('Delete this level? This cannot be undone.')) return;
  
  const delBtn=document.getElementById('preview-delete-btn');
  delBtn.disabled=true;
  delBtn.textContent='DELETING...';
  
  authFetch(`/api/levels/${browseCurrentLevelId}`,{method:'DELETE'})
    .then(r=>r.json())
    .then(d=>{
      if(d.success){
        alert('✓ Level deleted');
        closeLevelPreview();
        fetchBrowseLevels();
      } else alert('Delete failed: '+(d.error||'Unknown error'));
      delBtn.disabled=false;
      delBtn.textContent='DELETE';
    })
    .catch(e=>{
      alert('Delete error: '+e.message);
      delBtn.disabled=false;
      delBtn.textContent='DELETE';
    });
}

// ─── TITLE / LEVEL-SELECT STARS ──────────────────────────────
const tsCanvas=document.getElementById('title-stars'), tsCtx=tsCanvas.getContext('2d');
const lsCanvas=document.getElementById('ls-stars'),   lsCtx=lsCanvas.getContext('2d');
const blCanvas=document.getElementById('bl-stars'),   blCtx=blCanvas.getContext('2d');
const prCanvas=document.getElementById('profile-stars'), prCtx=prCanvas?prCanvas.getContext('2d'):null;
const srCanvas=document.getElementById('search-stars'), srCtx=srCanvas?srCanvas.getContext('2d'):null;
const STARS=Array.from({length:100},()=>({
  x:Math.random()*2000, y:Math.random()*800,
  vx:(Math.random()-.5)*.3, vy:(Math.random()-.5)*.1,
  r:Math.random()*2+.5
}));
function resizeStarCanvases(){ tsCanvas.width=lsCanvas.width=blCanvas.width=window.innerWidth; tsCanvas.height=lsCanvas.height=blCanvas.height=window.innerHeight; if(prCanvas){ prCanvas.width=window.innerWidth; prCanvas.height=window.innerHeight; } if(srCanvas){ srCanvas.width=window.innerWidth; srCanvas.height=window.innerHeight; } }
resizeStarCanvases();
window.addEventListener('resize', resizeStarCanvases);

const t0=Date.now();
// Bug fix: animateLsStars() was called in openLevelSelect() but never defined.
// This single loop already handles all canvases, so no extra call is needed.
function animateStars(){
  const t=(Date.now()-t0)*.001;
  STARS.forEach(s=>{
    s.x=(s.x+s.vx+tsCanvas.width)%tsCanvas.width;
    s.y=(s.y+s.vy+tsCanvas.height)%tsCanvas.height;
  });
  if(document.getElementById('title-screen').classList.contains('show')){
    tsCtx.clearRect(0,0,tsCanvas.width,tsCanvas.height);
    STARS.forEach(s=>{ tsCtx.globalAlpha=.4+.4*Math.sin(t+s.x*.01); tsCtx.fillStyle='#fff'; tsCtx.beginPath(); tsCtx.arc(s.x,s.y,s.r,0,Math.PI*2); tsCtx.fill(); });
    tsCtx.globalAlpha=1;
  }
  if(document.getElementById('levelselect-screen').classList.contains('show')){
    lsCtx.clearRect(0,0,lsCanvas.width,lsCanvas.height);
    STARS.forEach(s=>{ lsCtx.globalAlpha=.35+.35*Math.sin(t+s.y*.01); lsCtx.fillStyle='#fff'; lsCtx.beginPath(); lsCtx.arc(s.x,s.y,s.r,0,Math.PI*2); lsCtx.fill(); });
    lsCtx.globalAlpha=1;
  }
  if(document.getElementById('browselevels-screen').classList.contains('show')){
    blCtx.clearRect(0,0,blCanvas.width,blCanvas.height);
    STARS.forEach(s=>{ blCtx.globalAlpha=.35+.35*Math.sin(t+s.y*.01); blCtx.fillStyle='#fff'; blCtx.beginPath(); blCtx.arc(s.x,s.y,s.r,0,Math.PI*2); blCtx.fill(); });
    blCtx.globalAlpha=1;
  }
  if(prCtx && document.getElementById('profile-screen').classList.contains('show')){
    prCtx.clearRect(0,0,prCanvas.width,prCanvas.height);
    STARS.forEach(s=>{ prCtx.globalAlpha=.35+.35*Math.sin(t+s.x*.01); prCtx.fillStyle='#fff'; prCtx.beginPath(); prCtx.arc(s.x,s.y,s.r,0,Math.PI*2); prCtx.fill(); });
    prCtx.globalAlpha=1;
  }
  if(srCtx && document.getElementById('search-screen').classList.contains('show')){
    srCtx.clearRect(0,0,srCanvas.width,srCanvas.height);
    STARS.forEach(s=>{ srCtx.globalAlpha=.35+.35*Math.sin(t+s.y*.01); srCtx.fillStyle='#fff'; srCtx.beginPath(); srCtx.arc(s.x,s.y,s.r,0,Math.PI*2); srCtx.fill(); });
    srCtx.globalAlpha=1;
  }
  requestAnimationFrame(animateStars);
}
animateStars();

// ─── MAIN LOOP ───────────────────────────────────────────────
function loop(ts){
  requestAnimationFrame(loop);
  if(!lastTime) lastTime=ts;
  const dt=Math.min((ts-lastTime)/(1000/60),2);
  lastTime=ts;
  if(gameState==='playing')      { update(dt); gameDraw(); }
  else if(gameState==='dead')    { gameDraw(); }
}

// ─── BOOT ────────────────────────────────────────────────────
loadGame();
generateBuiltinLevel();
resetPlayer();
restoreSession();
updateTitleUserBar();
document.getElementById('search-input').addEventListener('input',()=>{
  clearTimeout(searchDebounce);
  searchDebounce=setTimeout(doSearch,300);
});
requestAnimationFrame(loop);
