import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getProgress, setProgress, getOmdbCache, setOmdbCacheEntry, clearOmdbCache, clearOmdbCacheEntry, getSetting, setSetting } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database
initDb();

// ============================================================================
// API ROUTES
// ============================================================================

// --- Progress ---
app.get('/api/progress', (_req, res) => {
  try {
    const progress = getProgress();
    res.json(progress);
  } catch (err) {
    console.error('GET /api/progress error:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

app.post('/api/progress', (req, res) => {
  try {
    const { movieId, data } = req.body;
    if (!movieId) return res.status(400).json({ error: 'movieId required' });
    setProgress(movieId, data);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/progress error:', err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// --- OMDb Cache ---
app.get('/api/cache', (_req, res) => {
  try {
    const cache = getOmdbCache();
    res.json(cache);
  } catch (err) {
    console.error('GET /api/cache error:', err);
    res.status(500).json({ error: 'Failed to load cache' });
  }
});

app.post('/api/cache', (req, res) => {
  try {
    const { imdbId, data } = req.body;
    if (!imdbId) return res.status(400).json({ error: 'imdbId required' });
    setOmdbCacheEntry(imdbId, data);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/cache error:', err);
    res.status(500).json({ error: 'Failed to save cache entry' });
  }
});

app.delete('/api/cache', (_req, res) => {
  try {
    clearOmdbCache();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/cache error:', err);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

app.delete('/api/cache/:imdbId', (req, res) => {
  try {
    clearOmdbCacheEntry(req.params.imdbId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/cache/:imdbId error:', err);
    res.status(500).json({ error: 'Failed to clear cache entry' });
  }
});

// --- Settings ---
app.get('/api/settings/:key', (req, res) => {
  try {
    const value = getSetting(req.params.key);
    res.json({ key: req.params.key, value });
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: 'Failed to load setting' });
  }
});

app.put('/api/settings/:key', (req, res) => {
  try {
    const { value } = req.body;
    setSetting(req.params.key, value ?? '');
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/settings error:', err);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// ============================================================================
// SERVE FRONTEND (production)
// ============================================================================
const distPath = process.env.DIST_PATH || path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KJOL server running on http://0.0.0.0:${PORT}`);
});
