const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'levels.json');

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

loadLevels();

// 1. UPLOAD ROUTE
app.post('/api/levels/upload', (req, res) => {
    const { name, objects, uploaderId } = req.body;
    if (!name || !objects) return res.status(400).json({ success: false, error: 'Missing level information!' });

    const newLevel = {
        id: "lvl_" + levelIdCounter++,
        name: name,
        uploaderId: uploaderId || 'Anonymous',
        objects: objects, // Holds your compact base64 data string
        downloads: 0,
        uploadedAt: new Date().toISOString()
    };

    onlineLevels.unshift(newLevel); // Adds newest levels to the front of the list
    saveLevels();
    res.status(201).json({ success: true, id: newLevel.id });
});

// 2. BROWSE RECENT ROUTE (Fixed path name to match your fetch request!)
app.get('/api/levels/recent', (req, res) => {
    res.json({ levels: onlineLevels });
});

// 3. FETCH SINGLE LEVEL DETAILS ROUTE
app.get('/api/levels/:id', (req, res) => {
    const level = onlineLevels.find(lvl => lvl.id === req.params.id);
    if (!level) return res.status(404).json({ error: 'Level not found' });
    
    level.downloads++; // Register unique play counter increments
    res.json(level);
});

// 4. DELETE LEVEL ROUTE
app.delete('/api/levels/:id', (req, res) => {
    const { uploaderId } = req.body;
    const index = onlineLevels.findIndex(lvl => lvl.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ success: false, error: 'Level not found' });
    if (onlineLevels[index].uploaderId !== uploaderId) {
        return res.status(403).json({ success: false, error: 'Unauthorised deletion attempt!' });
    }

    onlineLevels.splice(index, 1);
    saveLevels();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`✓ Geometry Dash Backend API running on port ${PORT}`));
