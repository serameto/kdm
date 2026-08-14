const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "..", "data.sqlite");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('main_admin', 'ops_admin', 'maintenance')),
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_path TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kiosk', 'did', 'other')),
  status TEXT NOT NULL CHECK (status IN ('normal', 'faulty', 'repair', 'removed')),
  ip TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  x REAL NOT NULL,
  y REAL NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  symptom TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL
);
`);

// --- migrations ---
// devices.vnc_password: 장비별 VNC 접속 비밀번호 (웹 VNC 자동 입력용)
const deviceCols = db.prepare("PRAGMA table_info(devices)").all();
if (!deviceCols.some((c) => c.name === "vnc_password")) {
  db.exec("ALTER TABLE devices ADD COLUMN vnc_password TEXT DEFAULT ''");
}

module.exports = db;
