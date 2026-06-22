'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Utility Functions ───────────────────────────────────────────────────────
const LEVELS_FILE = path.join(__dirname, 'data', 'levels.json');

function generateId(prefix, length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return prefix + '_' + id;
}

function loadLevels() {
  try {
    return JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8'));
  } catch (e) {
    return { levels: [] };
  }
}

function saveLevels(data) {
  try {
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving levels:', e);
    return false;
  }
}

// ── API Routes: Levels ──────────────────────────────────────────────────────

// POST /api/levels/upload - Upload a new level
app.post('/api/levels/upload', (req, res) => {
  try {
    const { name, objects, uploaderId } = req.body;
    
    if (!name || !Array.isArray(objects) || !uploaderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (name.length > 100) {
      return res.status(400).json({ error: 'Level name too long (max 100 chars)' });
    }
    
    if (objects.length > 1000) {
      return res.status(400).json({ error: 'Too many objects (max 1000)' });
    }
    
    const data = loadLevels();
    const levelId = generateId('lv');
    const newLevel = {
      id: levelId,
      name: name.trim(),
      uploaderId: uploaderId,
      objects: objects,
      uploadedAt: new Date().toISOString(),
      downloads: 0
    };
    
    data.levels.unshift(newLevel); // Add to front (most recent first)
    
    if (!saveLevels(data)) {
      return res.status(500).json({ error: 'Failed to save level' });
    }
    
    res.json({ success: true, id: levelId, uploaderId: uploaderId });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/levels/recent - Get recent levels
app.get('/api/levels/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || 20), 100);
    const data = loadLevels();
    const recentLevels = data.levels.slice(0, limit).map(l => ({
      id: l.id,
      name: l.name,
      uploaderId: l.uploaderId,
      uploadedAt: l.uploadedAt,
      downloads: l.downloads
    }));
    res.json({ levels: recentLevels });
  } catch (e) {
    console.error('Fetch recent error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/levels/:id - Get specific level by ID
app.get('/api/levels/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = loadLevels();
    const level = data.levels.find(l => l.id === id);
    
    if (!level) {
      return res.status(404).json({ error: 'Level not found' });
    }
    
    // Increment download count
    level.downloads = (level.downloads || 0) + 1;
    saveLevels(data);
    
    res.json(level);
  } catch (e) {
    console.error('Fetch level error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/levels/:id - Delete a level (only by uploader)
app.delete('/api/levels/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { uploaderId } = req.body;
    
    if (!uploaderId) {
      return res.status(400).json({ error: 'uploaderId required' });
    }
    
    const data = loadLevels();
    const levelIndex = data.levels.findIndex(l => l.id === id);
    
    if (levelIndex === -1) {
      return res.status(404).json({ error: 'Level not found' });
    }
    
    const level = data.levels[levelIndex];
    if (level.uploaderId !== uploaderId) {
      return res.status(403).json({ error: 'Cannot delete other users\' levels' });
    }
    
    data.levels.splice(levelIndex, 1);
    saveLevels(data);
    
    res.json({ success: true });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────
// SPA catch-all — serve index.html for any non-asset GET
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Boot ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Trigonometry Run running → http://localhost:${PORT}`);
});
