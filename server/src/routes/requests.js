const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();

function toRequest(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    symptom: row.symptom,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
  };
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// GET /api/requests?status=open  -- 전체 장비의 점검요청 목록 (본사/운영 관리자 전용)
router.get("/requests", requireAuth, requireRole(["main_admin", "ops_admin"]), (req, res) => {
  const status = req.query.status;
  let sql = `
    SELECT r.*, d.name AS device_name, f.id AS floor_id, f.name AS floor_name, l.id AS location_id, l.name AS location_name
    FROM maintenance_requests r
    JOIN devices d ON r.device_id = d.id
    JOIN floors f ON d.floor_id = f.id
    JOIN locations l ON f.location_id = l.id
  `;
  const params = [];
  if (status) {
    sql += " WHERE r.status = ?";
    params.push(status);
  }
  sql += " ORDER BY r.id DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(
    rows.map((row) => ({
      ...toRequest(row),
      deviceName: row.device_name,
      floorId: row.floor_id,
      floorName: row.floor_name,
      locationId: row.location_id,
      locationName: row.location_name,
    }))
  );
});

// PUT /api/requests/:id  { status }  -- 해결 처리, 본사/운영 관리자 전용
router.put("/requests/:id", requireAuth, requireRole(["main_admin", "ops_admin"]), (req, res) => {
  const { status } = req.body || {};
  if (!["open", "resolved"].includes(status)) {
    return res.status(400).json({ error: "상태 값이 올바르지 않습니다." });
  }
  const result = db.prepare("UPDATE maintenance_requests SET status = ? WHERE id = ?").run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "점검요청을 찾을 수 없습니다." });
  const saved = db.prepare("SELECT * FROM maintenance_requests WHERE id = ?").get(req.params.id);
  res.json(toRequest(saved));
});

// GET /api/floors/:floorId/requests?status=open  -- 해당 층 장비들의 점검요청 (전체 역할 조회 가능, 도면 표시용)
router.get("/floors/:floorId/requests", requireAuth, (req, res) => {
  const status = req.query.status;
  let sql = `SELECT r.* FROM maintenance_requests r JOIN devices d ON r.device_id = d.id WHERE d.floor_id = ?`;
  const params = [req.params.floorId];
  if (status) {
    sql += " AND r.status = ?";
    params.push(status);
  }
  sql += " ORDER BY r.id DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(toRequest));
});

// GET /api/devices/:deviceId/requests
router.get("/devices/:deviceId/requests", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM maintenance_requests WHERE device_id = ? ORDER BY id DESC")
    .all(req.params.deviceId);
  res.json(rows.map(toRequest));
});

// POST /api/devices/:deviceId/requests  { symptom }  -- 유지보수 담당자 전용
router.post("/devices/:deviceId/requests", requireAuth, requireRole(["maintenance"]), (req, res) => {
  const device = db.prepare("SELECT id FROM devices WHERE id = ?").get(req.params.deviceId);
  if (!device) return res.status(404).json({ error: "장비를 찾을 수 없습니다." });

  const { symptom } = req.body || {};
  if (!symptom || !symptom.trim()) {
    return res.status(400).json({ error: "증상 내용을 입력해 주세요." });
  }

  const result = db
    .prepare(
      "INSERT INTO maintenance_requests (device_id, symptom, status, requested_by, requested_at) VALUES (?, ?, 'open', ?, ?)"
    )
    .run(req.params.deviceId, symptom.trim(), req.user.displayName, nowStamp());

  const saved = db.prepare("SELECT * FROM maintenance_requests WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(toRequest(saved));
});

module.exports = router;
