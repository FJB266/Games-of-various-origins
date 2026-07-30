'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────
const W=2000, H=1000, GROUND=H-68;
const GRAVITY=0.90, JUMP_FORCE=-12.5, SPEED=5.7, BUFFER=10, GRID=34;
const SHIP_THRUST=-0.45, SHIP_GRAV=0.4, SHIP_MAXVY=8;
const ZOOM = 1.1; // >1 = zoomed in, <1 = zoomed out
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
  const OFFSET = G - GRID - 498;
  const sp = (x, y) => levelObjects.push({type:'spike', x, y: y !== undefined ? y : G-GRID, w:GRID, h:GRID, rotation:0});
  const bl = (x,y,w,h) => levelObjects.push({type:'block', x, y: (y ?? 498) + OFFSET, w:w??GRID, h:h??GRID});
  const sl = (x,y) => levelObjects.push({type:'slab', x, y: (y ?? 498) + OFFSET, w:GRID, h:GRID/2});
  const hs = (x,y) => levelObjects.push({type:'halfspike', x, y: (y ?? 498) + OFFSET, w:GRID, h:GRID/2});

  sp(595);
  sp(1139);
  sp(1683);
  sp(1649);
  bl(1717, 498, 34, 34);
  hs(1751, 515);
  hs(1785, 515);
  bl(1853, 464, 34, 34);
  hs(1819, 515);
  hs(1853, 515);
  hs(1887, 515);
  bl(1853, 498, 34, 34);
  hs(1921, 515);
  hs(1955, 515);
  bl(1989, 430, 34, 34);
  bl(1989, 464, 34, 34);
  bl(1989, 498, 34, 34);
  sp(2703);
  sp(2737);
  bl(2941, 498, 34, 34);
  bl(2975, 498, 34, 34);
  bl(3009, 498, 34, 34);
  bl(3043, 498, 34, 34);
  bl(3077, 498, 34, 34);
  bl(3111, 498, 34, 34);
  bl(3145, 498, 34, 34);
  bl(3179, 498, 34, 34);
  hs(3213, 515);
  hs(3247, 515);
  hs(3281, 515);
  bl(3315, 498, 34, 34);
  bl(3349, 498, 34, 34);
  bl(3383, 498, 34, 34);
  bl(3417, 498, 34, 34);
  bl(3451, 498, 34, 34);
  bl(3485, 498, 34, 34);
  levelObjects.push({type:'spike', x:3485, y:464, w:GRID, h:GRID, rotation:0});
  bl(3519, 498, 34, 34);
  bl(3553, 498, 34, 34);
  bl(3587, 498, 34, 34);
  bl(3621, 498, 34, 34);
  bl(3655, 498, 34, 34);
  hs(3689, 515);
  hs(3723, 515);
  hs(3757, 515);
  bl(3791, 464, 34, 34);
  bl(3791, 498, 34, 34);
  bl(3825, 464, 34, 34);
  bl(3825, 498, 34, 34);
  bl(3859, 464, 34, 34);
  bl(3893, 464, 34, 34);
  bl(3927, 464, 34, 34);
  bl(3961, 464, 34, 34);
  bl(3859, 498, 34, 34);
  bl(3893, 498, 34, 34);
  bl(3927, 498, 34, 34);
  bl(3961, 498, 34, 34);
  bl(3995, 464, 34, 34);
  bl(3995, 498, 34, 34);
  bl(4063, 464, 34, 34);
  bl(4029, 464, 34, 34);
  bl(4063, 498, 34, 34);
  bl(4029, 498, 34, 34);
  levelObjects.push({type:'spike', x:4029, y:430, w:GRID, h:GRID, rotation:0});
  bl(4131, 464, 34, 34);
  bl(4165, 464, 34, 34);
  bl(4097, 464, 34, 34);
  bl(4097, 498, 34, 34);
  bl(4131, 498, 34, 34);
  bl(4165, 498, 34, 34);
  hs(4267, 515);
  hs(4301, 515);
  bl(4233, 464, 34, 34);
  bl(4233, 498, 34, 34);
  bl(4199, 498, 34, 34);
  bl(4199, 464, 34, 34);
  hs(4335, 515);
  hs(4403, 515);
  hs(4369, 515);
  sl(4369, 437.93);
  hs(4437, 515);
  hs(4471, 515);
  hs(4505, 515);
  sl(4505, 403.93);
  hs(4539, 515);
  hs(4573, 515);
  hs(4607, 515);
  hs(4641, 515);
  sl(4641, 369.93);
  hs(4675, 515);
  hs(4709, 515);
  hs(4743, 515);
  hs(4777, 515);
  hs(4811, 515);
  hs(4845, 515);
  sl(4777, 335.93);
  hs(4879, 515);
  hs(4913, 515);
  hs(4947, 515);
  hs(4981, 515);
  sl(4913, 301.93);
  hs(5015, 515);
  hs(5049, 515);
  hs(5083, 515);
  bl(5049, 328, 34, 34);
  bl(5083, 328, 34, 34);
  bl(5117, 362, 34, 34);
  bl(5117, 396, 34, 34);
  bl(5117, 430, 34, 34);
  bl(5117, 464, 34, 34);
  bl(5117, 498, 34, 34);
  bl(5185, 328, 34, 34);
  bl(5151, 362, 34, 34);
  bl(5185, 362, 34, 34);
  bl(5185, 498, 34, 34);
  bl(5151, 498, 34, 34);
  bl(5151, 464, 34, 34);
  bl(5151, 430, 34, 34);
  bl(5185, 396, 34, 34);
  bl(5151, 396, 34, 34);
  bl(5185, 430, 34, 34);
  bl(5185, 464, 34, 34);
  bl(5151, 328, 34, 34);
  bl(5117, 328, 34, 34);
  bl(5219, 328, 34, 34);
  bl(5253, 328, 34, 34);
  bl(5287, 328, 34, 34);
  bl(5321, 328, 34, 34);
  bl(5219, 362, 34, 34);
  bl(5253, 362, 34, 34);
  bl(5287, 362, 34, 34);
  bl(5321, 362, 34, 34);
  bl(5321, 498, 34, 34);
  bl(5287, 498, 34, 34);
  bl(5253, 498, 34, 34);
  bl(5219, 498, 34, 34);
  bl(5219, 430, 34, 34);
  bl(5219, 396, 34, 34);
  bl(5219, 464, 34, 34);
  bl(5253, 464, 34, 34);
  bl(5287, 464, 34, 34);
  bl(5321, 464, 34, 34);
  bl(5321, 396, 34, 34);
  bl(5287, 396, 34, 34);
  bl(5253, 396, 34, 34);
  bl(5253, 430, 34, 34);
  bl(5287, 430, 34, 34);
  bl(5321, 430, 34, 34);
  levelObjects.push({type:'spike', x:5253, y:294, w:GRID, h:GRID, rotation:0});
  sl(5321, 267.93);
  levelObjects.push({type:'spike', x:5287, y:294, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5321, y:294, w:GRID, h:GRID, rotation:0});
  sl(5287, 267.93);
  bl(5355, 328, 34, 34);
  bl(5389, 328, 34, 34);
  bl(5423, 328, 34, 34);
  bl(5355, 362, 34, 34);
  bl(5389, 362, 34, 34);
  bl(5423, 362, 34, 34);
  bl(5423, 498, 34, 34);
  bl(5389, 498, 34, 34);
  bl(5355, 498, 34, 34);
  bl(5355, 464, 34, 34);
  bl(5389, 464, 34, 34);
  bl(5423, 464, 34, 34);
  bl(5423, 430, 34, 34);
  bl(5423, 396, 34, 34);
  bl(5389, 396, 34, 34);
  bl(5355, 396, 34, 34);
  bl(5355, 430, 34, 34);
  bl(5389, 430, 34, 34);
  levelObjects.push({type:'spike', x:5355, y:294, w:GRID, h:GRID, rotation:0});
  bl(5457, 328, 34, 34);
  bl(5457, 362, 34, 34);
  bl(5457, 396, 34, 34);
  bl(5457, 430, 34, 34);
  bl(5457, 464, 34, 34);
  bl(5457, 498, 34, 34);
  levelObjects.push({type:'spike', x:5525, y:294, w:GRID, h:GRID, rotation:0});
  bl(5491, 328, 34, 34);
  bl(5525, 328, 34, 34);
  bl(5491, 498, 34, 34);
  bl(5525, 498, 34, 34);
  bl(5525, 362, 34, 34);
  bl(5491, 362, 34, 34);
  bl(5491, 396, 34, 34);
  bl(5491, 430, 34, 34);
  bl(5525, 430, 34, 34);
  bl(5525, 464, 34, 34);
  bl(5525, 396, 34, 34);
  bl(5491, 464, 34, 34);
  sl(5559, 267.93);
  sl(5593, 267.93);
  levelObjects.push({type:'spike', x:5559, y:294, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5593, y:294, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5627, y:294, w:GRID, h:GRID, rotation:0});
  bl(5559, 328, 34, 34);
  bl(5593, 328, 34, 34);
  bl(5627, 328, 34, 34);
  bl(5661, 328, 34, 34);
  bl(5559, 498, 34, 34);
  bl(5593, 498, 34, 34);
  bl(5627, 498, 34, 34);
  bl(5661, 498, 34, 34);
  bl(5661, 396, 34, 34);
  bl(5627, 396, 34, 34);
  bl(5627, 362, 34, 34);
  bl(5593, 362, 34, 34);
  bl(5559, 362, 34, 34);
  bl(5559, 464, 34, 34);
  bl(5593, 464, 34, 34);
  bl(5627, 464, 34, 34);
  bl(5661, 464, 34, 34);
  bl(5661, 362, 34, 34);
  bl(5661, 430, 34, 34);
  bl(5627, 430, 34, 34);
  bl(5593, 430, 34, 34);
  bl(5559, 430, 34, 34);
  bl(5559, 396, 34, 34);
  bl(5593, 396, 34, 34);
  bl(5695, 328, 34, 34);
  bl(5729, 328, 34, 34);
  bl(5695, 498, 34, 34);
  bl(5729, 498, 34, 34);
  bl(5763, 498, 34, 34);
  bl(5763, 464, 34, 34);
  bl(5763, 430, 34, 34);
  bl(5763, 396, 34, 34);
  bl(5729, 362, 34, 34);
  bl(5695, 362, 34, 34);
  bl(5695, 396, 34, 34);
  bl(5695, 464, 34, 34);
  bl(5729, 464, 34, 34);
  bl(5729, 430, 34, 34);
  bl(5729, 396, 34, 34);
  bl(5695, 430, 34, 34);
  bl(5763, 328, 34, 34);
  bl(5763, 362, 34, 34);
  bl(5865, 498, 34, 34);
  bl(5831, 498, 34, 34);
  bl(5797, 498, 34, 34);
  bl(5797, 464, 34, 34);
  bl(5797, 430, 34, 34);
  bl(5797, 396, 34, 34);
  bl(5865, 464, 34, 34);
  bl(5831, 464, 34, 34);
  bl(5831, 430, 34, 34);
  bl(5831, 396, 34, 34);
  bl(5865, 396, 34, 34);
  bl(5865, 430, 34, 34);
  bl(5797, 362, 34, 34);
  bl(5831, 362, 34, 34);
  bl(5865, 362, 34, 34);
  bl(6001, 498, 34, 34);
  bl(5967, 498, 34, 34);
  bl(5933, 498, 34, 34);
  bl(5899, 498, 34, 34);
  bl(6001, 464, 34, 34);
  bl(5967, 464, 34, 34);
  bl(5933, 464, 34, 34);
  bl(5899, 464, 34, 34);
  bl(5899, 396, 34, 34);
  bl(5933, 396, 34, 34);
  bl(5967, 396, 34, 34);
  bl(6001, 396, 34, 34);
  bl(6001, 430, 34, 34);
  bl(5967, 430, 34, 34);
  bl(5933, 430, 34, 34);
  bl(5899, 430, 34, 34);
  bl(5899, 362, 34, 34);
  bl(5933, 362, 34, 34);
  bl(5967, 362, 34, 34);
  bl(6001, 362, 34, 34);
  sl(5899, 301.93);
  sl(5933, 301.93);
  sl(5967, 301.93);
  sl(6001, 301.93);
  levelObjects.push({type:'spike', x:5899, y:260, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5933, y:260, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5967, y:260, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:6001, y:260, w:GRID, h:GRID, rotation:0});
  bl(6069, 396, 34, 34);
  bl(6069, 430, 34, 34);
  bl(6069, 464, 34, 34);
  bl(6069, 498, 34, 34);
  bl(6035, 498, 34, 34);
  bl(6035, 396, 34, 34);
  bl(6035, 430, 34, 34);
  bl(6035, 464, 34, 34);
  bl(6035, 362, 34, 34);
  bl(6069, 362, 34, 34);
  bl(6103, 362, 34, 34);
  bl(6103, 396, 34, 34);
  bl(6103, 430, 34, 34);
  bl(6103, 498, 34, 34);
  bl(6103, 464, 34, 34);
  bl(6137, 328, 34, 34);
  bl(6137, 362, 34, 34);
  bl(6171, 328, 34, 34);
  bl(6205, 328, 34, 34);
  bl(6171, 362, 34, 34);
  bl(6205, 362, 34, 34);
  bl(6137, 396, 34, 34);
  bl(6171, 396, 34, 34);
  bl(6205, 396, 34, 34);
  bl(6137, 430, 34, 34);
  bl(6171, 430, 34, 34);
  bl(6205, 430, 34, 34);
  bl(6205, 498, 34, 34);
  bl(6171, 498, 34, 34);
  bl(6137, 498, 34, 34);
  bl(6205, 464, 34, 34);
  bl(6171, 464, 34, 34);
  bl(6137, 464, 34, 34);
  bl(6239, 396, 34, 34);
  bl(6239, 430, 34, 34);
  bl(6273, 430, 34, 34);
  bl(6307, 430, 34, 34);
  bl(6341, 430, 34, 34);
  bl(6341, 498, 34, 34);
  bl(6307, 498, 34, 34);
  bl(6273, 498, 34, 34);
  bl(6239, 498, 34, 34);
  bl(6239, 464, 34, 34);
  bl(6273, 464, 34, 34);
  bl(6307, 464, 34, 34);
  bl(6341, 464, 34, 34);
  bl(6273, 328, 34, 34);
  bl(6273, 362, 34, 34);
  bl(6273, 396, 34, 34);
  bl(6239, 328, 34, 34);
  bl(6341, 396, 34, 34);
  bl(6307, 396, 34, 34);
  bl(6239, 362, 34, 34);
  levelObjects.push({type:'spike', x:6273, y:294, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:6307, y:362, w:GRID, h:GRID, rotation:0});
  bl(6409, 396, 34, 34);
  bl(6375, 396, 34, 34);
  bl(6375, 430, 34, 34);
  bl(6409, 430, 34, 34);
  bl(6409, 464, 34, 34);
  bl(6409, 498, 34, 34);
  bl(6375, 498, 34, 34);
  bl(6375, 464, 34, 34);
  bl(6443, 396, 34, 34);
  bl(6443, 430, 34, 34);
  bl(6443, 464, 34, 34);
  bl(6443, 498, 34, 34);
  hs(6511, 515);
  hs(6545, 515);
  bl(6477, 430, 34, 34);
  bl(6477, 464, 34, 34);
  bl(6477, 498, 34, 34);
  bl(6477, 396, 34, 34);
  bl(6511, 396, 34, 34);
  bl(6545, 396, 34, 34);
  hs(6579, 515);
  hs(6613, 515);
  hs(6647, 515);
  hs(6681, 515);
  bl(6579, 396, 34, 34);
  bl(6613, 396, 34, 34);
  hs(6715, 515);
  hs(6749, 515);
  hs(6783, 515);
  sl(6715, 403.93);
  sl(6749, 403.93);
  sl(6783, 403.93);
  hs(6817, 515);
  hs(6851, 515);
  hs(6885, 515);
  sl(6885, 437.93);
  sl(6817, 403.93);
  levelObjects.push({type:'spike', x:6817, y:362, w:GRID, h:GRID, rotation:0});
  hs(6919, 515);
  hs(6953, 515);
  hs(6987, 515);
  hs(7021, 515);
  sl(6919, 437.93);
  sl(6953, 437.93);
  sl(6987, 437.93);
  sl(7021, 437.93);
  hs(7055, 515);
  hs(7089, 515);
  hs(7123, 515);
  sl(7055, 437.93);
  sl(7089, 437.93);
  levelObjects.push({type:'spike', x:7089, y:396, w:GRID, h:GRID, rotation:0});
  hs(7157, 515);
  hs(7191, 515);
  hs(7225, 515);
  sl(7157, 471.93);
  sl(7191, 471.93);
  sl(7225, 471.93);
  hs(7259, 515);
  hs(7293, 515);
  hs(7327, 515);
  hs(7361, 515);
  sl(7259, 471.93);
  sl(7293, 471.93);
  hs(7395, 515);
  hs(7429, 515);
  hs(7463, 515);
  sl(7429, 437.93);
  hs(7497, 515);
  sl(7565, 403.93);
  hs(7531, 515);
  hs(7565, 515);
  hs(7599, 515);
  hs(7633, 515);
  hs(7667, 515);
  hs(7701, 515);
  sl(7701, 369.93);
  hs(7735, 515);
  hs(7769, 515);
  hs(7803, 515);
  hs(7837, 515);
  hs(7871, 515);
  hs(7905, 515);
  sl(7837, 335.93);
  hs(7939, 515);
  hs(7973, 515);
  hs(8007, 515);
  hs(8041, 515);
  sl(7973, 301.93);
  bl(8041, 396, 34, 34);
  hs(8075, 515);
  hs(8109, 515);
  hs(8143, 515);
  bl(8109, 396, 34, 34);
  bl(8143, 396, 34, 34);
  sl(8109, 267.93);
  levelObjects.push({type:'spike', x:8109, y:226, w:GRID, h:GRID, rotation:0});
  bl(8075, 396, 34, 34);
  hs(8177, 515);
  hs(8211, 515);
  hs(8245, 515);
  bl(8177, 396, 34, 34);
  bl(8211, 396, 34, 34);
  bl(8245, 396, 34, 34);
  bl(8279, 430, 34, 34);
  bl(8279, 464, 34, 34);
  bl(8279, 498, 34, 34);
  bl(8313, 396, 34, 34);
  bl(8347, 396, 34, 34);
  bl(8381, 396, 34, 34);
  bl(8381, 498, 34, 34);
  bl(8347, 498, 34, 34);
  bl(8313, 498, 34, 34);
  bl(8313, 464, 34, 34);
  bl(8347, 464, 34, 34);
  bl(8381, 464, 34, 34);
  bl(8381, 430, 34, 34);
  bl(8347, 430, 34, 34);
  bl(8313, 430, 34, 34);
  bl(8279, 260, 34, 34);
  bl(8313, 260, 34, 34);
  bl(8347, 260, 34, 34);
  bl(8381, 260, 34, 34);
  bl(8279, 226, 34, 34);
  bl(8279, 192, 34, 34);
  bl(8313, 226, 34, 34);
  bl(8347, 226, 34, 34);
  bl(8381, 226, 34, 34);
  bl(8313, 192, 34, 34);
  bl(8347, 192, 34, 34);
  bl(8381, 192, 34, 34);
  bl(8279, 396, 34, 34);
  bl(8279, 158, 34, 34);
  bl(8279, 124, 34, 34);
  bl(8381, 158, 34, 34);
  bl(8347, 158, 34, 34);
  bl(8313, 158, 34, 34);
  bl(8313, 124, 34, 34);
  bl(8347, 124, 34, 34);
  bl(8381, 124, 34, 34);
  bl(8415, 396, 34, 34);
  bl(8449, 396, 34, 34);
  bl(8483, 396, 34, 34);
  bl(8483, 498, 34, 34);
  bl(8449, 498, 34, 34);
  bl(8415, 498, 34, 34);
  bl(8415, 464, 34, 34);
  bl(8449, 464, 34, 34);
  bl(8483, 464, 34, 34);
  bl(8483, 430, 34, 34);
  bl(8449, 430, 34, 34);
  bl(8415, 430, 34, 34);
  bl(8449, 294, 34, 34);
  bl(8483, 294, 34, 34);
  bl(8415, 260, 34, 34);
  bl(8449, 260, 34, 34);
  bl(8415, 226, 34, 34);
  bl(8449, 226, 34, 34);
  bl(8483, 226, 34, 34);
  bl(8483, 260, 34, 34);
  bl(8415, 192, 34, 34);
  bl(8449, 192, 34, 34);
  bl(8483, 192, 34, 34);
  bl(8483, 158, 34, 34);
  bl(8449, 158, 34, 34);
  bl(8415, 158, 34, 34);
  bl(8415, 124, 34, 34);
  bl(8449, 124, 34, 34);
  bl(8483, 124, 34, 34);
  bl(8517, 396, 34, 34);
  bl(8551, 396, 34, 34);
  bl(8585, 396, 34, 34);
  bl(8585, 498, 34, 34);
  bl(8551, 498, 34, 34);
  bl(8517, 498, 34, 34);
  bl(8517, 464, 34, 34);
  bl(8551, 464, 34, 34);
  bl(8585, 464, 34, 34);
  bl(8585, 430, 34, 34);
  bl(8551, 430, 34, 34);
  bl(8517, 430, 34, 34);
  bl(8517, 294, 34, 34);
  bl(8551, 294, 34, 34);
  bl(8585, 294, 34, 34);
  bl(8517, 226, 34, 34);
  bl(8551, 226, 34, 34);
  bl(8585, 226, 34, 34);
  bl(8517, 260, 34, 34);
  bl(8551, 260, 34, 34);
  bl(8585, 260, 34, 34);
  bl(8517, 192, 34, 34);
  bl(8551, 192, 34, 34);
  bl(8585, 192, 34, 34);
  bl(8585, 124, 34, 34);
  bl(8585, 158, 34, 34);
  bl(8551, 158, 34, 34);
  bl(8517, 158, 34, 34);
  bl(8517, 124, 34, 34);
  bl(8551, 124, 34, 34);
  bl(8619, 396, 34, 34);
  bl(8653, 396, 34, 34);
  bl(8687, 396, 34, 34);
  bl(8721, 396, 34, 34);
  bl(8721, 430, 34, 34);
  bl(8721, 464, 34, 34);
  bl(8687, 464, 34, 34);
  bl(8721, 498, 34, 34);
  bl(8687, 498, 34, 34);
  bl(8653, 498, 34, 34);
  bl(8619, 498, 34, 34);
  bl(8619, 464, 34, 34);
  bl(8653, 464, 34, 34);
  bl(8653, 430, 34, 34);
  bl(8687, 430, 34, 34);
  bl(8619, 430, 34, 34);
  bl(8619, 226, 34, 34);
  bl(8619, 260, 34, 34);
  bl(8619, 192, 34, 34);
  bl(8687, 260, 34, 34);
  bl(8721, 260, 34, 34);
  bl(8653, 260, 34, 34);
  bl(8653, 226, 34, 34);
  bl(8653, 192, 34, 34);
  bl(8687, 226, 34, 34);
  bl(8721, 226, 34, 34);
  bl(8687, 192, 34, 34);
  bl(8721, 192, 34, 34);
  bl(8619, 294, 34, 34);
  bl(8653, 294, 34, 34);
  bl(8687, 294, 34, 34);
  bl(8721, 294, 34, 34);
  bl(8721, 158, 34, 34);
  bl(8721, 124, 34, 34);
  bl(8687, 124, 34, 34);
  bl(8653, 124, 34, 34);
  bl(8619, 124, 34, 34);
  bl(8687, 158, 34, 34);
  bl(8653, 158, 34, 34);
  bl(8619, 158, 34, 34);
  bl(8755, 396, 34, 34);
  bl(8789, 396, 34, 34);
  bl(8823, 396, 34, 34);
  bl(8823, 498, 34, 34);
  bl(8789, 498, 34, 34);
  bl(8755, 498, 34, 34);
  bl(8755, 464, 34, 34);
  bl(8789, 464, 34, 34);
  bl(8823, 464, 34, 34);
  bl(8823, 430, 34, 34);
  bl(8789, 430, 34, 34);
  bl(8755, 430, 34, 34);
  bl(8755, 294, 34, 34);
  bl(8789, 294, 34, 34);
  bl(8823, 294, 34, 34);
  bl(8755, 260, 34, 34);
  bl(8789, 260, 34, 34);
  bl(8823, 260, 34, 34);
  bl(8755, 226, 34, 34);
  bl(8789, 226, 34, 34);
  bl(8823, 226, 34, 34);
  bl(8755, 192, 34, 34);
  bl(8789, 192, 34, 34);
  bl(8823, 192, 34, 34);
  bl(8823, 158, 34, 34);
  bl(8789, 158, 34, 34);
  bl(8755, 158, 34, 34);
  bl(8823, 124, 34, 34);
  bl(8789, 124, 34, 34);
  bl(8755, 124, 34, 34);
  bl(8857, 396, 34, 34);
  bl(8891, 396, 34, 34);
  bl(8925, 396, 34, 34);
  bl(8925, 498, 34, 34);
  bl(8891, 498, 34, 34);
  bl(8857, 498, 34, 34);
  bl(8857, 430, 34, 34);
  bl(8891, 430, 34, 34);
  bl(8925, 430, 34, 34);
  bl(8925, 464, 34, 34);
  bl(8891, 464, 34, 34);
  bl(8857, 464, 34, 34);
  bl(8857, 294, 34, 34);
  bl(8891, 294, 34, 34);
  bl(8925, 260, 34, 34);
  bl(8891, 260, 34, 34);
  bl(8857, 260, 34, 34);
  bl(8857, 226, 34, 34);
  bl(8891, 226, 34, 34);
  bl(8925, 226, 34, 34);
  bl(8857, 192, 34, 34);
  bl(8891, 192, 34, 34);
  bl(8925, 192, 34, 34);
  bl(8925, 158, 34, 34);
  bl(8891, 158, 34, 34);
  bl(8857, 158, 34, 34);
  bl(8925, 124, 34, 34);
  bl(8891, 124, 34, 34);
  bl(8857, 124, 34, 34);
  bl(8959, 396, 34, 34);
  bl(8993, 396, 34, 34);
  bl(9027, 396, 34, 34);
  bl(9061, 396, 34, 34);
  bl(9061, 430, 34, 34);
  bl(9061, 464, 34, 34);
  bl(9061, 498, 34, 34);
  bl(9027, 430, 34, 34);
  bl(9027, 464, 34, 34);
  bl(9027, 498, 34, 34);
  bl(8993, 498, 34, 34);
  bl(8959, 498, 34, 34);
  bl(8959, 430, 34, 34);
  bl(8993, 430, 34, 34);
  bl(8993, 464, 34, 34);
  bl(8959, 464, 34, 34);
  bl(9061, 260, 34, 34);
  bl(9027, 260, 34, 34);
  bl(8993, 260, 34, 34);
  bl(8959, 260, 34, 34);
  bl(9061, 226, 34, 34);
  bl(9061, 192, 34, 34);
  bl(8959, 226, 34, 34);
  bl(8993, 226, 34, 34);
  bl(9027, 226, 34, 34);
  bl(8959, 192, 34, 34);
  bl(8993, 192, 34, 34);
  bl(9027, 192, 34, 34);
  bl(9061, 158, 34, 34);
  bl(9061, 124, 34, 34);
  bl(8993, 158, 34, 34);
  bl(8959, 158, 34, 34);
  bl(9027, 158, 34, 34);
  bl(9027, 124, 34, 34);
  bl(8993, 124, 34, 34);
  bl(8959, 124, 34, 34);
  bl(10251, 226, 34, 34);
  bl(10251, 192, 34, 34);
  bl(10251, 260, 34, 34);
  sp(10727);
  sp(10761);
  levelObjects.push({type:'spike', x:10761, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10727, y:192, w:GRID, h:GRID, rotation:0});
  bl(10693, 192, 34, 34);
  bl(10693, 498, 34, 34);
  sp(10795);
  sp(10829);
  sp(10863);
  levelObjects.push({type:'spike', x:10863, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10829, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10795, y:192, w:GRID, h:GRID, rotation:0});
  sp(10897);
  sp(10931);
  sp(10965);
  levelObjects.push({type:'spike', x:10965, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10931, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10897, y:192, w:GRID, h:GRID, rotation:0});
  sp(10999);
  sp(11033);
  sp(11067);
  sp(11101);
  levelObjects.push({type:'spike', x:11101, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11067, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11033, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10999, y:192, w:GRID, h:GRID, rotation:0});
  sp(11135);
  sp(11169);
  levelObjects.push({type:'spike', x:11169, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11135, y:192, w:GRID, h:GRID, rotation:0});
  bl(11203, 192, 34, 34);
  bl(11203, 498, 34, 34);
  bl(11645, 498, 34, 34);
  bl(11645, 464, 34, 34);
  sp(11679);
  sp(11713);
  sp(11747);
  sp(11781);
  bl(12087, 192, 34, 34);
  levelObjects.push({type:'spike', x:12121, y:192, w:GRID, h:GRID, rotation:0});
  bl(12087, 226, 34, 34);
  levelObjects.push({type:'spike', x:12155, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12189, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12223, y:192, w:GRID, h:GRID, rotation:0});
  bl(12393, 498, 34, 34);
  sp(12427);
  sp(12461);
  sp(12495);
  sp(12529);
  sp(12563);
  bl(12597, 498, 34, 34);
  sp(12631);
  sp(12665);
  bl(12597, 464, 34, 34);
  bl(12801, 464, 34, 34);
  bl(12801, 498, 34, 34);
  sp(12699);
  sp(12733);
  sp(12767);
  bl(12801, 430, 34, 34);
  levelObjects.push({type:'spike', x:13141, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13107, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13073, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13243, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13209, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13175, y:192, w:GRID, h:GRID, rotation:0});
  bl(13277, 260, 34, 34);
  bl(13277, 226, 34, 34);
  bl(13277, 192, 34, 34);
  levelObjects.push({type:'spike', x:13311, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13345, y:192, w:GRID, h:GRID, rotation:0});
  bl(13277, 294, 34, 34);
  levelObjects.push({type:'spike', x:13379, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13413, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13447, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13481, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13515, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13549, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13583, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13617, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13651, y:192, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13685, y:192, w:GRID, h:GRID, rotation:0});
  bl(13753, 430, 34, 34);
  bl(13753, 498, 34, 34);
  bl(13787, 430, 34, 34);
  bl(13821, 430, 34, 34);
  bl(13753, 226, 34, 34);
  bl(13753, 192, 34, 34);
  bl(13787, 226, 34, 34);
  bl(13821, 226, 34, 34);
  bl(13821, 192, 34, 34);
  bl(13787, 192, 34, 34);
  bl(13821, 498, 34, 34);
  bl(13787, 498, 34, 34);
  bl(13753, 260, 34, 34);
  bl(13787, 260, 34, 34);
  bl(13821, 260, 34, 34);
  levelObjects.push({type:'spike', x:13719, y:192, w:GRID, h:GRID, rotation:0});
  bl(13821, 158, 34, 34);
  bl(13787, 158, 34, 34);
  bl(13753, 158, 34, 34);
  bl(13753, 464, 34, 34);
  bl(13787, 464, 34, 34);
  bl(13821, 464, 34, 34);
  bl(13855, 430, 34, 34);
  bl(13889, 430, 34, 34);
  bl(13923, 430, 34, 34);
  bl(13923, 226, 34, 34);
  bl(13923, 192, 34, 34);
  bl(13855, 226, 34, 34);
  bl(13889, 226, 34, 34);
  bl(13889, 192, 34, 34);
  bl(13855, 192, 34, 34);
  bl(13923, 498, 34, 34);
  bl(13889, 498, 34, 34);
  bl(13855, 498, 34, 34);
  bl(13855, 260, 34, 34);
  bl(13889, 260, 34, 34);
  bl(13923, 260, 34, 34);
  bl(13923, 158, 34, 34);
  bl(13889, 158, 34, 34);
  bl(13855, 158, 34, 34);
  bl(13855, 464, 34, 34);
  bl(13889, 464, 34, 34);
  bl(13923, 464, 34, 34);
  bl(13957, 430, 34, 34);
  bl(13991, 430, 34, 34);
  bl(14025, 430, 34, 34);
  bl(13957, 226, 34, 34);
  bl(13957, 192, 34, 34);
  bl(13991, 192, 34, 34);
  bl(14025, 192, 34, 34);
  bl(14025, 226, 34, 34);
  bl(13991, 226, 34, 34);
  bl(14025, 498, 34, 34);
  bl(13991, 498, 34, 34);
  bl(13957, 498, 34, 34);
  bl(13957, 260, 34, 34);
  bl(13991, 260, 34, 34);
  bl(14025, 260, 34, 34);
  bl(13957, 158, 34, 34);
  bl(13991, 158, 34, 34);
  bl(14025, 158, 34, 34);
  bl(13957, 464, 34, 34);
  bl(13991, 464, 34, 34);
  bl(14025, 464, 34, 34);
  bl(14059, 430, 34, 34);
  bl(14093, 430, 34, 34);
  bl(14127, 430, 34, 34);
  bl(14161, 430, 34, 34);
  bl(14059, 192, 34, 34);
  bl(14093, 192, 34, 34);
  bl(14127, 192, 34, 34);
  bl(14161, 192, 34, 34);
  bl(14161, 226, 34, 34);
  bl(14127, 226, 34, 34);
  bl(14093, 226, 34, 34);
  bl(14059, 226, 34, 34);
  bl(14161, 498, 34, 34);
  bl(14127, 498, 34, 34);
  bl(14093, 498, 34, 34);
  bl(14059, 498, 34, 34);
  bl(14059, 260, 34, 34);
  bl(14093, 260, 34, 34);
  bl(14127, 260, 34, 34);
  bl(14161, 260, 34, 34);
  bl(14059, 158, 34, 34);
  bl(14093, 158, 34, 34);
  bl(14127, 158, 34, 34);
  bl(14161, 158, 34, 34);
  bl(14059, 464, 34, 34);
  bl(14093, 464, 34, 34);
  bl(14127, 464, 34, 34);
  bl(14161, 464, 34, 34);
  bl(14195, 430, 34, 34);
  bl(14229, 430, 34, 34);
  bl(14229, 226, 34, 34);
  bl(14229, 192, 34, 34);
  bl(14195, 192, 34, 34);
  bl(14195, 226, 34, 34);
  bl(14195, 498, 34, 34);
  bl(14229, 260, 34, 34);
  bl(14195, 260, 34, 34);
  bl(14229, 158, 34, 34);
  bl(14195, 158, 34, 34);
  bl(14263, 464, 34, 34);
  bl(14229, 464, 34, 34);
  bl(14229, 498, 34, 34);
  bl(14263, 498, 34, 34);
  bl(14195, 464, 34, 34);
  bl(14297, 464, 34, 34);
  bl(14331, 464, 34, 34);
  bl(14365, 464, 34, 34);
  bl(14297, 498, 34, 34);
  bl(14331, 498, 34, 34);
  bl(14365, 498, 34, 34);
  bl(14399, 464, 34, 34);
  bl(14433, 464, 34, 34);
  bl(14467, 464, 34, 34);
  bl(14501, 464, 34, 34);
  bl(14399, 498, 34, 34);
  bl(14433, 498, 34, 34);
  bl(14467, 498, 34, 34);
  bl(14501, 498, 34, 34);
  bl(14535, 464, 34, 34);
  bl(14569, 464, 34, 34);
  bl(14535, 498, 34, 34);
  bl(14569, 498, 34, 34);
  bl(14603, 464, 34, 34);
  bl(14603, 498, 34, 34);
  bl(14671, 464, 34, 34);
  bl(14671, 498, 34, 34);
  bl(14705, 464, 34, 34);
  bl(14705, 498, 34, 34);
  bl(14637, 464, 34, 34);
  bl(14637, 498, 34, 34);
  bl(14841, 430, 34, 34);
  bl(14841, 464, 34, 34);
  bl(14841, 498, 34, 34);
  hs(14807, 515);
  hs(14841, 515);
  hs(14773, 515);
  hs(14739, 515);
  hs(14875, 515);
  hs(14909, 515);
  hs(14943, 515);
  hs(14977, 515);
  hs(15011, 515);
  hs(15045, 515);
  bl(14977, 396, 34, 34);
  bl(14977, 430, 34, 34);
  bl(14977, 464, 34, 34);
  bl(14977, 498, 34, 34);
  hs(15079, 515);
  hs(15113, 515);
  hs(15147, 515);
  hs(15181, 515);
  bl(15113, 362, 34, 34);
  bl(15113, 430, 34, 34);
  bl(15113, 464, 34, 34);
  bl(15113, 430, 34, 34);
  bl(15113, 464, 34, 34);
  bl(15113, 498, 34, 34);
  bl(15113, 396, 34, 34);
  hs(15215, 515);
  hs(15249, 515);
  hs(15283, 515);
  bl(15249, 328, 34, 34);
  bl(15283, 498, 34, 34);
  bl(15249, 498, 34, 34);
  bl(15283, 464, 34, 34);
  bl(15249, 176.13, 34, 34);
  levelObjects.push({type:'spike', x:15249, y:210.13, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:15283, y:210.13, w:GRID, h:GRID, rotation:0});
  bl(15283, 176.13, 34, 34);
  bl(15249, 396, 34, 34);
  bl(15249, 430, 34, 34);
  bl(15249, 464, 34, 34);
  bl(15249, 396, 34, 34);
  bl(15249, 430, 34, 34);
  bl(15249, 362, 34, 34);
  hs(15317, 515);
  hs(15351, 515);
  hs(15385, 515);
  bl(15385, 498, 34, 34);
  bl(15351, 498, 34, 34);
  bl(15317, 498, 34, 34);
  bl(15317, 464, 34, 34);
  bl(15351, 464, 34, 34);
  bl(15385, 464, 34, 34);
  levelObjects.push({type:'spike', x:15317, y:210.13, w:GRID, h:GRID, rotation:0});
  bl(15317, 176.13, 34, 34);
  hs(15419, 515);
  hs(15453, 515);
  hs(15487, 515);
  hs(15521, 515);
  bl(15487, 464, 34, 34);
  bl(15487, 498, 34, 34);
  bl(15453, 464, 34, 34);
  bl(15419, 464, 34, 34);
  bl(15453, 498, 34, 34);
  bl(15419, 498, 34, 34);
  hs(15555, 515);
  hs(15589, 515);
  hs(15623, 515);
  bl(15623, 430, 34, 34);
  bl(15623, 464, 34, 34);
  bl(15623, 498, 34, 34);
  hs(15657, 515);
  hs(15691, 515);
  hs(15725, 515);
  hs(15759, 515);
  bl(15759, 396, 34, 34);
  bl(15759, 430, 34, 34);
  bl(15759, 464, 34, 34);
  bl(15759, 498, 34, 34);
  hs(15793, 515);
  hs(15827, 515);
  hs(15861, 515);
  bl(15895, 362, 34, 34);
  bl(15895, 396, 34, 34);
  bl(15895, 430, 34, 34);
  bl(15895, 464, 34, 34);
  bl(15895, 498, 34, 34);
  hs(15895, 515);
  hs(15929, 515);
  hs(15963, 515);
  bl(16031, 328, 34, 34);
  bl(16031, 362, 34, 34);
  bl(16031, 396, 34, 34);
  bl(16031, 430, 34, 34);
  bl(16031, 464, 34, 34);
  bl(16031, 498, 34, 34);
  hs(15997, 515);
  hs(16031, 515);
  hs(16065, 515);
  bl(16167, 294, 34, 34);
  bl(16167, 328, 34, 34);
  bl(16167, 362, 34, 34);
  bl(16167, 396, 34, 34);
  bl(16167, 430, 34, 34);
  bl(16167, 464, 34, 34);
  bl(16167, 498, 34, 34);
  hs(16099, 515);
  hs(16133, 515);
  hs(16167, 515);
  hs(16201, 515);
  bl(16303, 260, 34, 34);
  bl(16303, 294, 34, 34);
  bl(16303, 328, 34, 34);
  bl(16303, 362, 34, 34);
  bl(16303, 396, 34, 34);
  bl(16303, 430, 34, 34);
  bl(16303, 464, 34, 34);
  bl(16303, 498, 34, 34);
  hs(16235, 515);
  hs(16269, 515);
  hs(16303, 515);
  hs(16337, 515);
  hs(16371, 515);
  hs(16405, 515);
  bl(16439, 226, 34, 34);
  bl(16439, 260, 34, 34);
  bl(16439, 294, 34, 34);
  bl(16439, 328, 34, 34);
  bl(16439, 362, 34, 34);
  bl(16439, 396, 34, 34);
  bl(16439, 430, 34, 34);
  bl(16439, 464, 34, 34);
  bl(16439, 498, 34, 34);
  hs(16439, 515);
  hs(16541, 515);
  hs(16507, 515);
  hs(16473, 515);
  sl(16541, 267.93);
  sl(16473, 233.93);
  hs(16643, 515);
  hs(16609, 515);
  hs(16575, 515);
  sl(16575, 267.93);
  sl(16643, 301.93);
  hs(16745, 515);
  hs(16711, 515);
  hs(16677, 515);
  sl(16677, 301.93);
  sl(16745, 335.93);
  hs(16847, 515);
  hs(16813, 515);
  hs(16779, 515);
  sl(16779, 335.93);
  sl(16813, 335.93);
  hs(16881, 515);
  hs(16983, 515);
  hs(16949, 515);
  hs(16915, 515);
  sl(16949, 369.93);
  sl(16983, 369.93);
  hs(17085, 515);
  hs(17051, 515);
  hs(17017, 515);
  bl(17051, 396, 34, 34);
  bl(17051, 430, 34, 34);
  bl(17051, 464, 34, 34);
  bl(17051, 498, 34, 34);
  sl(17051, 388.07);
  sl(17085, 388.07);
  bl(17085, 396, 34, 34);
  bl(17085, 430, 34, 34);
  bl(17085, 464, 34, 34);
  bl(17085, 498, 34, 34);
  hs(17119, 515);
  hs(17153, 515);
  hs(17187, 515);
  hs(17221, 515);
  bl(17119, 396, 34, 34);
  bl(17119, 430, 34, 34);
  bl(17119, 464, 34, 34);
  bl(17119, 498, 34, 34);
  sl(17119, 388.07);
  hs(17323, 515);
  hs(17289, 515);
  hs(17255, 515);
  bl(17323, 430, 34, 34);
  bl(17323, 464, 34, 34);
  bl(17323, 498, 34, 34);
  sl(17323, 422.07);
  bl(17255, 430, 34, 34);
  bl(17255, 464, 34, 34);
  sl(17255, 422.07);
  bl(17255, 498, 34, 34);
  sl(17289, 422.07);
  bl(17289, 430, 34, 34);
  bl(17289, 464, 34, 34);
  bl(17289, 498, 34, 34);
  hs(17357, 515);
  hs(17391, 515);
  hs(17425, 515);
  bl(17357, 430, 34, 34);
  bl(17357, 498, 34, 34);
  bl(17357, 464, 34, 34);
  sl(17357, 422.07);
  sl(17425, 437.93);
  hs(17459, 515);
  hs(17493, 515);
  hs(17527, 515);
  hs(17561, 515);
  sl(17561, 505.93);
  sl(17493, 471.93);
  bl(17867, 498, 34, 34);
  sp(17833);
  sp(17799);
  hs(17901, 515);
  sl(18003, 471.93);
  hs(17935, 515);
  hs(17969, 515);
  hs(18003, 515);
  sl(17969, 471.93);
  bl(18105, 498, 34, 34);
  hs(18037, 515);
  hs(18071, 515);
  hs(18105, 515);
  bl(18071, 498, 34, 34);
  bl(18139, 498, 34, 34);
  hs(18173, 515);
  hs(18207, 515);
  hs(18241, 515);
  hs(18139, 515);
  sl(18241, 471.93);
  sl(18275, 471.93);
  hs(18275, 515);
  hs(18309, 515);
  hs(18343, 515);
  sl(18411, 437.93);
  hs(18377, 515);
  hs(18411, 515);
  hs(18445, 515);
  sl(18377, 437.93);
  bl(18547, 498, 34, 34);
  sp(18581);
  bl(18513, 498, 34, 34);
  bl(18479, 498, 34, 34);
  sp(18615);
  sp(18853);
  bl(18853, 328, 34, 34);
  levelObjects.push({type:'spike', x:18853, y:362, w:GRID, h:GRID, rotation:0});
  sp(18884.73);
  bl(18884.73, 328, 34, 34);
  levelObjects.push({type:'spike', x:18884.73, y:362, w:GRID, h:GRID, rotation:0});
  sp(19127.27);
  bl(19127.27, 328, 34, 34);
  levelObjects.push({type:'spike', x:19127.27, y:362, w:GRID, h:GRID, rotation:0});
  sp(19156.73);
  bl(19156.73, 328, 34, 34);
  levelObjects.push({type:'spike', x:19156.73, y:362, w:GRID, h:GRID, rotation:0});
  sp(19186.2);
  bl(19186.2, 328, 34, 34);
  levelObjects.push({type:'spike', x:19186.2, y:362, w:GRID, h:GRID, rotation:0});
  sp(19397);
  bl(19397, 328, 34, 34);
  levelObjects.push({type:'spike', x:19397, y:362, w:GRID, h:GRID, rotation:0});
  sp(19646.33);
  levelObjects.push({type:'spike', x:19646.33, y:362, w:GRID, h:GRID, rotation:0});
  bl(19646.33, 328, 34, 34);
  sp(19941);
  hs(20043, 515);
  bl(20009, 498, 34, 34);
  sp(19975);
  hs(20077, 515);
  hs(20111, 515);
  hs(20145, 515);
  bl(20145, 464, 34, 34);
  bl(20145, 498, 34, 34);
  hs(20179, 515);
  hs(20213, 515);
  hs(20247, 515);
  hs(20281, 515);
  bl(20281, 430, 34, 34);
  bl(20281, 464, 34, 34);
  bl(20281, 498, 34, 34);
  hs(20315, 515);
  hs(20349, 515);
  hs(20383, 515);
  hs(20417, 515);
  hs(20451, 515);
  hs(20485, 515);
  bl(20417, 396, 34, 34);
  bl(20417, 430, 34, 34);
  bl(20417, 464, 34, 34);
  bl(20417, 498, 34, 34);
  sl(20451, 403.93);
  sl(20519, 437.93);
  sl(20587, 471.93);
  hs(20519, 515);
  hs(20553, 515);
  hs(20587, 515);
  hs(20621, 515);
  sl(20655, 505.93);
  hs(20655, 515);
  sp(20859);
  sp(20893);
  bl(21131, 430, 34, 34);
  bl(21165, 430, 34, 34);
  levelObjects.push({type:'spike', x:21131, y:464, w:GRID, h:GRID, rotation:2});
  levelObjects.push({type:'spike', x:21165, y:464, w:GRID, h:GRID, rotation:2});
  bl(21199, 430, 34, 34);
  bl(21233, 430, 34, 34);
  levelObjects.push({type:'spike', x:21199, y:464, w:GRID, h:GRID, rotation:2});
  levelObjects.push({type:'spike', x:21233, y:464, w:GRID, h:GRID, rotation:2});
  sp(21403);
  bl(21437, 498, 34, 34);
  sl(21743, 505.93);
  hs(21743, 515);
  sl(21777, 505.93);
  sl(21811, 505.93);
  sl(21845, 505.93);
  hs(21777, 515);
  hs(21811, 515);
  hs(21845, 515);
  sl(21981, 471.93);
  hs(21879, 515);
  hs(21913, 515);
  hs(21947, 515);
  hs(21981, 515);
  hs(22015, 515);
  hs(22049, 515);
  hs(22083, 515);
  hs(22117, 515);
  hs(22151, 515);
  hs(22185, 515);
  sl(22117, 437.93);
  sl(22253, 403.93);
  hs(22219, 515);
  hs(22253, 515);
  hs(22287, 515);
  hs(22321, 515);
  sl(22389, 369.93);
  sl(22423, 369.93);
  hs(22355, 515);
  hs(22389, 515);
  hs(22423, 515);
  sl(22457, 369.93);
  bl(22525, 396, 34, 34);
  bl(22525, 294, 34, 34);
  hs(22457, 515);
  hs(22491, 515);
  hs(22525, 515);
  bl(22593, 430, 34, 34);
  bl(22661, 464, 34, 34);
  bl(22593, 328, 34, 34);
  hs(22593, 515);
  hs(22627, 515);
  hs(22661, 515);
  hs(22559, 515);
  bl(22661, 362, 34, 34);
  hs(22695, 515);
  hs(22729, 515);
  hs(22763, 515);
  bl(22744.87, 375.6, 34, 34);
  bl(22744.87, 498, 34, 34);
  hs(22797, 515);
  hs(22831, 515);
  hs(22865, 515);
  sl(22880.87, 471.93);
  hs(22899, 515);
  hs(22933, 515);
  hs(23001, 515);
  hs(22967, 515);
  levelObjects.push({type:'spike', x:22964.73, y:430, w:GRID, h:GRID, rotation:0});
  sl(22964.73, 471.93);
  hs(23035, 515);
  hs(23069, 515);
  hs(23103, 515);
  sl(23050.87, 471.93);
  hs(23137, 515);
  hs(23171, 515);
  hs(23205, 515);
  sl(23171, 437.93);
  sl(23205, 437.93);
  hs(23239, 515);
  hs(23273, 515);
  hs(23307, 515);
  hs(23341, 515);
  sl(23239, 437.93);
  sl(23307, 471.93);
  hs(23375, 515);
  hs(23409, 515);
  hs(23443, 515);
  sl(23375, 505.93);
  sl(23409, 505.93);
  sl(23443, 505.93);
  sp(23477);
  sp(23511);
  bl(23780.73, 362, 34, 34);
  levelObjects.push({type:'spike', x:23780.73, y:396, w:GRID, h:GRID, rotation:0});
  sp(23780.73);
  bl(23751.27, 362, 34, 34);
  levelObjects.push({type:'spike', x:23751.27, y:396, w:GRID, h:GRID, rotation:0});
  sp(23753.53);
  bl(23810.2, 362, 34, 34);
  levelObjects.push({type:'spike', x:23810.2, y:396, w:GRID, h:GRID, rotation:0});
  sp(23807.93);
  bl(24157, 498, 34, 34);
  hs(24191, 515);
  hs(24225, 515);
  sl(24225, 505.93);
  sl(24191, 505.93);
  hs(24259, 515);
  hs(24293, 515);
  hs(24327, 515);
  hs(24361, 515);
  hs(24395, 515);
  sl(24376.87, 505.93);
  hs(24429, 515);
  hs(24463, 515);
  hs(24497, 515);
  sl(24531, 505.93);
  hs(24531, 515);
  hs(24565, 515);
  sl(24565, 505.93);
  hs(24599, 515);
  bl(24599, 498, 34, 34);
  bl(24633, 464, 34, 34);
  bl(24633, 498, 34, 34);
  hs(24633, 515);
  sl(24667, 471.93);
  sl(24701, 471.93);
  hs(24667, 515);
  hs(24701, 515);
  hs(24735, 515);
  hs(24769, 515);
  hs(24803, 515);
  hs(24837, 515);
  hs(24871, 515);
  hs(24905, 515);
  sl(24837, 437.93);
  sl(24905, 471.93);
  hs(24939, 515);
  sl(25041, 505.93);
  hs(24973, 515);
  hs(25007, 515);
  hs(25041, 515);
  sl(24973, 505.93);
  sl(25007, 505.93);
  hs(25075, 515);
  hs(25109, 515);
  hs(25143, 515);
  sl(25177, 471.93);
  hs(25177, 515);
  hs(25211, 515);
  hs(25245, 515);
  sl(25245, 471.93);
  levelObjects.push({type:'spike', x:25245, y:430, w:GRID, h:GRID, rotation:0});
  hs(25279, 515);
  hs(25313, 515);
  hs(25347, 515);
  hs(25381, 515);
  sl(25381, 471.93);
  sl(25347, 471.93);
  sl(25313, 471.93);
  sl(25415, 471.93);
  hs(25415, 515);
  sl(25498.87, 471.93);
  levelObjects.push({type:'spike', x:25498.87, y:430, w:GRID, h:GRID, rotation:0});
  hs(25449, 515);
  hs(25483, 515);
  hs(25517, 515);
  sl(25585, 471.93);
  hs(25551, 515);
  hs(25585, 515);
  hs(25619, 515);
  sl(25721, 437.93);
  hs(25653, 515);
  hs(25687, 515);
  hs(25721, 515);
  hs(25755, 515);
  hs(25789, 515);
  hs(25823, 515);
  sl(25755, 437.93);
  sl(25789, 437.93);
  levelObjects.push({type:'spike', x:25789, y:396, w:GRID, h:GRID, rotation:0});
  hs(25857, 515);
  hs(25891, 515);
  hs(25925, 515);
  hs(25857, 515);
  sl(25857, 471.93);
  sl(25891, 471.93);
  sl(25925, 471.93);
  hs(25959, 515);
  bl(25993, 260, 34, 34);
  bl(25993, 226, 34, 34);
  bl(25993, 192, 34, 34);
  bl(25993, 464, 34, 34);
  bl(25993, 498, 34, 34);
  bl(25993, 430, 34, 34);
  bl(26435, 498, 34, 34);
  bl(26469, 464, 34, 34);
  bl(26469, 226, 34, 34);
  bl(26503, 430, 34, 34);
  bl(26503, 260, 34, 34);
  bl(26435, 192, 34, 34);
  bl(26503, 498, 34, 34);
  bl(26469, 498, 34, 34);
  bl(26503, 464, 34, 34);
  bl(26503, 226, 34, 34);
  bl(26469, 192, 34, 34);
  bl(26503, 192, 34, 34);
  bl(26605, 498, 34, 34);
  bl(26571, 498, 34, 34);
  bl(26537, 498, 34, 34);
  bl(26537, 464, 34, 34);
  bl(26571, 464, 34, 34);
  bl(26605, 464, 34, 34);
  bl(26605, 226, 34, 34);
  bl(26571, 226, 34, 34);
  bl(26537, 226, 34, 34);
  bl(26537, 192, 34, 34);
  bl(26571, 192, 34, 34);
  bl(26605, 192, 34, 34);
  bl(26537, 430, 34, 34);
  bl(26571, 430, 34, 34);
  bl(26605, 430, 34, 34);
  bl(26537, 260, 34, 34);
  bl(26571, 260, 34, 34);
  bl(26605, 260, 34, 34);
  bl(26673, 430, 34, 34);
  bl(26707, 464, 34, 34);
  bl(26741, 498, 34, 34);
  bl(26673, 260, 34, 34);
  bl(26707, 226, 34, 34);
  bl(26741, 192, 34, 34);
  bl(26707, 498, 34, 34);
  bl(26673, 498, 34, 34);
  bl(26639, 498, 34, 34);
  bl(26639, 464, 34, 34);
  bl(26673, 464, 34, 34);
  bl(26673, 226, 34, 34);
  bl(26639, 226, 34, 34);
  bl(26639, 192, 34, 34);
  bl(26673, 192, 34, 34);
  bl(26707, 192, 34, 34);
  bl(26639, 430, 34, 34);
  bl(26639, 260, 34, 34);
  hs(26843, 515);
  hs(26809, 515);
  hs(26775, 515);
  hs(26843, 195.4);
  hs(26809, 195.4);
  hs(26775, 195.4);
  bl(26843, 158, 34, 34);
  bl(26809, 158, 34, 34);
  bl(26775, 158, 34, 34);
  bl(26775, 124, 34, 34);
  bl(26809, 124, 34, 34);
  bl(26843, 124, 34, 34);
  bl(26843, 22, 34, 34);
  bl(26809, 22, 34, 34);
  bl(26775, 22, 34, 34);
  bl(26775, 56, 34, 34);
  bl(26809, 56, 34, 34);
  bl(26843, 56, 34, 34);
  bl(26843, 90, 34, 34);
  bl(26809, 90, 34, 34);
  bl(26775, 90, 34, 34);
  hs(26945, 515);
  hs(26911, 515);
  hs(26877, 515);
  hs(26945, 195.4);
  hs(26911, 195.4);
  hs(26877, 195.4);
  bl(26945, 158, 34, 34);
  bl(26911, 158, 34, 34);
  bl(26877, 158, 34, 34);
  bl(26877, 124, 34, 34);
  bl(26911, 124, 34, 34);
  bl(26945, 124, 34, 34);
  bl(26945, 22, 34, 34);
  bl(26911, 22, 34, 34);
  bl(26877, 22, 34, 34);
  bl(26877, 56, 34, 34);
  bl(26911, 56, 34, 34);
  bl(26945, 56, 34, 34);
  bl(26945, 90, 34, 34);
  bl(26911, 90, 34, 34);
  bl(26877, 90, 34, 34);
  bl(27081, 464, 34, 34);
  bl(27047, 498, 34, 34);
  bl(27081, 498, 34, 34);
  bl(27081, 192, 34, 34);
  hs(27013, 515);
  hs(26979, 515);
  bl(27081, 158, 34, 34);
  bl(27081, 124, 34, 34);
  bl(27081, 90, 34, 34);
  bl(27081, 56, 34, 34);
  bl(27081, 22, 34, 34);
  bl(27047, 158, 34, 34);
  bl(27047, 124, 34, 34);
  bl(27047, 90, 34, 34);
  bl(27047, 56, 34, 34);
  bl(27047, 22, 34, 34);
  bl(26979, 158, 34, 34);
  bl(26979, 124, 34, 34);
  bl(27013, 124, 34, 34);
  bl(27013, 90, 34, 34);
  bl(27013, 56, 34, 34);
  bl(27013, 22, 34, 34);
  bl(26979, 22, 34, 34);
  bl(26979, 56, 34, 34);
  bl(26979, 90, 34, 34);
  bl(27081, 226, 34, 34);
  bl(27013, 158, 34, 34);
  bl(27047, 192, 34, 34);
  bl(27047, 192, 34, 34);
  bl(27115, 260, 34, 34);
  bl(27115, 430, 34, 34);
  bl(27183, 498, 34, 34);
  bl(27149, 498, 34, 34);
  bl(27115, 498, 34, 34);
  bl(27115, 464, 34, 34);
  bl(27149, 464, 34, 34);
  bl(27183, 464, 34, 34);
  bl(27115, 226, 34, 34);
  bl(27149, 226, 34, 34);
  bl(27183, 226, 34, 34);
  bl(27183, 192, 34, 34);
  bl(27149, 192, 34, 34);
  bl(27115, 192, 34, 34);
  bl(27149, 430, 34, 34);
  bl(27183, 430, 34, 34);
  bl(27149, 260, 34, 34);
  bl(27183, 260, 34, 34);
  bl(27115, 90, 34, 34);
  bl(27115, 56, 34, 34);
  bl(27149, 56, 34, 34);
  bl(27183, 56, 34, 34);
  bl(27183, 158, 34, 34);
  bl(27183, 124, 34, 34);
  bl(27183, 90, 34, 34);
  bl(27149, 90, 34, 34);
  bl(27149, 124, 34, 34);
  bl(27149, 158, 34, 34);
  bl(27115, 158, 34, 34);
  bl(27115, 124, 34, 34);
  bl(27183, 22, 34, 34);
  bl(27149, 22, 34, 34);
  bl(27115, 22, 34, 34);
  bl(27285, 430, 34, 34);
  bl(27285, 260, 34, 34);
  bl(27285, 498, 34, 34);
  bl(27251, 498, 34, 34);
  bl(27217, 498, 34, 34);
  bl(27217, 464, 34, 34);
  bl(27251, 464, 34, 34);
  bl(27285, 464, 34, 34);
  bl(27217, 226, 34, 34);
  bl(27251, 226, 34, 34);
  bl(27285, 226, 34, 34);
  bl(27285, 192, 34, 34);
  bl(27217, 192, 34, 34);
  bl(27217, 430, 34, 34);
  bl(27251, 430, 34, 34);
  bl(27217, 260, 34, 34);
  bl(27251, 260, 34, 34);
  bl(27217, 56, 34, 34);
  bl(27285, 56, 34, 34);
  bl(27285, 90, 34, 34);
  bl(27285, 158, 34, 34);
  bl(27251, 90, 34, 34);
  bl(27217, 90, 34, 34);
  bl(27217, 124, 34, 34);
  bl(27217, 158, 34, 34);
  bl(27285, 22, 34, 34);
  bl(27251, 22, 34, 34);
  bl(27217, 22, 34, 34);
  bl(27285, 124, 34, 34);
  bl(27251, 124, 34, 34);
  bl(27251, 56, 34, 34);
  bl(27251, 192, 34, 34);
  bl(27251, 158, 34, 34);
  bl(27319, 464, 34, 34);
  bl(27353, 498, 34, 34);
  bl(27319, 226, 34, 34);
  bl(27353, 192, 34, 34);
  bl(27319, 498, 34, 34);
  bl(27319, 192, 34, 34);
  hs(27387, 515);
  hs(27421, 515);
  hs(27421, 195.4);
  hs(27387, 195.4);
  bl(27319, 56, 34, 34);
  bl(27319, 158, 34, 34);
  bl(27319, 124, 34, 34);
  bl(27319, 90, 34, 34);
  bl(27353, 158, 34, 34);
  bl(27387, 158, 34, 34);
  bl(27421, 158, 34, 34);
  bl(27387, 22, 34, 34);
  bl(27421, 22, 34, 34);
  bl(27353, 22, 34, 34);
  bl(27319, 22, 34, 34);
  hs(27455, 515);
  hs(27489, 515);
  hs(27523, 515);
  hs(27523, 195.4);
  hs(27489, 195.4);
  hs(27455, 195.4);
  bl(27455, 158, 34, 34);
  bl(27489, 158, 34, 34);
  bl(27523, 158, 34, 34);
  bl(27455, 22, 34, 34);
  bl(27489, 22, 34, 34);
  bl(27523, 22, 34, 34);
  levelObjects.push({type:'spike', x:27455, y:124, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:27489, y:124, w:GRID, h:GRID, rotation:0});
  bl(27625, 430, 34, 34);
  bl(27625, 464, 34, 34);
  bl(27625, 498, 34, 34);
  hs(27557, 515);
  hs(27591, 515);
  hs(27625, 195.4);
  hs(27591, 195.4);
  hs(27557, 195.4);
  bl(27625, 396, 34, 34);
  bl(27557, 158, 34, 34);
  bl(27591, 158, 34, 34);
  bl(27625, 158, 34, 34);
  bl(27557, 22, 34, 34);
  bl(27591, 22, 34, 34);
  bl(27625, 56, 34, 34);
  bl(27625, 22, 34, 34);
  bl(27693, 430, 34, 34);
  bl(27693, 464, 34, 34);
  bl(27693, 498, 34, 34);
  bl(27659, 430, 34, 34);
  bl(27659, 464, 34, 34);
  bl(27659, 498, 34, 34);
  hs(27727, 515);
  hs(27761, 515);
  hs(27761, 195.4);
  hs(27727, 195.4);
  hs(27693, 195.4);
  hs(27659, 195.4);
  bl(27659, 396, 34, 34);
  bl(27693, 396, 34, 34);
  bl(27659, 158, 34, 34);
  bl(27693, 158, 34, 34);
  bl(27727, 158, 34, 34);
  bl(27761, 158, 34, 34);
  bl(27693, 22, 34, 34);
  bl(27727, 22, 34, 34);
  bl(27761, 22, 34, 34);
  bl(27659, 56, 34, 34);
  bl(27659, 22, 34, 34);
  hs(27795, 515);
  hs(27829, 515);
  hs(27863, 515);
  hs(27829, 195.4);
  hs(27863, 195.4);
  hs(27795, 195.4);
  bl(27795, 158, 34, 34);
  bl(27829, 158, 34, 34);
  bl(27863, 158, 34, 34);
  levelObjects.push({type:'spike', x:27795, y:124, w:GRID, h:GRID, rotation:0});
  bl(27795, 22, 34, 34);
  bl(27829, 22, 34, 34);
  bl(27863, 22, 34, 34);
  levelObjects.push({type:'spike', x:27863, y:124, w:GRID, h:GRID, rotation:0});
  hs(27897, 515);
  hs(27931, 515);
  hs(27965, 515);
  hs(27965, 195.4);
  hs(27931, 195.4);
  hs(27897, 195.4);
  bl(27897, 158, 34, 34);
  bl(27931, 158, 34, 34);
  bl(27965, 158, 34, 34);
  bl(27897, 22, 34, 34);
  bl(27931, 22, 34, 34);
  bl(27965, 22, 34, 34);
  levelObjects.push({type:'spike', x:27931, y:124, w:GRID, h:GRID, rotation:0});
  hs(27999, 515);
  hs(28033, 515);
  hs(28067, 515);
  hs(28101, 515);
  hs(28101, 195.4);
  hs(28067, 195.4);
  hs(28033, 195.4);
  hs(27999, 195.4);
  bl(27999, 158, 34, 34);
  bl(28033, 158, 34, 34);
  bl(28067, 158, 34, 34);
  bl(28101, 158, 34, 34);
  bl(27999, 22, 34, 34);
  bl(28033, 22, 34, 34);
  bl(28067, 22, 34, 34);
  bl(28101, 22, 34, 34);
  bl(28135, 192, 34, 34);
  bl(28135, 226, 34, 34);
  bl(28135, 260, 34, 34);
  bl(28203, 260, 34, 34);
  bl(28203, 226, 34, 34);
  bl(28203, 192, 34, 34);
  bl(28169, 260, 34, 34);
  bl(28169, 226, 34, 34);
  bl(28169, 192, 34, 34);
  hs(28135, 515);
  hs(28169, 515);
  hs(28203, 515);
  bl(28135, 294, 34, 34);
  bl(28169, 294, 34, 34);
  bl(28203, 294, 34, 34);
  bl(28135, 158, 34, 34);
  bl(28169, 158, 34, 34);
  bl(28203, 158, 34, 34);
  bl(28135, 22, 34, 34);
  bl(28169, 22, 34, 34);
  bl(28203, 22, 34, 34);
  hs(28237, 515);
  hs(28271, 515);
  hs(28305, 515);
  hs(28305, 195.4);
  hs(28271, 195.4);
  hs(28237, 195.4);
  bl(28237, 158, 34, 34);
  bl(28271, 158, 34, 34);
  bl(28305, 158, 34, 34);
  bl(28237, 22, 34, 34);
  bl(28271, 22, 34, 34);
  bl(28305, 22, 34, 34);
  hs(28339, 515);
  hs(28373, 515);
  hs(28407, 515);
  hs(28441, 515);
  hs(28441, 195.4);
  hs(28407, 195.4);
  hs(28373, 195.4);
  hs(28339, 195.4);
  bl(28373, 158, 34, 34);
  bl(28407, 158, 34, 34);
  bl(28441, 158, 34, 34);
  bl(28339, 22, 34, 34);
  bl(28373, 22, 34, 34);
  bl(28407, 22, 34, 34);
  bl(28441, 22, 34, 34);
  bl(28339, 124, 34, 34);
  bl(28339, 158, 34, 34);
  hs(28475, 515);
  hs(28509, 515);
  hs(28543, 515);
  hs(28543, 195.4);
  hs(28509, 195.4);
  hs(28475, 195.4);
  bl(28475, 158, 34, 34);
  bl(28509, 158, 34, 34);
  bl(28543, 158, 34, 34);
  bl(28509, 22, 34, 34);
  bl(28543, 22, 34, 34);
  bl(28475, 56, 34, 34);
  bl(28475, 22, 34, 34);
  hs(28577, 515);
  hs(28611, 515);
  hs(28645, 515);
  hs(28645, 195.4);
  hs(28611, 195.4);
  hs(28577, 195.4);
  bl(28577, 158, 34, 34);
  bl(28611, 158, 34, 34);
  bl(28577, 22, 34, 34);
  bl(28611, 22, 34, 34);
  bl(28645, 22, 34, 34);
  bl(28645, 124, 34, 34);
  bl(28645, 158, 34, 34);
  hs(28679, 515);
  hs(28679, 195.4);
  bl(28781, 498, 34, 34);
  bl(28747, 498, 34, 34);
  bl(28713, 498, 34, 34);
  levelObjects.push({type:'spike', x:28747, y:464, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28781, y:464, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28713, y:464, w:GRID, h:GRID, rotation:0});
  bl(28713, 192, 34, 34);
  bl(28747, 192, 34, 34);
  bl(28781, 192, 34, 34);
  levelObjects.push({type:'spike', x:28781, y:226, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28747, y:226, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28713, y:226, w:GRID, h:GRID, rotation:0});
  bl(28679, 22, 34, 34);
  bl(28713, 22, 34, 34);
  bl(28747, 22, 34, 34);
  bl(28781, 22, 34, 34);
  bl(28679, 124, 34, 34);
  bl(28713, 124, 34, 34);
  bl(28747, 124, 34, 34);
  bl(28781, 124, 34, 34);
  bl(28679, 158, 34, 34);
  bl(28713, 158, 34, 34);
  bl(28747, 158, 34, 34);
  bl(28781, 158, 34, 34);
  bl(28883, 498, 34, 34);
  bl(28849, 498, 34, 34);
  bl(28815, 498, 34, 34);
  levelObjects.push({type:'spike', x:28815, y:464, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28849, y:464, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28883, y:464, w:GRID, h:GRID, rotation:0});
  bl(28815, 192, 34, 34);
  bl(28849, 192, 34, 34);
  bl(28883, 192, 34, 34);
  levelObjects.push({type:'spike', x:28815, y:226, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28849, y:226, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28883, y:226, w:GRID, h:GRID, rotation:0});
  bl(28815, 22, 34, 34);
  bl(28849, 22, 34, 34);
  bl(28883, 22, 34, 34);
  bl(28815, 124, 34, 34);
  bl(28849, 124, 34, 34);
  bl(28815, 158, 34, 34);
  bl(28849, 158, 34, 34);
  bl(28883, 158, 34, 34);
  bl(28883, 90, 34, 34);
  bl(28883, 124, 34, 34);
  hs(28917, 515);
  hs(28951, 515);
  hs(28985, 515);
  hs(28985, 195.4);
  hs(28951, 195.4);
  hs(28917, 195.4);
  bl(28917, 22, 34, 34);
  bl(28951, 22, 34, 34);
  bl(28985, 22, 34, 34);
  bl(28951, 90, 34, 34);
  bl(28985, 90, 34, 34);
  bl(28917, 158, 34, 34);
  bl(28951, 158, 34, 34);
  bl(28985, 158, 34, 34);
  bl(28951, 124, 34, 34);
  bl(28985, 124, 34, 34);
  bl(28917, 90, 34, 34);
  bl(28917, 124, 34, 34);
  bl(29087, 498, 34, 34);
  bl(29087, 464, 34, 34);
  bl(29121, 464, 34, 34);
  bl(29087, 192, 34, 34);
  bl(29087, 226, 34, 34);
  bl(29121, 226, 34, 34);
  bl(29121, 498, 34, 34);
  bl(29121, 192, 34, 34);
  levelObjects.push({type:'spike', x:29121, y:430, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29087, y:430, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29087, y:260, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29121, y:260, w:GRID, h:GRID, rotation:0});
  hs(29019, 515);
  hs(29053, 515);
  hs(29053, 195.4);
  hs(29019, 195.4);
  bl(29019, 22, 34, 34);
  bl(29053, 22, 34, 34);
  bl(29087, 22, 34, 34);
  bl(29121, 22, 34, 34);
  bl(29019, 90, 34, 34);
  bl(29053, 90, 34, 34);
  bl(29087, 90, 34, 34);
  bl(29121, 90, 34, 34);
  bl(29019, 158, 34, 34);
  bl(29019, 124, 34, 34);
  bl(29053, 158, 34, 34);
  bl(29087, 158, 34, 34);
  bl(29121, 158, 34, 34);
  bl(29121, 124, 34, 34);
  bl(29087, 124, 34, 34);
  bl(29053, 124, 34, 34);
  bl(29155, 464, 34, 34);
  bl(29189, 464, 34, 34);
  bl(29223, 464, 34, 34);
  bl(29155, 226, 34, 34);
  bl(29189, 226, 34, 34);
  bl(29223, 226, 34, 34);
  bl(29223, 498, 34, 34);
  bl(29189, 498, 34, 34);
  bl(29155, 498, 34, 34);
  bl(29223, 192, 34, 34);
  bl(29189, 192, 34, 34);
  bl(29155, 192, 34, 34);
  levelObjects.push({type:'spike', x:29223, y:430, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29189, y:430, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29155, y:430, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29155, y:260, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29189, y:260, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29223, y:260, w:GRID, h:GRID, rotation:0});
  bl(29155, 22, 34, 34);
  bl(29189, 22, 34, 34);
  bl(29223, 22, 34, 34);
  bl(29155, 90, 34, 34);
  bl(29189, 90, 34, 34);
  bl(29155, 158, 34, 34);
  bl(29189, 158, 34, 34);
  bl(29189, 124, 34, 34);
  bl(29155, 124, 34, 34);
  bl(29223, 90, 34, 34);
  bl(29223, 124, 34, 34);
  bl(29223, 158, 34, 34);
  bl(29257, 464, 34, 34);
  bl(29257, 498, 34, 34);
  bl(29257, 226, 34, 34);
  bl(29257, 192, 34, 34);
  levelObjects.push({type:'spike', x:29257, y:430, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29257, y:260, w:GRID, h:GRID, rotation:0});
  hs(29291, 515);
  hs(29325, 515);
  hs(29325, 195.4);
  hs(29291, 195.4);
  bl(29257, 158, 34, 34);
  bl(29291, 158, 34, 34);
  bl(29325, 158, 34, 34);
  bl(29257, 22, 34, 34);
  bl(29291, 22, 34, 34);
  bl(29325, 22, 34, 34);
  levelObjects.push({type:'spike', x:29257, y:124, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29291, y:124, w:GRID, h:GRID, rotation:0});
  hs(29359, 515);
  hs(29393, 515);
  hs(29427, 515);
  hs(29461, 515);
  hs(29461, 195.4);
  hs(29427, 195.4);
  hs(29393, 195.4);
  hs(29359, 195.4);
  bl(29359, 158, 34, 34);
  bl(29393, 158, 34, 34);
  bl(29427, 158, 34, 34);
  bl(29461, 158, 34, 34);
  bl(29359, 22, 34, 34);
  bl(29393, 22, 34, 34);
  bl(29427, 90, 34, 34);
  bl(29427, 56, 34, 34);
  bl(29427, 22, 34, 34);
  levelObjects.push({type:'spike', x:29393, y:56, w:GRID, h:GRID, rotation:0});
  bl(29461, 90, 34, 34);
  bl(29461, 56, 34, 34);
  bl(29461, 22, 34, 34);
  bl(29563, 430, 34, 34);
  bl(29529, 430, 34, 34);
  bl(29495, 430, 34, 34);
  bl(29563, 260, 34, 34);
  bl(29529, 260, 34, 34);
  bl(29495, 260, 34, 34);
  bl(29495, 464, 34, 34);
  bl(29495, 498, 34, 34);
  bl(29495, 226, 34, 34);
  bl(29563, 464, 34, 34);
  bl(29529, 464, 34, 34);
  bl(29529, 498, 34, 34);
  bl(29563, 498, 34, 34);
  bl(29563, 192, 34, 34);
  bl(29563, 226, 34, 34);
  bl(29529, 226, 34, 34);
  bl(29529, 192, 34, 34);
  bl(29495, 192, 34, 34);
  bl(29495, 158, 34, 34);
  bl(29529, 158, 34, 34);
  bl(29563, 158, 34, 34);
  bl(29495, 22, 34, 34);
  bl(29529, 22, 34, 34);
  bl(29563, 22, 34, 34);
  levelObjects.push({type:'spike', x:29495, y:56, w:GRID, h:GRID, rotation:0});
  bl(29665, 430, 34, 34);
  bl(29631, 430, 34, 34);
  bl(29597, 430, 34, 34);
  bl(29665, 260, 34, 34);
  bl(29631, 260, 34, 34);
  bl(29597, 260, 34, 34);
  bl(29665, 464, 34, 34);
  bl(29631, 464, 34, 34);
  bl(29597, 464, 34, 34);
  bl(29597, 498, 34, 34);
  bl(29631, 498, 34, 34);
  bl(29665, 498, 34, 34);
  bl(29597, 226, 34, 34);
  bl(29631, 226, 34, 34);
  bl(29665, 226, 34, 34);
  bl(29665, 192, 34, 34);
  bl(29631, 192, 34, 34);
  bl(29597, 192, 34, 34);
  bl(29597, 158, 34, 34);
  bl(29597, 22, 34, 34);
  bl(29631, 90, 34, 34);
  bl(29665, 90, 34, 34);
  bl(29631, 124, 34, 34);
  bl(29665, 124, 34, 34);
  bl(29631, 158, 34, 34);
  bl(29665, 158, 34, 34);
  levelObjects.push({type:'spike', x:29597, y:124, w:GRID, h:GRID, rotation:0});
  bl(29631, 22, 34, 34);
  bl(29665, 22, 34, 34);
  bl(29801, 430, 34, 34);
  bl(29767, 430, 34, 34);
  bl(29733, 430, 34, 34);
  bl(29699, 430, 34, 34);
  bl(29801, 260, 34, 34);
  bl(29767, 260, 34, 34);
  bl(29733, 260, 34, 34);
  bl(29699, 260, 34, 34);
  bl(29801, 464, 34, 34);
  bl(29767, 464, 34, 34);
  bl(29733, 464, 34, 34);
  bl(29699, 464, 34, 34);
  bl(29699, 498, 34, 34);
  bl(29733, 498, 34, 34);
  bl(29767, 498, 34, 34);
  bl(29801, 498, 34, 34);
  bl(29801, 226, 34, 34);
  bl(29767, 226, 34, 34);
  bl(29699, 226, 34, 34);
  bl(29733, 226, 34, 34);
  bl(29801, 192, 34, 34);
  bl(29767, 192, 34, 34);
  bl(29733, 192, 34, 34);
  bl(29699, 192, 34, 34);
  bl(29733, 158, 34, 34);
  bl(29767, 158, 34, 34);
  bl(29801, 158, 34, 34);
  bl(29733, 22, 34, 34);
  bl(29767, 22, 34, 34);
  bl(29801, 22, 34, 34);
  bl(29699, 158, 34, 34);
  bl(29699, 22, 34, 34);
  bl(29835, 430, 34, 34);
  bl(29835, 260, 34, 34);
  bl(29835, 464, 34, 34);
  bl(29835, 498, 34, 34);
  bl(29835, 226, 34, 34);
  bl(29835, 192, 34, 34);
  bl(29869, 192, 34, 34);
  bl(29869, 260, 34, 34);
  bl(29869, 226, 34, 34);
  bl(29869, 498, 34, 34);
  bl(29869, 430, 34, 34);
  bl(29869, 464, 34, 34);
  bl(29835, 158, 34, 34);
  bl(29835, 22, 34, 34);
  bl(29869, 22, 34, 34);
  bl(29869, 158, 34, 34);
  levelObjects.push({type:'end', x:30269, y:332, w:10, h:200});
}
function startBuiltinLevel(){
  currentLevelId = 'builtin';
  generateBuiltinLevel();
  best = currentLevelBest['builtin'] || 0;
  _beginPlay();
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

//-----------------GAME DRAW---------------------

function gameDraw(){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.scale(ZOOM, ZOOM);

  drawBg();
  drawGround();
  levelObjects.forEach(o=>{
    if(o.type==='deco')           drawDeco(o);
    else if(o.type==='deco-black') drawDecoBlack(o);
  });
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

  ctx.restore();

  if(gameState==='playing'){
    drawProgressBar();
    document.getElementById('hud-attempts').textContent = 'Attempt '+attempts;
    const modeEl = document.getElementById('hud-mode');
    modeEl.textContent = gameMode.toUpperCase();
    modeEl.style.color = gameMode==='ship' ? '#aa44ff' : 'rgba(255,255,255,.2)';
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
    camX = player.x - 150/ZOOM;
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
  if(edTool==='spike'||edTool==='halfspike'||edTool==='portal-ship'||edTool==='portal-cube') obj.rotation=edRotation;
  if(edTool==='slab')    obj.y=Math.min(Math.floor(py/GRID)*GRID+(GRID/2),GROUND-(GRID/2));
  if(edTool==='jumppad') obj.y=GROUND-10;
  if(edTool==='end')     obj.y=GROUND-200;
  if(edTool==='halfspike'){
    const gx=edSnapX(px), gy=edSnapY(py);
    if(edRotation===0) obj.y=gy+GRID/2;
    else if(edRotation===1) obj.x=gx+GRID/2;
  }
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
  const edGround=GROUND;
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
