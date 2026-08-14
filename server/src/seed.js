const bcrypt = require("bcryptjs");
const db = require("./db");

function upsertUser(username, password, role, displayName) {
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)"
  ).run(username, hash, role, displayName);
}

// CHANGE THESE PASSWORDS before deploying anywhere real.
upsertUser("admin", "admin123!", "main_admin", "메인관리자");
upsertUser("ops", "ops123!", "ops_admin", "운영 관리자");
upsertUser("maint", "maint123!", "maintenance", "현장관리자");

function ensureLocation(id, name) {
  const exists = db.prepare("SELECT id FROM locations WHERE id = ?").get(id);
  if (!exists) db.prepare("INSERT INTO locations (id, name) VALUES (?, ?)").run(id, name);
}
function ensureFloor(id, locationId, name) {
  const exists = db.prepare("SELECT id FROM floors WHERE id = ?").get(id);
  if (!exists) db.prepare("INSERT INTO floors (id, location_id, name) VALUES (?, ?, ?)").run(id, locationId, name);
}

ensureLocation("main", "메인호텔");
ensureFloor("main-1f", "main", "1층");
ensureFloor("main-3f", "main", "3층");
ensureFloor("main-b1", "main", "지하1층");

ensureLocation("casino", "카지노");
ensureFloor("casino-1f", "casino", "1층");

ensureLocation("plaza", "플라자");
ensureFloor("plaza-1f", "plaza", "1층");
ensureFloor("plaza-2f", "plaza", "2층");

ensureLocation("wonderbox", "원더박스");
ensureFloor("wonderbox-1f", "wonderbox", "1층");

ensureLocation("cmer", "씨메르");
ensureFloor("cmer-1f", "cmer", "1층");
ensureFloor("cmer-2f", "cmer", "2층");

console.log("Seed complete. Default accounts (change passwords before production):");
console.log("  admin / admin123!  (메인관리자)");
console.log("  ops   / ops123!    (운영 관리자)");
console.log("  maint / maint123!  (현장관리자)");
