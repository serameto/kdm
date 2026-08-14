const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "..", "uploads");
function deleteImageFile(imagePath) {
  if (!imagePath) return;
  fs.unlink(path.join(uploadsDir, imagePath), () => {});
}

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "..", "..", "uploads"),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("이미지 파일만 업로드할 수 있습니다."));
    cb(null, true);
  },
});

// GET /api/locations  -> full tree with floors (no auth required to view, matches "조회" for all roles)
router.get("/", requireAuth, (req, res) => {
  const locations = db.prepare("SELECT * FROM locations ORDER BY rowid").all();
  const floors = db.prepare("SELECT * FROM floors ORDER BY rowid").all();
  const result = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    floors: floors
      .filter((f) => f.location_id === loc.id)
      .map((f) => ({ id: f.id, name: f.name, hasImage: !!f.image_path })),
  }));
  res.json(result);
});

// POST /api/locations  { name, floorName }  -- 본사 관리자 전용
router.post("/", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const { name, floorName } = req.body || {};
  if (!name || !name.trim() || !floorName || !floorName.trim()) {
    return res.status(400).json({ error: "영업장명과 층 이름을 입력해 주세요." });
  }
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/(^-|-$)/g, "");
  const locId = `${slug || "site"}-${Date.now()}`;
  const floorId = `${locId}-f1`;
  db.prepare("INSERT INTO locations (id, name) VALUES (?, ?)").run(locId, name.trim());
  db.prepare("INSERT INTO floors (id, location_id, name) VALUES (?, ?, ?)").run(floorId, locId, floorName.trim());
  res.status(201).json({ id: locId, name: name.trim(), floors: [{ id: floorId, name: floorName.trim(), hasImage: false }] });
});

// PUT /api/locations/:id  { name }  -- rename, 본사 관리자 전용
router.put("/:id", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "영업장명을 입력해 주세요." });
  const result = db.prepare("UPDATE locations SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "영업장을 찾을 수 없습니다." });
  res.json({ ok: true });
});

// DELETE /api/locations/:id  -- 영업장 삭제 (층/장비/점검요청/도면 이미지 전부 삭제), 본사 관리자 전용
router.delete("/:id", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const loc = db.prepare("SELECT id FROM locations WHERE id = ?").get(req.params.id);
  if (!loc) return res.status(404).json({ error: "영업장을 찾을 수 없습니다." });
  const floors = db.prepare("SELECT image_path FROM floors WHERE location_id = ?").all(req.params.id);
  db.prepare("DELETE FROM locations WHERE id = ?").run(req.params.id);
  floors.forEach((f) => deleteImageFile(f.image_path));
  res.json({ ok: true });
});

// POST /api/locations/:id/floors  { name }  -- 본사 관리자 전용
router.post("/:id/floors", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "층 이름을 입력해 주세요." });
  const loc = db.prepare("SELECT id FROM locations WHERE id = ?").get(req.params.id);
  if (!loc) return res.status(404).json({ error: "영업장을 찾을 수 없습니다." });
  const floorId = `${req.params.id}-f${Date.now()}`;
  db.prepare("INSERT INTO floors (id, location_id, name) VALUES (?, ?, ?)").run(floorId, req.params.id, name.trim());
  res.status(201).json({ id: floorId, name: name.trim(), hasImage: false });
});

// PUT /api/floors/:id  { name }  -- rename floor, 본사 관리자 전용
router.put("/floors/:id", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "층 이름을 입력해 주세요." });
  const result = db.prepare("UPDATE floors SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "층을 찾을 수 없습니다." });
  res.json({ ok: true });
});

// DELETE /api/locations/floors/:id  -- 층 삭제 (해당 층 장비/점검요청/도면 이미지 포함), 본사 관리자 전용
router.delete("/floors/:id", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const floor = db.prepare("SELECT * FROM floors WHERE id = ?").get(req.params.id);
  if (!floor) return res.status(404).json({ error: "층을 찾을 수 없습니다." });
  const remaining = db.prepare("SELECT COUNT(*) AS n FROM floors WHERE location_id = ?").get(floor.location_id);
  if (remaining.n <= 1) return res.status(400).json({ error: "영업장에는 최소 1개의 층이 있어야 합니다." });
  db.prepare("DELETE FROM floors WHERE id = ?").run(req.params.id);
  deleteImageFile(floor.image_path);
  res.json({ ok: true });
});

// POST /api/floors/:id/image  (multipart form field "image")  -- 도면 업로드/교체, 본사 관리자 전용
router.post("/floors/:id/image", requireAuth, requireRole(["main_admin"]), upload.single("image"), (req, res) => {
  const floor = db.prepare("SELECT * FROM floors WHERE id = ?").get(req.params.id);
  if (!floor) return res.status(404).json({ error: "층을 찾을 수 없습니다." });
  if (!req.file) return res.status(400).json({ error: "이미지 파일이 없습니다." });
  db.prepare("UPDATE floors SET image_path = ? WHERE id = ?").run(req.file.filename, req.params.id);
  res.json({ ok: true, imageUrl: `/uploads/${req.file.filename}` });
});

// GET /api/floors/:id  -> single floor detail incl. imageUrl
router.get("/floors/:id", requireAuth, (req, res) => {
  const floor = db.prepare("SELECT * FROM floors WHERE id = ?").get(req.params.id);
  if (!floor) return res.status(404).json({ error: "층을 찾을 수 없습니다." });
  res.json({
    id: floor.id,
    name: floor.name,
    imageUrl: floor.image_path ? `/uploads/${floor.image_path}` : null,
  });
});

module.exports = router;
