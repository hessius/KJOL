import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'kjol.json');

const DEFAULT_DATA = {
  progress: {},
  cache: {},
  settings: {},
};

let data = null;

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (data) return data;
  ensureDir();
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      // Ensure all keys exist
      data.progress = data.progress || {};
      data.cache = data.cache || {};
      data.settings = data.settings || {};
    } else {
      data = { ...DEFAULT_DATA };
    }
  } catch (err) {
    console.error('Failed to load database, starting fresh:', err.message);
    data = { ...DEFAULT_DATA };
  }
  return data;
}

function save() {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function initDb() {
  load();
  console.log('Database initialized at', DB_PATH);
}

// --- Progress ---
export function getProgress() {
  return load().progress;
}

export function setProgress(movieId, movieData) {
  load().progress[movieId] = movieData;
  save();
}

// --- OMDb Cache ---
export function getOmdbCache() {
  return load().cache;
}

export function setOmdbCacheEntry(imdbId, cacheData) {
  load().cache[imdbId] = cacheData;
  save();
}

export function clearOmdbCache() {
  load().cache = {};
  save();
}

export function clearOmdbCacheEntry(imdbId) {
  delete load().cache[imdbId];
  save();
}

// --- Settings ---
export function getSetting(key) {
  return load().settings[key] || '';
}

export function setSetting(key, value) {
  load().settings[key] = value;
  save();
}
