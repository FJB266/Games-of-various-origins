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
  const bl = (x,y,w,h) => levelObjects.push({type:'block', x, y:y??G-GRID, w:w??GRID, h:h??GRID});
  const sl = (x,y) => levelObjects.push({type:'slab', x, y:y??(G-GRID/2), w:GRID, h:GRID/2});

  levelObjects.push({type:'spike', x:595, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:1139, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:1683, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:1649, y:481, w:GRID, h:GRID, rotation:0});
  bl(1717, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:1751, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:1785, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(1853, 447, 34, 34);
  levelObjects.push({type:'halfspike', x:1819, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:1853, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:1887, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(1853, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:1921, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:1955, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(1989, 413, 34, 34);
  bl(1989, 447, 34, 34);
  bl(1989, 481, 34, 34);
  levelObjects.push({type:'spike', x:2703, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:2737, y:481, w:GRID, h:GRID, rotation:0});
  bl(2941, 481, 34, 34);
  bl(2975, 481, 34, 34);
  bl(3009, 481, 34, 34);
  bl(3043, 481, 34, 34);
  bl(3077, 481, 34, 34);
  bl(3111, 481, 34, 34);
  bl(3145, 481, 34, 34);
  bl(3179, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:3213, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:3247, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:3281, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(3315, 481, 34, 34);
  bl(3349, 481, 34, 34);
  bl(3383, 481, 34, 34);
  bl(3417, 481, 34, 34);
  bl(3451, 481, 34, 34);
  bl(3485, 481, 34, 34);
  levelObjects.push({type:'spike', x:3485, y:447, w:GRID, h:GRID, rotation:0});
  bl(3519, 481, 34, 34);
  bl(3553, 481, 34, 34);
  bl(3587, 481, 34, 34);
  bl(3621, 481, 34, 34);
  bl(3655, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:3689, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:3723, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:3757, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(3791, 447, 34, 34);
  bl(3791, 481, 34, 34);
  bl(3825, 447, 34, 34);
  bl(3825, 481, 34, 34);
  bl(3859, 447, 34, 34);
  bl(3893, 447, 34, 34);
  bl(3927, 447, 34, 34);
  bl(3961, 447, 34, 34);
  bl(3859, 481, 34, 34);
  bl(3893, 481, 34, 34);
  bl(3927, 481, 34, 34);
  bl(3961, 481, 34, 34);
  bl(3995, 447, 34, 34);
  bl(3995, 481, 34, 34);
  bl(4063, 447, 34, 34);
  bl(4029, 447, 34, 34);
  bl(4063, 481, 34, 34);
  bl(4029, 481, 34, 34);
  levelObjects.push({type:'spike', x:4029, y:413, w:GRID, h:GRID, rotation:0});
  bl(4131, 447, 34, 34);
  bl(4165, 447, 34, 34);
  bl(4097, 447, 34, 34);
  bl(4097, 481, 34, 34);
  bl(4131, 481, 34, 34);
  bl(4165, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:4267, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4301, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(4233, 447, 34, 34);
  bl(4233, 481, 34, 34);
  bl(4199, 481, 34, 34);
  bl(4199, 447, 34, 34);
  levelObjects.push({type:'halfspike', x:4335, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4403, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4369, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(4369, 420.93);
  levelObjects.push({type:'halfspike', x:4437, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4471, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4505, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(4505, 386.93);
  levelObjects.push({type:'halfspike', x:4539, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4573, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4607, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4641, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(4641, 352.93);
  levelObjects.push({type:'halfspike', x:4675, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4709, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4743, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4777, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4811, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4845, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(4777, 318.93);
  levelObjects.push({type:'halfspike', x:4879, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4913, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4947, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:4981, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(4913, 284.93);
  levelObjects.push({type:'halfspike', x:5015, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:5049, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:5083, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(5049, 311, 34, 34);
  bl(5083, 311, 34, 34);
  bl(5117, 345, 34, 34);
  bl(5117, 379, 34, 34);
  bl(5117, 413, 34, 34);
  bl(5117, 447, 34, 34);
  bl(5117, 481, 34, 34);
  bl(5185, 311, 34, 34);
  bl(5151, 345, 34, 34);
  bl(5185, 345, 34, 34);
  bl(5185, 481, 34, 34);
  bl(5151, 481, 34, 34);
  bl(5151, 447, 34, 34);
  bl(5151, 413, 34, 34);
  bl(5185, 379, 34, 34);
  bl(5151, 379, 34, 34);
  bl(5185, 413, 34, 34);
  bl(5185, 447, 34, 34);
  bl(5151, 311, 34, 34);
  bl(5117, 311, 34, 34);
  bl(5219, 311, 34, 34);
  bl(5253, 311, 34, 34);
  bl(5287, 311, 34, 34);
  bl(5321, 311, 34, 34);
  bl(5219, 345, 34, 34);
  bl(5253, 345, 34, 34);
  bl(5287, 345, 34, 34);
  bl(5321, 345, 34, 34);
  bl(5321, 481, 34, 34);
  bl(5287, 481, 34, 34);
  bl(5253, 481, 34, 34);
  bl(5219, 481, 34, 34);
  bl(5219, 413, 34, 34);
  bl(5219, 379, 34, 34);
  bl(5219, 447, 34, 34);
  bl(5253, 447, 34, 34);
  bl(5287, 447, 34, 34);
  bl(5321, 447, 34, 34);
  bl(5321, 379, 34, 34);
  bl(5287, 379, 34, 34);
  bl(5253, 379, 34, 34);
  bl(5253, 413, 34, 34);
  bl(5287, 413, 34, 34);
  bl(5321, 413, 34, 34);
  levelObjects.push({type:'spike', x:5253, y:277, w:GRID, h:GRID, rotation:0});
  sl(5321, 250.93);
  levelObjects.push({type:'spike', x:5287, y:277, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5321, y:277, w:GRID, h:GRID, rotation:0});
  sl(5287, 250.93);
  bl(5355, 311, 34, 34);
  bl(5389, 311, 34, 34);
  bl(5423, 311, 34, 34);
  bl(5355, 345, 34, 34);
  bl(5389, 345, 34, 34);
  bl(5423, 345, 34, 34);
  bl(5423, 481, 34, 34);
  bl(5389, 481, 34, 34);
  bl(5355, 481, 34, 34);
  bl(5355, 447, 34, 34);
  bl(5389, 447, 34, 34);
  bl(5423, 447, 34, 34);
  bl(5423, 413, 34, 34);
  bl(5423, 379, 34, 34);
  bl(5389, 379, 34, 34);
  bl(5355, 379, 34, 34);
  bl(5355, 413, 34, 34);
  bl(5389, 413, 34, 34);
  levelObjects.push({type:'spike', x:5355, y:277, w:GRID, h:GRID, rotation:0});
  bl(5457, 311, 34, 34);
  bl(5457, 345, 34, 34);
  bl(5457, 379, 34, 34);
  bl(5457, 413, 34, 34);
  bl(5457, 447, 34, 34);
  bl(5457, 481, 34, 34);
  levelObjects.push({type:'spike', x:5525, y:277, w:GRID, h:GRID, rotation:0});
  bl(5491, 311, 34, 34);
  bl(5525, 311, 34, 34);
  bl(5491, 481, 34, 34);
  bl(5525, 481, 34, 34);
  bl(5525, 345, 34, 34);
  bl(5491, 345, 34, 34);
  bl(5491, 379, 34, 34);
  bl(5491, 413, 34, 34);
  bl(5525, 413, 34, 34);
  bl(5525, 447, 34, 34);
  bl(5525, 379, 34, 34);
  bl(5491, 447, 34, 34);
  sl(5559, 250.93);
  sl(5593, 250.93);
  levelObjects.push({type:'spike', x:5559, y:277, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5593, y:277, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5627, y:277, w:GRID, h:GRID, rotation:0});
  bl(5559, 311, 34, 34);
  bl(5593, 311, 34, 34);
  bl(5627, 311, 34, 34);
  bl(5661, 311, 34, 34);
  bl(5559, 481, 34, 34);
  bl(5593, 481, 34, 34);
  bl(5627, 481, 34, 34);
  bl(5661, 481, 34, 34);
  bl(5661, 379, 34, 34);
  bl(5627, 379, 34, 34);
  bl(5627, 345, 34, 34);
  bl(5593, 345, 34, 34);
  bl(5559, 345, 34, 34);
  bl(5559, 447, 34, 34);
  bl(5593, 447, 34, 34);
  bl(5627, 447, 34, 34);
  bl(5661, 447, 34, 34);
  bl(5661, 345, 34, 34);
  bl(5661, 413, 34, 34);
  bl(5627, 413, 34, 34);
  bl(5593, 413, 34, 34);
  bl(5559, 413, 34, 34);
  bl(5559, 379, 34, 34);
  bl(5593, 379, 34, 34);
  bl(5695, 311, 34, 34);
  bl(5729, 311, 34, 34);
  bl(5695, 481, 34, 34);
  bl(5729, 481, 34, 34);
  bl(5763, 481, 34, 34);
  bl(5763, 447, 34, 34);
  bl(5763, 413, 34, 34);
  bl(5763, 379, 34, 34);
  bl(5729, 345, 34, 34);
  bl(5695, 345, 34, 34);
  bl(5695, 379, 34, 34);
  bl(5695, 447, 34, 34);
  bl(5729, 447, 34, 34);
  bl(5729, 413, 34, 34);
  bl(5729, 379, 34, 34);
  bl(5695, 413, 34, 34);
  bl(5763, 311, 34, 34);
  bl(5763, 345, 34, 34);
  bl(5865, 481, 34, 34);
  bl(5831, 481, 34, 34);
  bl(5797, 481, 34, 34);
  bl(5797, 447, 34, 34);
  bl(5797, 413, 34, 34);
  bl(5797, 379, 34, 34);
  bl(5865, 447, 34, 34);
  bl(5831, 447, 34, 34);
  bl(5831, 413, 34, 34);
  bl(5831, 379, 34, 34);
  bl(5865, 379, 34, 34);
  bl(5865, 413, 34, 34);
  bl(5797, 345, 34, 34);
  bl(5831, 345, 34, 34);
  bl(5865, 345, 34, 34);
  bl(6001, 481, 34, 34);
  bl(5967, 481, 34, 34);
  bl(5933, 481, 34, 34);
  bl(5899, 481, 34, 34);
  bl(6001, 447, 34, 34);
  bl(5967, 447, 34, 34);
  bl(5933, 447, 34, 34);
  bl(5899, 447, 34, 34);
  bl(5899, 379, 34, 34);
  bl(5933, 379, 34, 34);
  bl(5967, 379, 34, 34);
  bl(6001, 379, 34, 34);
  bl(6001, 413, 34, 34);
  bl(5967, 413, 34, 34);
  bl(5933, 413, 34, 34);
  bl(5899, 413, 34, 34);
  bl(5899, 345, 34, 34);
  bl(5933, 345, 34, 34);
  bl(5967, 345, 34, 34);
  bl(6001, 345, 34, 34);
  sl(5899, 284.93);
  sl(5933, 284.93);
  sl(5967, 284.93);
  sl(6001, 284.93);
  levelObjects.push({type:'spike', x:5899, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5933, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:5967, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:6001, y:243, w:GRID, h:GRID, rotation:0});
  bl(6069, 379, 34, 34);
  bl(6069, 413, 34, 34);
  bl(6069, 447, 34, 34);
  bl(6069, 481, 34, 34);
  bl(6035, 481, 34, 34);
  bl(6035, 379, 34, 34);
  bl(6035, 413, 34, 34);
  bl(6035, 447, 34, 34);
  bl(6035, 345, 34, 34);
  bl(6069, 345, 34, 34);
  bl(6103, 345, 34, 34);
  bl(6103, 379, 34, 34);
  bl(6103, 413, 34, 34);
  bl(6103, 481, 34, 34);
  bl(6103, 447, 34, 34);
  bl(6137, 311, 34, 34);
  bl(6137, 345, 34, 34);
  bl(6171, 311, 34, 34);
  bl(6205, 311, 34, 34);
  bl(6171, 345, 34, 34);
  bl(6205, 345, 34, 34);
  bl(6137, 379, 34, 34);
  bl(6171, 379, 34, 34);
  bl(6205, 379, 34, 34);
  bl(6137, 413, 34, 34);
  bl(6171, 413, 34, 34);
  bl(6205, 413, 34, 34);
  bl(6205, 481, 34, 34);
  bl(6171, 481, 34, 34);
  bl(6137, 481, 34, 34);
  bl(6205, 447, 34, 34);
  bl(6171, 447, 34, 34);
  bl(6137, 447, 34, 34);
  bl(6239, 379, 34, 34);
  bl(6239, 413, 34, 34);
  bl(6273, 413, 34, 34);
  bl(6307, 413, 34, 34);
  bl(6341, 413, 34, 34);
  bl(6341, 481, 34, 34);
  bl(6307, 481, 34, 34);
  bl(6273, 481, 34, 34);
  bl(6239, 481, 34, 34);
  bl(6239, 447, 34, 34);
  bl(6273, 447, 34, 34);
  bl(6307, 447, 34, 34);
  bl(6341, 447, 34, 34);
  bl(6273, 311, 34, 34);
  bl(6273, 345, 34, 34);
  bl(6273, 379, 34, 34);
  bl(6239, 311, 34, 34);
  bl(6341, 379, 34, 34);
  bl(6307, 379, 34, 34);
  bl(6239, 345, 34, 34);
  levelObjects.push({type:'spike', x:6273, y:277, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:6307, y:345, w:GRID, h:GRID, rotation:0});
  bl(6409, 379, 34, 34);
  bl(6375, 379, 34, 34);
  bl(6375, 413, 34, 34);
  bl(6409, 413, 34, 34);
  bl(6409, 447, 34, 34);
  bl(6409, 481, 34, 34);
  bl(6375, 481, 34, 34);
  bl(6375, 447, 34, 34);
  bl(6443, 379, 34, 34);
  bl(6443, 413, 34, 34);
  bl(6443, 447, 34, 34);
  bl(6443, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:6511, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6545, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(6477, 413, 34, 34);
  bl(6477, 447, 34, 34);
  bl(6477, 481, 34, 34);
  bl(6477, 379, 34, 34);
  bl(6511, 379, 34, 34);
  bl(6545, 379, 34, 34);
  levelObjects.push({type:'halfspike', x:6579, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6613, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6647, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6681, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(6579, 379, 34, 34);
  bl(6613, 379, 34, 34);
  levelObjects.push({type:'halfspike', x:6715, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6749, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6783, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(6715, 386.93);
  sl(6749, 386.93);
  sl(6783, 386.93);
  levelObjects.push({type:'halfspike', x:6817, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6851, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6885, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(6885, 420.93);
  sl(6817, 386.93);
  levelObjects.push({type:'spike', x:6817, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:6919, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6953, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:6987, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7021, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(6919, 420.93);
  sl(6953, 420.93);
  sl(6987, 420.93);
  sl(7021, 420.93);
  levelObjects.push({type:'halfspike', x:7055, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7089, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7123, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7055, 420.93);
  sl(7089, 420.93);
  levelObjects.push({type:'spike', x:7089, y:379, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:7157, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7191, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7225, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7157, 454.93);
  sl(7191, 454.93);
  sl(7225, 454.93);
  levelObjects.push({type:'halfspike', x:7259, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7293, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7327, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7361, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7259, 454.93);
  sl(7293, 454.93);
  levelObjects.push({type:'halfspike', x:7395, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7429, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7463, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7429, 420.93);
  levelObjects.push({type:'halfspike', x:7497, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7565, 386.93);
  levelObjects.push({type:'halfspike', x:7531, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7565, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7599, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7633, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7667, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7701, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7701, 352.93);
  levelObjects.push({type:'halfspike', x:7735, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7769, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7803, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7837, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7871, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7905, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7837, 318.93);
  levelObjects.push({type:'halfspike', x:7939, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:7973, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:8007, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:8041, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(7973, 284.93);
  bl(8041, 379, 34, 34);
  levelObjects.push({type:'halfspike', x:8075, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:8109, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:8143, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(8109, 379, 34, 34);
  bl(8143, 379, 34, 34);
  sl(8109, 250.93);
  levelObjects.push({type:'spike', x:8109, y:209, w:GRID, h:GRID, rotation:0});
  bl(8075, 379, 34, 34);
  levelObjects.push({type:'halfspike', x:8177, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:8211, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:8245, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(8177, 379, 34, 34);
  bl(8211, 379, 34, 34);
  bl(8245, 379, 34, 34);
  bl(8279, 413, 34, 34);
  bl(8279, 447, 34, 34);
  bl(8279, 481, 34, 34);
  bl(8313, 379, 34, 34);
  bl(8347, 379, 34, 34);
  bl(8381, 379, 34, 34);
  bl(8381, 481, 34, 34);
  bl(8347, 481, 34, 34);
  bl(8313, 481, 34, 34);
  bl(8313, 447, 34, 34);
  bl(8347, 447, 34, 34);
  bl(8381, 447, 34, 34);
  bl(8381, 413, 34, 34);
  bl(8347, 413, 34, 34);
  bl(8313, 413, 34, 34);
  bl(8279, 243, 34, 34);
  bl(8313, 243, 34, 34);
  bl(8347, 243, 34, 34);
  bl(8381, 243, 34, 34);
  bl(8279, 209, 34, 34);
  bl(8279, 175, 34, 34);
  bl(8313, 209, 34, 34);
  bl(8347, 209, 34, 34);
  bl(8381, 209, 34, 34);
  bl(8313, 175, 34, 34);
  bl(8347, 175, 34, 34);
  bl(8381, 175, 34, 34);
  bl(8279, 379, 34, 34);
  bl(8279, 141, 34, 34);
  bl(8279, 107, 34, 34);
  bl(8381, 141, 34, 34);
  bl(8347, 141, 34, 34);
  bl(8313, 141, 34, 34);
  bl(8313, 107, 34, 34);
  bl(8347, 107, 34, 34);
  bl(8381, 107, 34, 34);
  bl(8415, 379, 34, 34);
  bl(8449, 379, 34, 34);
  bl(8483, 379, 34, 34);
  bl(8483, 481, 34, 34);
  bl(8449, 481, 34, 34);
  bl(8415, 481, 34, 34);
  bl(8415, 447, 34, 34);
  bl(8449, 447, 34, 34);
  bl(8483, 447, 34, 34);
  bl(8483, 413, 34, 34);
  bl(8449, 413, 34, 34);
  bl(8415, 413, 34, 34);
  bl(8449, 277, 34, 34);
  bl(8483, 277, 34, 34);
  bl(8415, 243, 34, 34);
  bl(8449, 243, 34, 34);
  bl(8415, 209, 34, 34);
  bl(8449, 209, 34, 34);
  bl(8483, 209, 34, 34);
  bl(8483, 243, 34, 34);
  bl(8415, 175, 34, 34);
  bl(8449, 175, 34, 34);
  bl(8483, 175, 34, 34);
  bl(8483, 141, 34, 34);
  bl(8449, 141, 34, 34);
  bl(8415, 141, 34, 34);
  bl(8415, 107, 34, 34);
  bl(8449, 107, 34, 34);
  bl(8483, 107, 34, 34);
  bl(8517, 379, 34, 34);
  bl(8551, 379, 34, 34);
  bl(8585, 379, 34, 34);
  bl(8585, 481, 34, 34);
  bl(8551, 481, 34, 34);
  bl(8517, 481, 34, 34);
  bl(8517, 447, 34, 34);
  bl(8551, 447, 34, 34);
  bl(8585, 447, 34, 34);
  bl(8585, 413, 34, 34);
  bl(8551, 413, 34, 34);
  bl(8517, 413, 34, 34);
  bl(8517, 277, 34, 34);
  bl(8551, 277, 34, 34);
  bl(8585, 277, 34, 34);
  bl(8517, 209, 34, 34);
  bl(8551, 209, 34, 34);
  bl(8585, 209, 34, 34);
  bl(8517, 243, 34, 34);
  bl(8551, 243, 34, 34);
  bl(8585, 243, 34, 34);
  bl(8517, 175, 34, 34);
  bl(8551, 175, 34, 34);
  bl(8585, 175, 34, 34);
  bl(8585, 107, 34, 34);
  bl(8585, 141, 34, 34);
  bl(8551, 141, 34, 34);
  bl(8517, 141, 34, 34);
  bl(8517, 107, 34, 34);
  bl(8551, 107, 34, 34);
  bl(8619, 379, 34, 34);
  bl(8653, 379, 34, 34);
  bl(8687, 379, 34, 34);
  bl(8721, 379, 34, 34);
  bl(8721, 413, 34, 34);
  bl(8721, 447, 34, 34);
  bl(8687, 447, 34, 34);
  bl(8721, 481, 34, 34);
  bl(8687, 481, 34, 34);
  bl(8653, 481, 34, 34);
  bl(8619, 481, 34, 34);
  bl(8619, 447, 34, 34);
  bl(8653, 447, 34, 34);
  bl(8653, 413, 34, 34);
  bl(8687, 413, 34, 34);
  bl(8619, 413, 34, 34);
  bl(8619, 209, 34, 34);
  bl(8619, 243, 34, 34);
  bl(8619, 175, 34, 34);
  bl(8687, 243, 34, 34);
  bl(8721, 243, 34, 34);
  bl(8653, 243, 34, 34);
  bl(8653, 209, 34, 34);
  bl(8653, 175, 34, 34);
  bl(8687, 209, 34, 34);
  bl(8721, 209, 34, 34);
  bl(8687, 175, 34, 34);
  bl(8721, 175, 34, 34);
  bl(8619, 277, 34, 34);
  bl(8653, 277, 34, 34);
  bl(8687, 277, 34, 34);
  bl(8721, 277, 34, 34);
  bl(8721, 141, 34, 34);
  bl(8721, 107, 34, 34);
  bl(8687, 107, 34, 34);
  bl(8653, 107, 34, 34);
  bl(8619, 107, 34, 34);
  bl(8687, 141, 34, 34);
  bl(8653, 141, 34, 34);
  bl(8619, 141, 34, 34);
  bl(8755, 379, 34, 34);
  bl(8789, 379, 34, 34);
  bl(8823, 379, 34, 34);
  bl(8823, 481, 34, 34);
  bl(8789, 481, 34, 34);
  bl(8755, 481, 34, 34);
  bl(8755, 447, 34, 34);
  bl(8789, 447, 34, 34);
  bl(8823, 447, 34, 34);
  bl(8823, 413, 34, 34);
  bl(8789, 413, 34, 34);
  bl(8755, 413, 34, 34);
  bl(8755, 277, 34, 34);
  bl(8789, 277, 34, 34);
  bl(8823, 277, 34, 34);
  bl(8755, 243, 34, 34);
  bl(8789, 243, 34, 34);
  bl(8823, 243, 34, 34);
  bl(8755, 209, 34, 34);
  bl(8789, 209, 34, 34);
  bl(8823, 209, 34, 34);
  bl(8755, 175, 34, 34);
  bl(8789, 175, 34, 34);
  bl(8823, 175, 34, 34);
  bl(8823, 141, 34, 34);
  bl(8789, 141, 34, 34);
  bl(8755, 141, 34, 34);
  bl(8823, 107, 34, 34);
  bl(8789, 107, 34, 34);
  bl(8755, 107, 34, 34);
  bl(8857, 379, 34, 34);
  bl(8891, 379, 34, 34);
  bl(8925, 379, 34, 34);
  bl(8925, 481, 34, 34);
  bl(8891, 481, 34, 34);
  bl(8857, 481, 34, 34);
  bl(8857, 413, 34, 34);
  bl(8891, 413, 34, 34);
  bl(8925, 413, 34, 34);
  bl(8925, 447, 34, 34);
  bl(8891, 447, 34, 34);
  bl(8857, 447, 34, 34);
  bl(8857, 277, 34, 34);
  bl(8891, 277, 34, 34);
  bl(8925, 243, 34, 34);
  bl(8891, 243, 34, 34);
  bl(8857, 243, 34, 34);
  bl(8857, 209, 34, 34);
  bl(8891, 209, 34, 34);
  bl(8925, 209, 34, 34);
  bl(8857, 175, 34, 34);
  bl(8891, 175, 34, 34);
  bl(8925, 175, 34, 34);
  bl(8925, 141, 34, 34);
  bl(8891, 141, 34, 34);
  bl(8857, 141, 34, 34);
  bl(8925, 107, 34, 34);
  bl(8891, 107, 34, 34);
  bl(8857, 107, 34, 34);
  bl(8959, 379, 34, 34);
  bl(8993, 379, 34, 34);
  bl(9027, 379, 34, 34);
  bl(9061, 379, 34, 34);
  bl(9061, 413, 34, 34);
  bl(9061, 447, 34, 34);
  bl(9061, 481, 34, 34);
  bl(9027, 413, 34, 34);
  bl(9027, 447, 34, 34);
  bl(9027, 481, 34, 34);
  bl(8993, 481, 34, 34);
  bl(8959, 481, 34, 34);
  bl(8959, 413, 34, 34);
  bl(8993, 413, 34, 34);
  bl(8993, 447, 34, 34);
  bl(8959, 447, 34, 34);
  bl(9061, 243, 34, 34);
  bl(9027, 243, 34, 34);
  bl(8993, 243, 34, 34);
  bl(8959, 243, 34, 34);
  bl(9061, 209, 34, 34);
  bl(9061, 175, 34, 34);
  bl(8959, 209, 34, 34);
  bl(8993, 209, 34, 34);
  bl(9027, 209, 34, 34);
  bl(8959, 175, 34, 34);
  bl(8993, 175, 34, 34);
  bl(9027, 175, 34, 34);
  bl(9061, 141, 34, 34);
  bl(9061, 107, 34, 34);
  bl(8993, 141, 34, 34);
  bl(8959, 141, 34, 34);
  bl(9027, 141, 34, 34);
  bl(9027, 107, 34, 34);
  bl(8993, 107, 34, 34);
  bl(8959, 107, 34, 34);
  bl(10251, 209, 34, 34);
  bl(10251, 175, 34, 34);
  bl(10251, 243, 34, 34);
  levelObjects.push({type:'spike', x:10727, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10761, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10761, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10727, y:175, w:GRID, h:GRID, rotation:0});
  bl(10693, 175, 34, 34);
  bl(10693, 481, 34, 34);
  levelObjects.push({type:'spike', x:10795, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10829, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10863, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10863, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10829, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10795, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10897, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10931, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10965, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10965, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10931, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10897, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10999, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11033, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11067, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11101, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11101, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11067, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11033, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:10999, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11135, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11169, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11169, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11135, y:175, w:GRID, h:GRID, rotation:0});
  bl(11203, 175, 34, 34);
  bl(11203, 481, 34, 34);
  bl(11645, 481, 34, 34);
  bl(11645, 447, 34, 34);
  levelObjects.push({type:'spike', x:11679, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11713, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11747, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:11781, y:481, w:GRID, h:GRID, rotation:0});
  bl(12087, 175, 34, 34);
  levelObjects.push({type:'spike', x:12121, y:175, w:GRID, h:GRID, rotation:0});
  bl(12087, 209, 34, 34);
  levelObjects.push({type:'spike', x:12155, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12189, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12223, y:175, w:GRID, h:GRID, rotation:0});
  bl(12393, 481, 34, 34);
  levelObjects.push({type:'spike', x:12427, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12461, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12495, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12529, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12563, y:481, w:GRID, h:GRID, rotation:0});
  bl(12597, 481, 34, 34);
  levelObjects.push({type:'spike', x:12631, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12665, y:481, w:GRID, h:GRID, rotation:0});
  bl(12597, 447, 34, 34);
  bl(12801, 447, 34, 34);
  bl(12801, 481, 34, 34);
  levelObjects.push({type:'spike', x:12699, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12733, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:12767, y:481, w:GRID, h:GRID, rotation:0});
  bl(12801, 413, 34, 34);
  levelObjects.push({type:'spike', x:13141, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13107, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13073, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13243, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13209, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13175, y:175, w:GRID, h:GRID, rotation:0});
  bl(13277, 243, 34, 34);
  bl(13277, 209, 34, 34);
  bl(13277, 175, 34, 34);
  levelObjects.push({type:'spike', x:13311, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13345, y:175, w:GRID, h:GRID, rotation:0});
  bl(13277, 277, 34, 34);
  levelObjects.push({type:'spike', x:13379, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13413, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13447, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13481, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13515, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13549, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13583, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13617, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13651, y:175, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:13685, y:175, w:GRID, h:GRID, rotation:0});
  bl(13753, 413, 34, 34);
  bl(13753, 481, 34, 34);
  bl(13787, 413, 34, 34);
  bl(13821, 413, 34, 34);
  bl(13753, 209, 34, 34);
  bl(13753, 175, 34, 34);
  bl(13787, 209, 34, 34);
  bl(13821, 209, 34, 34);
  bl(13821, 175, 34, 34);
  bl(13787, 175, 34, 34);
  bl(13821, 481, 34, 34);
  bl(13787, 481, 34, 34);
  bl(13753, 243, 34, 34);
  bl(13787, 243, 34, 34);
  bl(13821, 243, 34, 34);
  levelObjects.push({type:'spike', x:13719, y:175, w:GRID, h:GRID, rotation:0});
  bl(13821, 141, 34, 34);
  bl(13787, 141, 34, 34);
  bl(13753, 141, 34, 34);
  bl(13753, 447, 34, 34);
  bl(13787, 447, 34, 34);
  bl(13821, 447, 34, 34);
  bl(13855, 413, 34, 34);
  bl(13889, 413, 34, 34);
  bl(13923, 413, 34, 34);
  bl(13923, 209, 34, 34);
  bl(13923, 175, 34, 34);
  bl(13855, 209, 34, 34);
  bl(13889, 209, 34, 34);
  bl(13889, 175, 34, 34);
  bl(13855, 175, 34, 34);
  bl(13923, 481, 34, 34);
  bl(13889, 481, 34, 34);
  bl(13855, 481, 34, 34);
  bl(13855, 243, 34, 34);
  bl(13889, 243, 34, 34);
  bl(13923, 243, 34, 34);
  bl(13923, 141, 34, 34);
  bl(13889, 141, 34, 34);
  bl(13855, 141, 34, 34);
  bl(13855, 447, 34, 34);
  bl(13889, 447, 34, 34);
  bl(13923, 447, 34, 34);
  bl(13957, 413, 34, 34);
  bl(13991, 413, 34, 34);
  bl(14025, 413, 34, 34);
  bl(13957, 209, 34, 34);
  bl(13957, 175, 34, 34);
  bl(13991, 175, 34, 34);
  bl(14025, 175, 34, 34);
  bl(14025, 209, 34, 34);
  bl(13991, 209, 34, 34);
  bl(14025, 481, 34, 34);
  bl(13991, 481, 34, 34);
  bl(13957, 481, 34, 34);
  bl(13957, 243, 34, 34);
  bl(13991, 243, 34, 34);
  bl(14025, 243, 34, 34);
  bl(13957, 141, 34, 34);
  bl(13991, 141, 34, 34);
  bl(14025, 141, 34, 34);
  bl(13957, 447, 34, 34);
  bl(13991, 447, 34, 34);
  bl(14025, 447, 34, 34);
  bl(14059, 413, 34, 34);
  bl(14093, 413, 34, 34);
  bl(14127, 413, 34, 34);
  bl(14161, 413, 34, 34);
  bl(14059, 175, 34, 34);
  bl(14093, 175, 34, 34);
  bl(14127, 175, 34, 34);
  bl(14161, 175, 34, 34);
  bl(14161, 209, 34, 34);
  bl(14127, 209, 34, 34);
  bl(14093, 209, 34, 34);
  bl(14059, 209, 34, 34);
  bl(14161, 481, 34, 34);
  bl(14127, 481, 34, 34);
  bl(14093, 481, 34, 34);
  bl(14059, 481, 34, 34);
  bl(14059, 243, 34, 34);
  bl(14093, 243, 34, 34);
  bl(14127, 243, 34, 34);
  bl(14161, 243, 34, 34);
  bl(14059, 141, 34, 34);
  bl(14093, 141, 34, 34);
  bl(14127, 141, 34, 34);
  bl(14161, 141, 34, 34);
  bl(14059, 447, 34, 34);
  bl(14093, 447, 34, 34);
  bl(14127, 447, 34, 34);
  bl(14161, 447, 34, 34);
  bl(14195, 413, 34, 34);
  bl(14229, 413, 34, 34);
  bl(14229, 209, 34, 34);
  bl(14229, 175, 34, 34);
  bl(14195, 175, 34, 34);
  bl(14195, 209, 34, 34);
  bl(14195, 481, 34, 34);
  bl(14229, 243, 34, 34);
  bl(14195, 243, 34, 34);
  bl(14229, 141, 34, 34);
  bl(14195, 141, 34, 34);
  bl(14263, 447, 34, 34);
  bl(14229, 447, 34, 34);
  bl(14229, 481, 34, 34);
  bl(14263, 481, 34, 34);
  bl(14195, 447, 34, 34);
  bl(14297, 447, 34, 34);
  bl(14331, 447, 34, 34);
  bl(14365, 447, 34, 34);
  bl(14297, 481, 34, 34);
  bl(14331, 481, 34, 34);
  bl(14365, 481, 34, 34);
  bl(14399, 447, 34, 34);
  bl(14433, 447, 34, 34);
  bl(14467, 447, 34, 34);
  bl(14501, 447, 34, 34);
  bl(14399, 481, 34, 34);
  bl(14433, 481, 34, 34);
  bl(14467, 481, 34, 34);
  bl(14501, 481, 34, 34);
  bl(14535, 447, 34, 34);
  bl(14569, 447, 34, 34);
  bl(14535, 481, 34, 34);
  bl(14569, 481, 34, 34);
  bl(14603, 447, 34, 34);
  bl(14603, 481, 34, 34);
  bl(14671, 447, 34, 34);
  bl(14671, 481, 34, 34);
  bl(14705, 447, 34, 34);
  bl(14705, 481, 34, 34);
  bl(14637, 447, 34, 34);
  bl(14637, 481, 34, 34);
  bl(14841, 413, 34, 34);
  bl(14841, 447, 34, 34);
  bl(14841, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:14807, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14841, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14773, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14739, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14875, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14909, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14943, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:14977, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15011, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15045, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(14977, 379, 34, 34);
  bl(14977, 413, 34, 34);
  bl(14977, 447, 34, 34);
  bl(14977, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:15079, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15113, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15147, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15181, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15113, 345, 34, 34);
  bl(15113, 413, 34, 34);
  bl(15113, 447, 34, 34);
  bl(15113, 413, 34, 34);
  bl(15113, 447, 34, 34);
  bl(15113, 481, 34, 34);
  bl(15113, 379, 34, 34);
  levelObjects.push({type:'halfspike', x:15215, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15249, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15283, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15249, 311, 34, 34);
  bl(15283, 481, 34, 34);
  bl(15249, 481, 34, 34);
  bl(15283, 447, 34, 34);
  bl(15249, 159.13, 34, 34);
  levelObjects.push({type:'spike', x:15249, y:193.13, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:15283, y:193.13, w:GRID, h:GRID, rotation:0});
  bl(15283, 159.13, 34, 34);
  bl(15249, 379, 34, 34);
  bl(15249, 413, 34, 34);
  bl(15249, 447, 34, 34);
  bl(15249, 379, 34, 34);
  bl(15249, 413, 34, 34);
  bl(15249, 345, 34, 34);
  levelObjects.push({type:'halfspike', x:15317, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15351, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15385, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15385, 481, 34, 34);
  bl(15351, 481, 34, 34);
  bl(15317, 481, 34, 34);
  bl(15317, 447, 34, 34);
  bl(15351, 447, 34, 34);
  bl(15385, 447, 34, 34);
  levelObjects.push({type:'spike', x:15317, y:193.13, w:GRID, h:GRID, rotation:0});
  bl(15317, 159.13, 34, 34);
  levelObjects.push({type:'halfspike', x:15419, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15453, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15487, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15521, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15487, 447, 34, 34);
  bl(15487, 481, 34, 34);
  bl(15453, 447, 34, 34);
  bl(15419, 447, 34, 34);
  bl(15453, 481, 34, 34);
  bl(15419, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:15555, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15589, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15623, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15623, 413, 34, 34);
  bl(15623, 447, 34, 34);
  bl(15623, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:15657, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15691, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15725, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15759, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15759, 379, 34, 34);
  bl(15759, 413, 34, 34);
  bl(15759, 447, 34, 34);
  bl(15759, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:15793, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15827, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15861, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(15895, 345, 34, 34);
  bl(15895, 379, 34, 34);
  bl(15895, 413, 34, 34);
  bl(15895, 447, 34, 34);
  bl(15895, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:15895, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15929, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:15963, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(16031, 311, 34, 34);
  bl(16031, 345, 34, 34);
  bl(16031, 379, 34, 34);
  bl(16031, 413, 34, 34);
  bl(16031, 447, 34, 34);
  bl(16031, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:15997, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16031, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16065, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(16167, 277, 34, 34);
  bl(16167, 311, 34, 34);
  bl(16167, 345, 34, 34);
  bl(16167, 379, 34, 34);
  bl(16167, 413, 34, 34);
  bl(16167, 447, 34, 34);
  bl(16167, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:16099, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16133, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16167, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16201, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(16303, 243, 34, 34);
  bl(16303, 277, 34, 34);
  bl(16303, 311, 34, 34);
  bl(16303, 345, 34, 34);
  bl(16303, 379, 34, 34);
  bl(16303, 413, 34, 34);
  bl(16303, 447, 34, 34);
  bl(16303, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:16235, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16269, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16303, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16337, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16371, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16405, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(16439, 209, 34, 34);
  bl(16439, 243, 34, 34);
  bl(16439, 277, 34, 34);
  bl(16439, 311, 34, 34);
  bl(16439, 345, 34, 34);
  bl(16439, 379, 34, 34);
  bl(16439, 413, 34, 34);
  bl(16439, 447, 34, 34);
  bl(16439, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:16439, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16541, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16507, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16473, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(16541, 250.93);
  sl(16473, 216.93);
  levelObjects.push({type:'halfspike', x:16643, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16609, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16575, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(16575, 250.93);
  sl(16643, 284.93);
  levelObjects.push({type:'halfspike', x:16745, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16711, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16677, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(16677, 284.93);
  sl(16745, 318.93);
  levelObjects.push({type:'halfspike', x:16847, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16813, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16779, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(16779, 318.93);
  sl(16813, 318.93);
  levelObjects.push({type:'halfspike', x:16881, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16983, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16949, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:16915, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(16949, 352.93);
  sl(16983, 352.93);
  levelObjects.push({type:'halfspike', x:17085, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17051, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17017, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(17051, 379, 34, 34);
  bl(17051, 413, 34, 34);
  bl(17051, 447, 34, 34);
  bl(17051, 481, 34, 34);
  sl(17051, 371.07);
  sl(17085, 371.07);
  bl(17085, 379, 34, 34);
  bl(17085, 413, 34, 34);
  bl(17085, 447, 34, 34);
  bl(17085, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:17119, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17153, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17187, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17221, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(17119, 379, 34, 34);
  bl(17119, 413, 34, 34);
  bl(17119, 447, 34, 34);
  bl(17119, 481, 34, 34);
  sl(17119, 371.07);
  levelObjects.push({type:'halfspike', x:17323, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17289, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17255, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(17323, 413, 34, 34);
  bl(17323, 447, 34, 34);
  bl(17323, 481, 34, 34);
  sl(17323, 405.07);
  bl(17255, 413, 34, 34);
  bl(17255, 447, 34, 34);
  sl(17255, 405.07);
  bl(17255, 481, 34, 34);
  sl(17289, 405.07);
  bl(17289, 413, 34, 34);
  bl(17289, 447, 34, 34);
  bl(17289, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:17357, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17391, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17425, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(17357, 413, 34, 34);
  bl(17357, 481, 34, 34);
  bl(17357, 447, 34, 34);
  sl(17357, 405.07);
  sl(17425, 420.93);
  levelObjects.push({type:'halfspike', x:17459, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17493, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17527, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17561, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(17561, 488.93);
  sl(17493, 454.93);
  bl(17867, 481, 34, 34);
  levelObjects.push({type:'spike', x:17833, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:17799, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:17901, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(18003, 454.93);
  levelObjects.push({type:'halfspike', x:17935, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:17969, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18003, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(17969, 454.93);
  bl(18105, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:18037, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18071, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18105, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(18071, 481, 34, 34);
  bl(18139, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:18173, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18207, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18241, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18139, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(18241, 454.93);
  sl(18275, 454.93);
  levelObjects.push({type:'halfspike', x:18275, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18309, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18343, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(18411, 420.93);
  levelObjects.push({type:'halfspike', x:18377, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18411, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:18445, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(18377, 420.93);
  bl(18547, 481, 34, 34);
  levelObjects.push({type:'spike', x:18581, y:481, w:GRID, h:GRID, rotation:0});
  bl(18513, 481, 34, 34);
  bl(18479, 481, 34, 34);
  levelObjects.push({type:'spike', x:18615, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:18853, y:481, w:GRID, h:GRID, rotation:0});
  bl(18853, 311, 34, 34);
  levelObjects.push({type:'spike', x:18853, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:18884.73, y:481, w:GRID, h:GRID, rotation:0});
  bl(18884.73, 311, 34, 34);
  levelObjects.push({type:'spike', x:18884.73, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:19127.27, y:481, w:GRID, h:GRID, rotation:0});
  bl(19127.27, 311, 34, 34);
  levelObjects.push({type:'spike', x:19127.27, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:19156.73, y:481, w:GRID, h:GRID, rotation:0});
  bl(19156.73, 311, 34, 34);
  levelObjects.push({type:'spike', x:19156.73, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:19186.2, y:481, w:GRID, h:GRID, rotation:0});
  bl(19186.2, 311, 34, 34);
  levelObjects.push({type:'spike', x:19186.2, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:19397, y:481, w:GRID, h:GRID, rotation:0});
  bl(19397, 311, 34, 34);
  levelObjects.push({type:'spike', x:19397, y:345, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:19646.33, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:19646.33, y:345, w:GRID, h:GRID, rotation:0});
  bl(19646.33, 311, 34, 34);
  levelObjects.push({type:'spike', x:19941, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:20043, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(20009, 481, 34, 34);
  levelObjects.push({type:'spike', x:19975, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:20077, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20111, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20145, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(20145, 447, 34, 34);
  bl(20145, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:20179, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20213, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20247, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20281, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(20281, 413, 34, 34);
  bl(20281, 447, 34, 34);
  bl(20281, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:20315, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20349, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20383, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20417, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20451, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20485, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(20417, 379, 34, 34);
  bl(20417, 413, 34, 34);
  bl(20417, 447, 34, 34);
  bl(20417, 481, 34, 34);
  sl(20451, 386.93);
  sl(20519, 420.93);
  sl(20587, 454.93);
  levelObjects.push({type:'halfspike', x:20519, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20553, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20587, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:20621, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(20655, 488.93);
  levelObjects.push({type:'halfspike', x:20655, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'spike', x:20859, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:20893, y:481, w:GRID, h:GRID, rotation:0});
  bl(21131, 413, 34, 34);
  bl(21165, 413, 34, 34);
  levelObjects.push({type:'spike', x:21131, y:447, w:GRID, h:GRID, rotation:2});
  levelObjects.push({type:'spike', x:21165, y:447, w:GRID, h:GRID, rotation:2});
  bl(21199, 413, 34, 34);
  bl(21233, 413, 34, 34);
  levelObjects.push({type:'spike', x:21199, y:447, w:GRID, h:GRID, rotation:2});
  levelObjects.push({type:'spike', x:21233, y:447, w:GRID, h:GRID, rotation:2});
  levelObjects.push({type:'spike', x:21403, y:481, w:GRID, h:GRID, rotation:0});
  bl(21437, 481, 34, 34);
  sl(21743, 488.93);
  levelObjects.push({type:'halfspike', x:21743, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(21777, 488.93);
  sl(21811, 488.93);
  sl(21845, 488.93);
  levelObjects.push({type:'halfspike', x:21777, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:21811, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:21845, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(21981, 454.93);
  levelObjects.push({type:'halfspike', x:21879, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:21913, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:21947, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:21981, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22015, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22049, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22083, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22117, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22151, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22185, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(22117, 420.93);
  sl(22253, 386.93);
  levelObjects.push({type:'halfspike', x:22219, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22253, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22287, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22321, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(22389, 352.93);
  sl(22423, 352.93);
  levelObjects.push({type:'halfspike', x:22355, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22389, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22423, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(22457, 352.93);
  bl(22525, 379, 34, 34);
  bl(22525, 277, 34, 34);
  levelObjects.push({type:'halfspike', x:22457, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22491, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22525, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(22593, 413, 34, 34);
  bl(22661, 447, 34, 34);
  bl(22593, 311, 34, 34);
  levelObjects.push({type:'halfspike', x:22593, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22627, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22661, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22559, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(22661, 345, 34, 34);
  levelObjects.push({type:'halfspike', x:22695, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22729, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22763, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(22744.87, 358.6, 34, 34);
  bl(22744.87, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:22797, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22831, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22865, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(22880.87, 454.93);
  levelObjects.push({type:'halfspike', x:22899, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22933, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23001, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:22967, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'spike', x:22964.73, y:413, w:GRID, h:GRID, rotation:0});
  sl(22964.73, 454.93);
  levelObjects.push({type:'halfspike', x:23035, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23069, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23103, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(23050.87, 454.93);
  levelObjects.push({type:'halfspike', x:23137, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23171, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23205, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(23171, 420.93);
  sl(23205, 420.93);
  levelObjects.push({type:'halfspike', x:23239, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23273, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23307, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23341, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(23239, 420.93);
  sl(23307, 454.93);
  levelObjects.push({type:'halfspike', x:23375, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23409, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:23443, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(23375, 488.93);
  sl(23409, 488.93);
  sl(23443, 488.93);
  levelObjects.push({type:'spike', x:23477, y:481, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:23511, y:481, w:GRID, h:GRID, rotation:0});
  bl(23780.73, 345, 34, 34);
  levelObjects.push({type:'spike', x:23780.73, y:379, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:23780.73, y:481, w:GRID, h:GRID, rotation:0});
  bl(23751.27, 345, 34, 34);
  levelObjects.push({type:'spike', x:23751.27, y:379, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:23753.53, y:481, w:GRID, h:GRID, rotation:0});
  bl(23810.2, 345, 34, 34);
  levelObjects.push({type:'spike', x:23810.2, y:379, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:23807.93, y:481, w:GRID, h:GRID, rotation:0});
  bl(24157, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:24191, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24225, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24225, 488.93);
  sl(24191, 488.93);
  levelObjects.push({type:'halfspike', x:24259, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24293, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24327, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24361, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24395, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24376.87, 488.93);
  levelObjects.push({type:'halfspike', x:24429, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24463, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24497, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24531, 488.93);
  levelObjects.push({type:'halfspike', x:24531, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24565, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24565, 488.93);
  levelObjects.push({type:'halfspike', x:24599, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(24599, 481, 34, 34);
  bl(24633, 447, 34, 34);
  bl(24633, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:24633, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24667, 454.93);
  sl(24701, 454.93);
  levelObjects.push({type:'halfspike', x:24667, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24701, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24735, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24769, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24803, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24837, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24871, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:24905, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24837, 420.93);
  sl(24905, 454.93);
  levelObjects.push({type:'halfspike', x:24939, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25041, 488.93);
  levelObjects.push({type:'halfspike', x:24973, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25007, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25041, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(24973, 488.93);
  sl(25007, 488.93);
  levelObjects.push({type:'halfspike', x:25075, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25109, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25143, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25177, 454.93);
  levelObjects.push({type:'halfspike', x:25177, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25211, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25245, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25245, 454.93);
  levelObjects.push({type:'spike', x:25245, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:25279, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25313, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25347, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25381, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25381, 454.93);
  sl(25347, 454.93);
  sl(25313, 454.93);
  sl(25415, 454.93);
  levelObjects.push({type:'halfspike', x:25415, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25498.87, 454.93);
  levelObjects.push({type:'spike', x:25498.87, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:25449, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25483, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25517, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25585, 454.93);
  levelObjects.push({type:'halfspike', x:25551, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25585, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25619, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25721, 420.93);
  levelObjects.push({type:'halfspike', x:25653, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25687, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25721, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25755, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25789, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25823, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25755, 420.93);
  sl(25789, 420.93);
  levelObjects.push({type:'spike', x:25789, y:379, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:25857, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25891, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25925, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:25857, y:512.73, w:GRID, h:GRID/2, rotation:0});
  sl(25857, 454.93);
  sl(25891, 454.93);
  sl(25925, 454.93);
  levelObjects.push({type:'halfspike', x:25959, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(25993, 243, 34, 34);
  bl(25993, 209, 34, 34);
  bl(25993, 175, 34, 34);
  bl(25993, 447, 34, 34);
  bl(25993, 481, 34, 34);
  bl(25993, 413, 34, 34);
  bl(26435, 481, 34, 34);
  bl(26469, 447, 34, 34);
  bl(26469, 209, 34, 34);
  bl(26503, 413, 34, 34);
  bl(26503, 243, 34, 34);
  bl(26435, 175, 34, 34);
  bl(26503, 481, 34, 34);
  bl(26469, 481, 34, 34);
  bl(26503, 447, 34, 34);
  bl(26503, 209, 34, 34);
  bl(26469, 175, 34, 34);
  bl(26503, 175, 34, 34);
  bl(26605, 481, 34, 34);
  bl(26571, 481, 34, 34);
  bl(26537, 481, 34, 34);
  bl(26537, 447, 34, 34);
  bl(26571, 447, 34, 34);
  bl(26605, 447, 34, 34);
  bl(26605, 209, 34, 34);
  bl(26571, 209, 34, 34);
  bl(26537, 209, 34, 34);
  bl(26537, 175, 34, 34);
  bl(26571, 175, 34, 34);
  bl(26605, 175, 34, 34);
  bl(26537, 413, 34, 34);
  bl(26571, 413, 34, 34);
  bl(26605, 413, 34, 34);
  bl(26537, 243, 34, 34);
  bl(26571, 243, 34, 34);
  bl(26605, 243, 34, 34);
  bl(26673, 413, 34, 34);
  bl(26707, 447, 34, 34);
  bl(26741, 481, 34, 34);
  bl(26673, 243, 34, 34);
  bl(26707, 209, 34, 34);
  bl(26741, 175, 34, 34);
  bl(26707, 481, 34, 34);
  bl(26673, 481, 34, 34);
  bl(26639, 481, 34, 34);
  bl(26639, 447, 34, 34);
  bl(26673, 447, 34, 34);
  bl(26673, 209, 34, 34);
  bl(26639, 209, 34, 34);
  bl(26639, 175, 34, 34);
  bl(26673, 175, 34, 34);
  bl(26707, 175, 34, 34);
  bl(26639, 413, 34, 34);
  bl(26639, 243, 34, 34);
  levelObjects.push({type:'halfspike', x:26843, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26809, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26775, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26843, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26809, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26775, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(26843, 141, 34, 34);
  bl(26809, 141, 34, 34);
  bl(26775, 141, 34, 34);
  bl(26775, 107, 34, 34);
  bl(26809, 107, 34, 34);
  bl(26843, 107, 34, 34);
  bl(26843, 5, 34, 34);
  bl(26809, 5, 34, 34);
  bl(26775, 5, 34, 34);
  bl(26775, 39, 34, 34);
  bl(26809, 39, 34, 34);
  bl(26843, 39, 34, 34);
  bl(26843, 73, 34, 34);
  bl(26809, 73, 34, 34);
  bl(26775, 73, 34, 34);
  levelObjects.push({type:'halfspike', x:26945, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26911, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26877, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26945, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26911, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26877, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(26945, 141, 34, 34);
  bl(26911, 141, 34, 34);
  bl(26877, 141, 34, 34);
  bl(26877, 107, 34, 34);
  bl(26911, 107, 34, 34);
  bl(26945, 107, 34, 34);
  bl(26945, 5, 34, 34);
  bl(26911, 5, 34, 34);
  bl(26877, 5, 34, 34);
  bl(26877, 39, 34, 34);
  bl(26911, 39, 34, 34);
  bl(26945, 39, 34, 34);
  bl(26945, 73, 34, 34);
  bl(26911, 73, 34, 34);
  bl(26877, 73, 34, 34);
  bl(27081, 447, 34, 34);
  bl(27047, 481, 34, 34);
  bl(27081, 481, 34, 34);
  bl(27081, 175, 34, 34);
  levelObjects.push({type:'halfspike', x:27013, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:26979, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(27081, 141, 34, 34);
  bl(27081, 107, 34, 34);
  bl(27081, 73, 34, 34);
  bl(27081, 39, 34, 34);
  bl(27081, 5, 34, 34);
  bl(27047, 141, 34, 34);
  bl(27047, 107, 34, 34);
  bl(27047, 73, 34, 34);
  bl(27047, 39, 34, 34);
  bl(27047, 5, 34, 34);
  bl(26979, 141, 34, 34);
  bl(26979, 107, 34, 34);
  bl(27013, 107, 34, 34);
  bl(27013, 73, 34, 34);
  bl(27013, 39, 34, 34);
  bl(27013, 5, 34, 34);
  bl(26979, 5, 34, 34);
  bl(26979, 39, 34, 34);
  bl(26979, 73, 34, 34);
  bl(27081, 209, 34, 34);
  bl(27013, 141, 34, 34);
  bl(27047, 175, 34, 34);
  bl(27047, 175, 34, 34);
  bl(27115, 243, 34, 34);
  bl(27115, 413, 34, 34);
  bl(27183, 481, 34, 34);
  bl(27149, 481, 34, 34);
  bl(27115, 481, 34, 34);
  bl(27115, 447, 34, 34);
  bl(27149, 447, 34, 34);
  bl(27183, 447, 34, 34);
  bl(27115, 209, 34, 34);
  bl(27149, 209, 34, 34);
  bl(27183, 209, 34, 34);
  bl(27183, 175, 34, 34);
  bl(27149, 175, 34, 34);
  bl(27115, 175, 34, 34);
  bl(27149, 413, 34, 34);
  bl(27183, 413, 34, 34);
  bl(27149, 243, 34, 34);
  bl(27183, 243, 34, 34);
  bl(27115, 73, 34, 34);
  bl(27115, 39, 34, 34);
  bl(27149, 39, 34, 34);
  bl(27183, 39, 34, 34);
  bl(27183, 141, 34, 34);
  bl(27183, 107, 34, 34);
  bl(27183, 73, 34, 34);
  bl(27149, 73, 34, 34);
  bl(27149, 107, 34, 34);
  bl(27149, 141, 34, 34);
  bl(27115, 141, 34, 34);
  bl(27115, 107, 34, 34);
  bl(27183, 5, 34, 34);
  bl(27149, 5, 34, 34);
  bl(27115, 5, 34, 34);
  bl(27285, 413, 34, 34);
  bl(27285, 243, 34, 34);
  bl(27285, 481, 34, 34);
  bl(27251, 481, 34, 34);
  bl(27217, 481, 34, 34);
  bl(27217, 447, 34, 34);
  bl(27251, 447, 34, 34);
  bl(27285, 447, 34, 34);
  bl(27217, 209, 34, 34);
  bl(27251, 209, 34, 34);
  bl(27285, 209, 34, 34);
  bl(27285, 175, 34, 34);
  bl(27217, 175, 34, 34);
  bl(27217, 413, 34, 34);
  bl(27251, 413, 34, 34);
  bl(27217, 243, 34, 34);
  bl(27251, 243, 34, 34);
  bl(27217, 39, 34, 34);
  bl(27285, 39, 34, 34);
  bl(27285, 73, 34, 34);
  bl(27285, 141, 34, 34);
  bl(27251, 73, 34, 34);
  bl(27217, 73, 34, 34);
  bl(27217, 107, 34, 34);
  bl(27217, 141, 34, 34);
  bl(27285, 5, 34, 34);
  bl(27251, 5, 34, 34);
  bl(27217, 5, 34, 34);
  bl(27285, 107, 34, 34);
  bl(27251, 107, 34, 34);
  bl(27251, 39, 34, 34);
  bl(27251, 175, 34, 34);
  bl(27251, 141, 34, 34);
  bl(27319, 447, 34, 34);
  bl(27353, 481, 34, 34);
  bl(27319, 209, 34, 34);
  bl(27353, 175, 34, 34);
  bl(27319, 481, 34, 34);
  bl(27319, 175, 34, 34);
  levelObjects.push({type:'halfspike', x:27387, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27421, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27421, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27387, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27319, 39, 34, 34);
  bl(27319, 141, 34, 34);
  bl(27319, 107, 34, 34);
  bl(27319, 73, 34, 34);
  bl(27353, 141, 34, 34);
  bl(27387, 141, 34, 34);
  bl(27421, 141, 34, 34);
  bl(27387, 5, 34, 34);
  bl(27421, 5, 34, 34);
  bl(27353, 5, 34, 34);
  bl(27319, 5, 34, 34);
  levelObjects.push({type:'halfspike', x:27455, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27489, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27523, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27523, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27489, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27455, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27455, 141, 34, 34);
  bl(27489, 141, 34, 34);
  bl(27523, 141, 34, 34);
  bl(27455, 5, 34, 34);
  bl(27489, 5, 34, 34);
  bl(27523, 5, 34, 34);
  levelObjects.push({type:'spike', x:27455, y:107, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:27489, y:107, w:GRID, h:GRID, rotation:0});
  bl(27625, 413, 34, 34);
  bl(27625, 447, 34, 34);
  bl(27625, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:27557, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27591, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27625, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27591, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27557, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27625, 379, 34, 34);
  bl(27557, 141, 34, 34);
  bl(27591, 141, 34, 34);
  bl(27625, 141, 34, 34);
  bl(27557, 5, 34, 34);
  bl(27591, 5, 34, 34);
  bl(27625, 39, 34, 34);
  bl(27625, 5, 34, 34);
  bl(27693, 413, 34, 34);
  bl(27693, 447, 34, 34);
  bl(27693, 481, 34, 34);
  bl(27659, 413, 34, 34);
  bl(27659, 447, 34, 34);
  bl(27659, 481, 34, 34);
  levelObjects.push({type:'halfspike', x:27727, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27761, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27761, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27727, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27693, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27659, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27659, 379, 34, 34);
  bl(27693, 379, 34, 34);
  bl(27659, 141, 34, 34);
  bl(27693, 141, 34, 34);
  bl(27727, 141, 34, 34);
  bl(27761, 141, 34, 34);
  bl(27693, 5, 34, 34);
  bl(27727, 5, 34, 34);
  bl(27761, 5, 34, 34);
  bl(27659, 39, 34, 34);
  bl(27659, 5, 34, 34);
  levelObjects.push({type:'halfspike', x:27795, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27829, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27863, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27829, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27863, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27795, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27795, 141, 34, 34);
  bl(27829, 141, 34, 34);
  bl(27863, 141, 34, 34);
  levelObjects.push({type:'spike', x:27795, y:107, w:GRID, h:GRID, rotation:0});
  bl(27795, 5, 34, 34);
  bl(27829, 5, 34, 34);
  bl(27863, 5, 34, 34);
  levelObjects.push({type:'spike', x:27863, y:107, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:27897, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27931, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27965, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27965, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27931, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27897, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27897, 141, 34, 34);
  bl(27931, 141, 34, 34);
  bl(27965, 141, 34, 34);
  bl(27897, 5, 34, 34);
  bl(27931, 5, 34, 34);
  bl(27965, 5, 34, 34);
  levelObjects.push({type:'spike', x:27931, y:107, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:27999, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28033, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28067, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28101, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28101, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28067, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28033, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:27999, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(27999, 141, 34, 34);
  bl(28033, 141, 34, 34);
  bl(28067, 141, 34, 34);
  bl(28101, 141, 34, 34);
  bl(27999, 5, 34, 34);
  bl(28033, 5, 34, 34);
  bl(28067, 5, 34, 34);
  bl(28101, 5, 34, 34);
  bl(28135, 175, 34, 34);
  bl(28135, 209, 34, 34);
  bl(28135, 243, 34, 34);
  bl(28203, 243, 34, 34);
  bl(28203, 209, 34, 34);
  bl(28203, 175, 34, 34);
  bl(28169, 243, 34, 34);
  bl(28169, 209, 34, 34);
  bl(28169, 175, 34, 34);
  levelObjects.push({type:'halfspike', x:28135, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28169, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28203, y:512.73, w:GRID, h:GRID/2, rotation:0});
  bl(28135, 277, 34, 34);
  bl(28169, 277, 34, 34);
  bl(28203, 277, 34, 34);
  bl(28135, 141, 34, 34);
  bl(28169, 141, 34, 34);
  bl(28203, 141, 34, 34);
  bl(28135, 5, 34, 34);
  bl(28169, 5, 34, 34);
  bl(28203, 5, 34, 34);
  levelObjects.push({type:'halfspike', x:28237, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28271, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28305, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28305, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28271, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28237, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(28237, 141, 34, 34);
  bl(28271, 141, 34, 34);
  bl(28305, 141, 34, 34);
  bl(28237, 5, 34, 34);
  bl(28271, 5, 34, 34);
  bl(28305, 5, 34, 34);
  levelObjects.push({type:'halfspike', x:28339, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28373, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28407, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28441, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28441, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28407, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28373, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28339, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(28373, 141, 34, 34);
  bl(28407, 141, 34, 34);
  bl(28441, 141, 34, 34);
  bl(28339, 5, 34, 34);
  bl(28373, 5, 34, 34);
  bl(28407, 5, 34, 34);
  bl(28441, 5, 34, 34);
  bl(28339, 107, 34, 34);
  bl(28339, 141, 34, 34);
  levelObjects.push({type:'halfspike', x:28475, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28509, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28543, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28543, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28509, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28475, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(28475, 141, 34, 34);
  bl(28509, 141, 34, 34);
  bl(28543, 141, 34, 34);
  bl(28509, 5, 34, 34);
  bl(28543, 5, 34, 34);
  bl(28475, 39, 34, 34);
  bl(28475, 5, 34, 34);
  levelObjects.push({type:'halfspike', x:28577, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28611, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28645, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28645, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28611, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28577, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(28577, 141, 34, 34);
  bl(28611, 141, 34, 34);
  bl(28577, 5, 34, 34);
  bl(28611, 5, 34, 34);
  bl(28645, 5, 34, 34);
  bl(28645, 107, 34, 34);
  bl(28645, 141, 34, 34);
  levelObjects.push({type:'halfspike', x:28679, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28679, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(28781, 481, 34, 34);
  bl(28747, 481, 34, 34);
  bl(28713, 481, 34, 34);
  levelObjects.push({type:'spike', x:28747, y:447, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28781, y:447, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28713, y:447, w:GRID, h:GRID, rotation:0});
  bl(28713, 175, 34, 34);
  bl(28747, 175, 34, 34);
  bl(28781, 175, 34, 34);
  levelObjects.push({type:'spike', x:28781, y:209, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28747, y:209, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28713, y:209, w:GRID, h:GRID, rotation:0});
  bl(28679, 5, 34, 34);
  bl(28713, 5, 34, 34);
  bl(28747, 5, 34, 34);
  bl(28781, 5, 34, 34);
  bl(28679, 107, 34, 34);
  bl(28713, 107, 34, 34);
  bl(28747, 107, 34, 34);
  bl(28781, 107, 34, 34);
  bl(28679, 141, 34, 34);
  bl(28713, 141, 34, 34);
  bl(28747, 141, 34, 34);
  bl(28781, 141, 34, 34);
  bl(28883, 481, 34, 34);
  bl(28849, 481, 34, 34);
  bl(28815, 481, 34, 34);
  levelObjects.push({type:'spike', x:28815, y:447, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28849, y:447, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28883, y:447, w:GRID, h:GRID, rotation:0});
  bl(28815, 175, 34, 34);
  bl(28849, 175, 34, 34);
  bl(28883, 175, 34, 34);
  levelObjects.push({type:'spike', x:28815, y:209, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28849, y:209, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:28883, y:209, w:GRID, h:GRID, rotation:0});
  bl(28815, 5, 34, 34);
  bl(28849, 5, 34, 34);
  bl(28883, 5, 34, 34);
  bl(28815, 107, 34, 34);
  bl(28849, 107, 34, 34);
  bl(28815, 141, 34, 34);
  bl(28849, 141, 34, 34);
  bl(28883, 141, 34, 34);
  bl(28883, 73, 34, 34);
  bl(28883, 107, 34, 34);
  levelObjects.push({type:'halfspike', x:28917, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28951, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28985, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28985, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28951, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:28917, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(28917, 5, 34, 34);
  bl(28951, 5, 34, 34);
  bl(28985, 5, 34, 34);
  bl(28951, 73, 34, 34);
  bl(28985, 73, 34, 34);
  bl(28917, 141, 34, 34);
  bl(28951, 141, 34, 34);
  bl(28985, 141, 34, 34);
  bl(28951, 107, 34, 34);
  bl(28985, 107, 34, 34);
  bl(28917, 73, 34, 34);
  bl(28917, 107, 34, 34);
  bl(29087, 481, 34, 34);
  bl(29087, 447, 34, 34);
  bl(29121, 447, 34, 34);
  bl(29087, 175, 34, 34);
  bl(29087, 209, 34, 34);
  bl(29121, 209, 34, 34);
  bl(29121, 481, 34, 34);
  bl(29121, 175, 34, 34);
  levelObjects.push({type:'spike', x:29121, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29087, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29087, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29121, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:29019, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29053, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29053, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29019, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(29019, 5, 34, 34);
  bl(29053, 5, 34, 34);
  bl(29087, 5, 34, 34);
  bl(29121, 5, 34, 34);
  bl(29019, 73, 34, 34);
  bl(29053, 73, 34, 34);
  bl(29087, 73, 34, 34);
  bl(29121, 73, 34, 34);
  bl(29019, 141, 34, 34);
  bl(29019, 107, 34, 34);
  bl(29053, 141, 34, 34);
  bl(29087, 141, 34, 34);
  bl(29121, 141, 34, 34);
  bl(29121, 107, 34, 34);
  bl(29087, 107, 34, 34);
  bl(29053, 107, 34, 34);
  bl(29155, 447, 34, 34);
  bl(29189, 447, 34, 34);
  bl(29223, 447, 34, 34);
  bl(29155, 209, 34, 34);
  bl(29189, 209, 34, 34);
  bl(29223, 209, 34, 34);
  bl(29223, 481, 34, 34);
  bl(29189, 481, 34, 34);
  bl(29155, 481, 34, 34);
  bl(29223, 175, 34, 34);
  bl(29189, 175, 34, 34);
  bl(29155, 175, 34, 34);
  levelObjects.push({type:'spike', x:29223, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29189, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29155, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29155, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29189, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29223, y:243, w:GRID, h:GRID, rotation:0});
  bl(29155, 5, 34, 34);
  bl(29189, 5, 34, 34);
  bl(29223, 5, 34, 34);
  bl(29155, 73, 34, 34);
  bl(29189, 73, 34, 34);
  bl(29155, 141, 34, 34);
  bl(29189, 141, 34, 34);
  bl(29189, 107, 34, 34);
  bl(29155, 107, 34, 34);
  bl(29223, 73, 34, 34);
  bl(29223, 107, 34, 34);
  bl(29223, 141, 34, 34);
  bl(29257, 447, 34, 34);
  bl(29257, 481, 34, 34);
  bl(29257, 209, 34, 34);
  bl(29257, 175, 34, 34);
  levelObjects.push({type:'spike', x:29257, y:413, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29257, y:243, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:29291, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29325, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29325, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29291, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(29257, 141, 34, 34);
  bl(29291, 141, 34, 34);
  bl(29325, 141, 34, 34);
  bl(29257, 5, 34, 34);
  bl(29291, 5, 34, 34);
  bl(29325, 5, 34, 34);
  levelObjects.push({type:'spike', x:29257, y:107, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'spike', x:29291, y:107, w:GRID, h:GRID, rotation:0});
  levelObjects.push({type:'halfspike', x:29359, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29393, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29427, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29461, y:512.73, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29461, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29427, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29393, y:178.4, w:GRID, h:GRID/2, rotation:0});
  levelObjects.push({type:'halfspike', x:29359, y:178.4, w:GRID, h:GRID/2, rotation:0});
  bl(29359, 141, 34, 34);
  bl(29393, 141, 34, 34);
  bl(29427, 141, 34, 34);
  bl(29461, 141, 34, 34);
  bl(29359, 5, 34, 34);
  bl(29393, 5, 34, 34);
  bl(29427, 73, 34, 34);
  bl(29427, 39, 34, 34);
  bl(29427, 5, 34, 34);
  levelObjects.push({type:'spike', x:29393, y:39, w:GRID, h:GRID, rotation:0});
  bl(29461, 73, 34, 34);
  bl(29461, 39, 34, 34);
  bl(29461, 5, 34, 34);
  bl(29563, 413, 34, 34);
  bl(29529, 413, 34, 34);
  bl(29495, 413, 34, 34);
  bl(29563, 243, 34, 34);
  bl(29529, 243, 34, 34);
  bl(29495, 243, 34, 34);
  bl(29495, 447, 34, 34);
  bl(29495, 481, 34, 34);
  bl(29495, 209, 34, 34);
  bl(29563, 447, 34, 34);
  bl(29529, 447, 34, 34);
  bl(29529, 481, 34, 34);
  bl(29563, 481, 34, 34);
  bl(29563, 175, 34, 34);
  bl(29563, 209, 34, 34);
  bl(29529, 209, 34, 34);
  bl(29529, 175, 34, 34);
  bl(29495, 175, 34, 34);
  bl(29495, 141, 34, 34);
  bl(29529, 141, 34, 34);
  bl(29563, 141, 34, 34);
  bl(29495, 5, 34, 34);
  bl(29529, 5, 34, 34);
  bl(29563, 5, 34, 34);
  levelObjects.push({type:'spike', x:29495, y:39, w:GRID, h:GRID, rotation:0});
  bl(29665, 413, 34, 34);
  bl(29631, 413, 34, 34);
  bl(29597, 413, 34, 34);
  bl(29665, 243, 34, 34);
  bl(29631, 243, 34, 34);
  bl(29597, 243, 34, 34);
  bl(29665, 447, 34, 34);
  bl(29631, 447, 34, 34);
  bl(29597, 447, 34, 34);
  bl(29597, 481, 34, 34);
  bl(29631, 481, 34, 34);
  bl(29665, 481, 34, 34);
  bl(29597, 209, 34, 34);
  bl(29631, 209, 34, 34);
  bl(29665, 209, 34, 34);
  bl(29665, 175, 34, 34);
  bl(29631, 175, 34, 34);
  bl(29597, 175, 34, 34);
  bl(29597, 141, 34, 34);
  bl(29597, 5, 34, 34);
  bl(29631, 73, 34, 34);
  bl(29665, 73, 34, 34);
  bl(29631, 107, 34, 34);
  bl(29665, 107, 34, 34);
  bl(29631, 141, 34, 34);
  bl(29665, 141, 34, 34);
  levelObjects.push({type:'spike', x:29597, y:107, w:GRID, h:GRID, rotation:0});
  bl(29631, 5, 34, 34);
  bl(29665, 5, 34, 34);
  bl(29801, 413, 34, 34);
  bl(29767, 413, 34, 34);
  bl(29733, 413, 34, 34);
  bl(29699, 413, 34, 34);
  bl(29801, 243, 34, 34);
  bl(29767, 243, 34, 34);
  bl(29733, 243, 34, 34);
  bl(29699, 243, 34, 34);
  bl(29801, 447, 34, 34);
  bl(29767, 447, 34, 34);
  bl(29733, 447, 34, 34);
  bl(29699, 447, 34, 34);
  bl(29699, 481, 34, 34);
  bl(29733, 481, 34, 34);
  bl(29767, 481, 34, 34);
  bl(29801, 481, 34, 34);
  bl(29801, 209, 34, 34);
  bl(29767, 209, 34, 34);
  bl(29699, 209, 34, 34);
  bl(29733, 209, 34, 34);
  bl(29801, 175, 34, 34);
  bl(29767, 175, 34, 34);
  bl(29733, 175, 34, 34);
  bl(29699, 175, 34, 34);
  bl(29733, 141, 34, 34);
  bl(29767, 141, 34, 34);
  bl(29801, 141, 34, 34);
  bl(29733, 5, 34, 34);
  bl(29767, 5, 34, 34);
  bl(29801, 5, 34, 34);
  bl(29699, 141, 34, 34);
  bl(29699, 5, 34, 34);
  bl(29835, 413, 34, 34);
  bl(29835, 243, 34, 34);
  bl(29835, 447, 34, 34);
  bl(29835, 481, 34, 34);
  bl(29835, 209, 34, 34);
  bl(29835, 175, 34, 34);
  bl(29869, 175, 34, 34);
  bl(29869, 243, 34, 34);
  bl(29869, 209, 34, 34);
  bl(29869, 481, 34, 34);
  bl(29869, 413, 34, 34);
  bl(29869, 447, 34, 34);
  bl(29835, 141, 34, 34);
  bl(29835, 5, 34, 34);
  bl(29869, 5, 34, 34);
  bl(29869, 141, 34, 34);
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
