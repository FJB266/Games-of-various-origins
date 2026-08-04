const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'levels.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SUGGESTIONS_FILE = path.join(__dirname, 'data', 'suggestions.json');

// ─── ROLES ───────────────────────────────────────────────────
// Hierarchy: user → moderator → elder → admin
const ROLE_RANK = { user: 0, moderator: 1, elder: 2, admin: 3 };

// Invite codes used at registration.
// ADMIN_INVITE_CODE creates an admin immediately (used to bootstrap the first admin).
// MOD_INVITE_CODES create a PENDING request that only an admin can approve.
// CHANGE THESE before going live — they are checked exactly (case-sensitive).
const ADMIN_INVITE_CODE = 'TRIG-ADMIN-2026';
const MOD_INVITE_CODES = {
  moderator: ['TRIG-MOD-2026'],
  elder: ['TRIG-ELDER-2026']
};

function hasRole(user, minRole) {
  if (!user) return false;
  return (ROLE_RANK[user.role] || 0) >= (ROLE_RANK[minRole] || 0);
}

function roleRank(role) {
  return ROLE_RANK[role] !== undefined ? ROLE_RANK[role] : 0;
}

function findModInviteCode(code) {
  if (!code) return null;
  for (const role of Object.keys(MOD_INVITE_CODES)) {
    if (MOD_INVITE_CODES[role].includes(code)) return role;
  }
  return null;
}

function sanitizeUser(u) {
  return {
    username: u.username,
    displayName: u.displayName,
    role: u.role || 'user',
    modRequest: u.modRequest || null,
    createdAt: u.createdAt,
    levelsUploaded: u.levelsUploaded || 0
  };
}

// ─── DATA: LEVELS ───────────────────────────────────────────
let onlineLevels = [];
let levelIdCounter = 1;

function loadLevels() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (Array.isArray(data.levels)) onlineLevels = data.levels;
      if (data.levelIdCounter) levelIdCounter = data.levelIdCounter;
    }
  } catch(e) {
    console.error('Failed to load levels:', e.message);
  }
}

function saveLevels() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ levels: onlineLevels, levelIdCounter }, null, 2));
  } catch(e) {
    console.error('Failed to save levels:', e.message);
  }
}

// ─── DATA: USERS ────────────────────────────────────────────
let users = [];

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data.users)) users = data.users;
    }
  } catch(e) {
    console.error('Failed to load users:', e.message);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
  } catch(e) {
    console.error('Failed to save users:', e.message);
  }
}

// ─── DATA: SUGGESTIONS ──────────────────────────────────────
let suggestions = [];

function loadSuggestions() {
  try {
    if (fs.existsSync(SUGGESTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
      if (Array.isArray(data.suggestions)) suggestions = data.suggestions;
    }
  } catch(e) {
    console.error('Failed to load suggestions:', e.message);
  }
}

function saveSuggestions() {
  try {
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify({ suggestions }, null, 2));
  } catch(e) {
    console.error('Failed to save suggestions:', e.message);
  }
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const result = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return result === hash;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function findUserByUsername(username) {
  return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function findUserByToken(token) {
  if (!token) return null;
  return users.find(u => u.sessionToken === token);
}

loadLevels();
loadUsers();
loadSuggestions();
onlineLevels.forEach(l => { if (l.likes === undefined) l.likes = 0; });

// Migration: every existing account gets the default role.
users.forEach(u => { if (!u.role) u.role = 'user'; });

app.get('/', (req, res) => res.redirect('/trig-run.html'));

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (!user) return res.status(401).json({ success: false, error: 'Not logged in' });
  req.user = user;
  next();
}

// ─── AUTH ROUTES ─────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, password, inviteCode } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });

  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return res.status(400).json({ success: false, error: 'Username must be 3-20 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return res.status(400).json({ success: false, error: 'Username can only contain letters, numbers, and underscores' });
  if (password.length < 4) return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });

  if (findUserByUsername(trimmed)) return res.status(409).json({ success: false, error: 'Username already taken' });

  // Invite code handling
  let role = 'user';
  let modRequest = null;
  if (inviteCode && typeof inviteCode === 'string' && inviteCode.trim()) {
    if (inviteCode.trim() === ADMIN_INVITE_CODE) {
      role = 'admin';
    } else {
      const requestedRole = findModInviteCode(inviteCode.trim());
      if (requestedRole) {
        modRequest = { requestedRole, requestedAt: new Date().toISOString() };
      } else {
        return res.status(400).json({ success: false, error: 'Invalid invite code' });
      }
    }
  }

  const { salt, hash } = hashPassword(password);
  const token = generateToken();
  const user = {
    username: trimmed,
    displayName: trimmed,
    salt,
    hash,
    sessionToken: token,
    createdAt: new Date().toISOString(),
    levelsUploaded: 0,
    role,
    modRequest
  };

  users.push(user);
  saveUsers();

  res.status(201).json({
    success: true,
    token,
    user: sanitizeUser(user)
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });

  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  user.sessionToken = generateToken();
  saveUsers();

  res.json({
    success: true,
    token: user.sessionToken,
    user: sanitizeUser(user)
  });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (!user) return res.status(401).json({ success: false, error: 'Not logged in' });

  res.json({
    success: true,
    user: sanitizeUser(user)
  });
});

app.put('/api/auth/profile', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (!user) return res.status(401).json({ success: false, error: 'Not logged in' });

  const { displayName } = req.body;
  if (displayName !== undefined) {
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return res.status(400).json({ success: false, error: 'Display name must be 1-30 characters' });
    user.displayName = trimmed;
    saveUsers();
  }

  res.json({
    success: true,
    user: sanitizeUser(user)
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (user) {
    user.sessionToken = null;
    saveUsers();
  }
  res.json({ success: true });
});

// ─── LEVEL ROUTES ────────────────────────────────────────────
// 1. UPLOAD (requires auth)
app.post('/api/levels/upload', requireAuth, (req, res) => {
    const { name, objects } = req.body;
    if (!name || !objects) return res.status(400).json({ success: false, error: 'Missing level information!' });

    const newLevel = {
        id: "lvl_" + levelIdCounter++,
        name: name,
        uploaderId: req.user.username,
        uploaderDisplayName: req.user.displayName,
        uploaderRole: req.user.role || 'user',
        objects: objects,
        downloads: 0,
        likes: 0,
        uploadedAt: new Date().toISOString()
    };

    req.user.levelsUploaded = (req.user.levelsUploaded || 0) + 1;
    saveUsers();
    onlineLevels.unshift(newLevel);
    saveLevels();
    res.status(201).json({ success: true, id: newLevel.id });
});

// 2. BROWSE (with sort support)
app.get('/api/levels/recent', (req, res) => {
    const sort = req.query.sort || 'recent';
    let sorted = [...onlineLevels];
    if (sort === 'downloads') sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    else if (sort === 'likes') sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else sorted.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ levels: sorted });
});

// 3. SEARCH LEVELS (must be before :id route)
app.get('/api/levels/search', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ levels: [] });
    const results = onlineLevels.filter(l => l.name.toLowerCase().includes(q));
    res.json({ levels: results });
});

// 4. FETCH SINGLE LEVEL
app.get('/api/levels/:id', (req, res) => {
    const level = onlineLevels.find(lvl => lvl.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Level not found' });

    level.downloads++;
    saveLevels();
    res.json(level);
});

// 5. DELETE (requires auth — own level, or moderator+)
app.delete('/api/levels/:id', requireAuth, (req, res) => {
    const index = onlineLevels.findIndex(lvl => lvl.id === req.params.id);

    if (index === -1) return res.status(404).json({ success: false, error: 'Level not found' });
    if (onlineLevels[index].uploaderId !== req.user.username && !hasRole(req.user, 'moderator')) {
        return res.status(403).json({ success: false, error: 'Unauthorised deletion attempt!' });
    }

    onlineLevels.splice(index, 1);
    saveLevels();
    res.json({ success: true });
});

// 6. SEARCH USERS (must be before :username route)
app.get('/api/users/search', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ users: [] });
    const results = users.filter(u =>
        u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)
    ).map(sanitizeUser);
    res.json({ users: results });
});

// 7. USER PROFILE (public)
app.get('/api/users/:username', (req, res) => {
    const user = findUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uploadedLevels = onlineLevels.filter(l => l.uploaderId === user.username);
    res.json({
        ...sanitizeUser(user),
        levels: uploadedLevels.map(l => ({ id: l.id, name: l.name, downloads: l.downloads, uploadedAt: l.uploadedAt }))
    });
});

// 8. MY LEVELS (requires auth)
app.get('/api/levels/mine', requireAuth, (req, res) => {
    const myLevels = onlineLevels.filter(l => l.uploaderId === req.user.username);
    res.json({ levels: myLevels });
});

// ─── ADMIN / STAFF MANAGEMENT ────────────────────────────────
// All routes here require auth; role gates enforced per route.

// 1. LIST ALL USERS (elder+)
app.get('/api/admin/users', requireAuth, (req, res) => {
    if (!hasRole(req.user, 'elder')) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    res.json({ users: users.map(sanitizeUser) });
});

// 2. CHANGE ROLE (elder+; elders capped below admin, nobody can change their own role)
app.put('/api/admin/users/:username/role', requireAuth, (req, res) => {
    if (!hasRole(req.user, 'elder')) return res.status(403).json({ success: false, error: 'Insufficient permissions' });

    const target = findUserByUsername(req.params.username);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.username === req.user.username) return res.status(400).json({ success: false, error: 'You cannot change your own role' });

    const newRole = req.body.role;
    if (!ROLE_RANK[newRole]) return res.status(400).json({ success: false, error: 'Invalid role' });

    // Elders may only assign up to 'elder'. Only admins may assign 'admin'.
    if (newRole === 'admin' && !hasRole(req.user, 'admin')) {
        return res.status(403).json({ success: false, error: 'Only admins can assign the admin role' });
    }
    if (target.role === 'admin' && !hasRole(req.user, 'admin')) {
        return res.status(403).json({ success: false, error: 'Only admins can modify admin accounts' });
    }

    target.role = newRole;
    target.modRequest = null; // assigning a role clears any pending request
    saveUsers();
    res.json({ success: true, user: sanitizeUser(target) });
});

// 3. APPROVE A PENDING MOD REQUEST (admin only)
app.post('/api/admin/users/:username/approve', requireAuth, (req, res) => {
    if (!hasRole(req.user, 'admin')) return res.status(403).json({ success: false, error: 'Only admins can approve mod requests' });
    const target = findUserByUsername(req.params.username);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (!target.modRequest) return res.status(400).json({ success: false, error: 'No pending request for this user' });

    target.role = target.modRequest.requestedRole;
    target.modRequest = null;
    saveUsers();
    res.json({ success: true, user: sanitizeUser(target) });
});

// 4. REJECT A PENDING MOD REQUEST (admin only)
app.post('/api/admin/users/:username/reject', requireAuth, (req, res) => {
    if (!hasRole(req.user, 'admin')) return res.status(403).json({ success: false, error: 'Only admins can reject mod requests' });
    const target = findUserByUsername(req.params.username);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (!target.modRequest) return res.status(400).json({ success: false, error: 'No pending request for this user' });

    target.modRequest = null;
    saveUsers();
    res.json({ success: true, user: sanitizeUser(target) });
});

// 5. DELETE USER ACCOUNT (admin only)
app.delete('/api/admin/users/:username', requireAuth, (req, res) => {
    if (!hasRole(req.user, 'admin')) return res.status(403).json({ success: false, error: 'Only admins can delete accounts' });
    const index = users.findIndex(u => u.username.toLowerCase() === req.params.username.toLowerCase());
    if (index === -1) return res.status(404).json({ success: false, error: 'User not found' });
    if (users[index].username === req.user.username) return res.status(400).json({ success: false, error: 'You cannot delete your own account' });

    users.splice(index, 1);
    saveUsers();
    res.json({ success: true });
});

// ─── SUGGESTIONS ─────────────────────────────────────────────
app.post('/api/suggestions', (req, res) => {
    const { username, text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Suggestion text required' });
    if (text.trim().length > 500) return res.status(400).json({ success: false, error: 'Suggestion too long (max 500 chars)' });

    const suggestion = {
        id: 'sug_' + Date.now(),
        username: (username && username.trim()) || 'Anonymous',
        text: text.trim(),
        createdAt: new Date().toISOString()
    };
    suggestions.unshift(suggestion);
    saveSuggestions();
    res.status(201).json({ success: true });
});

app.get('/api/suggestions', (req, res) => {
    res.json({ suggestions: suggestions.slice(0, 50) });
});

// DELETE A SUGGESTION (moderator+)
app.delete('/api/suggestions/:id', requireAuth, (req, res) => {
    if (!hasRole(req.user, 'moderator')) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    const index = suggestions.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Suggestion not found' });
    suggestions.splice(index, 1);
    saveSuggestions();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`✓ Geometry Dash Backend API running on port ${PORT}`));
