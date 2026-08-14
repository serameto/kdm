const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();

const VALID_TYPES = ["kiosk", "did", "other"];
const VALID_STATUS = ["normal", "faulty", "repair", "removed"];

function toDevice(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    ip: row.ip || "",
    vncPassword: row.vnc_password || "",
    memo: row.memo || "",
    x: row.x,
    y: row.y,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function isIdTaken(id, excludeId) {
  const row = db
    .prepare("SELECT id FROM devices WHERE lower(id) = lower(?) AND id != ?")
    .get(id, excludeId || "");
  return !!row;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// GET /api/floors/:floorId/devices
router.get("/floors/:floorId/devices", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM devices WHERE floor_id = ? ORDER BY rowid").all(req.params.floorId);
  res.json(rows.map(toDevice));
});

// POST /api/floors/:floorId/devices  -- 신규 등록, 본사 관리자 / 운영 관리자만
router.post(
  "/floors/:floorId/devices",
  requireAuth,
  requireRole(["main_admin", "ops_admin"]),
  (req, res) => {
    const floor = db.prepare("SELECT id FROM floors WHERE id = ?").get(req.params.floorId);
    if (!floor) return res.status(404).json({ error: "층을 찾을 수 없습니다." });

    const { id, name, type, status, ip, vncPassword, memo, x, y } = req.body || {};
    if (!id || !id.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: "장비명과 식별 정보를 모두 입력해 주세요." });
    }
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: "장비 유형이 올바르지 않습니다." });
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: "상태 값이 올바르지 않습니다." });
    if (isIdTaken(id.trim(), null)) return res.status(409).json({ error: "이미 등록된 식별 정보입니다." });
    if (typeof x !== "number" || typeof y !== "number") {
      return res.status(400).json({ error: "위치 정보가 없습니다." });
    }

    const row = {
      id: id.trim(),
      floor_id: req.params.floorId,
      name: name.trim(),
      type,
      status,
      ip: (ip || "").trim(),
      vnc_password: (vncPassword || "").trim(),
      memo: (memo || "").trim(),
      x,
      y,
      updated_at: nowStamp(),
      updated_by: req.user.displayName,
    };
    db.prepare(
      `INSERT INTO devices (id, floor_id, name, type, status, ip, vnc_password, memo, x, y, updated_at, updated_by)
       VALUES (@id, @floor_id, @name, @type, @status, @ip, @vnc_password, @memo, @x, @y, @updated_at, @updated_by)`
    ).run(row);
    res.status(201).json(toDevice({ ...row }));
  }
);

// PUT /api/devices/:id  -- 정보 수정 / 상태 변경 / 위치 변경, 본사/운영 관리자 전용
// (유지보수 담당자는 상태 변경 권한이 없으며 점검요청으로 대체됨)
router.put("/devices/:id", requireAuth, requireRole(["main_admin", "ops_admin"]), (req, res) => {
  const existing = db.prepare("SELECT * FROM devices WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "장비를 찾을 수 없습니다." });

  const body = req.body || {};

  const next = {
    id: body.id !== undefined ? body.id.trim() : existing.id,
    name: body.name !== undefined ? body.name.trim() : existing.name,
    type: body.type !== undefined ? body.type : existing.type,
    status: body.status !== undefined ? body.status : existing.status,
    ip: body.ip !== undefined ? body.ip.trim() : existing.ip,
    vnc_password: body.vncPassword !== undefined ? body.vncPassword.trim() : existing.vnc_password,
    memo: body.memo !== undefined ? body.memo.trim() : existing.memo,
    x: body.x !== undefined ? body.x : existing.x,
    y: body.y !== undefined ? body.y : existing.y,
  };

  if (!next.id || !next.name) return res.status(400).json({ error: "장비명과 식별 정보를 모두 입력해 주세요." });
  if (!VALID_TYPES.includes(next.type)) return res.status(400).json({ error: "장비 유형이 올바르지 않습니다." });
  if (!VALID_STATUS.includes(next.status)) return res.status(400).json({ error: "상태 값이 올바르지 않습니다." });
  if (next.id !== existing.id && isIdTaken(next.id, existing.id)) {
    return res.status(409).json({ error: "이미 등록된 식별 정보입니다." });
  }

  db.prepare(
    `UPDATE devices SET id=@id, name=@name, type=@type, status=@status, ip=@ip, vnc_password=@vnc_password, memo=@memo, x=@x, y=@y,
     updated_at=@updated_at, updated_by=@updated_by WHERE id=@oldId`
  ).run({
    ...next,
    updated_at: nowStamp(),
    updated_by: req.user.displayName,
    oldId: existing.id,
  });

  const saved = db.prepare("SELECT * FROM devices WHERE id = ?").get(next.id);
  res.json(toDevice(saved));
});

// DELETE /api/devices/:id  -- 장비 삭제, 본사 관리자 전용
router.delete("/devices/:id", requireAuth, requireRole(["main_admin"]), (req, res) => {
  const result = db.prepare("DELETE FROM devices WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "장비를 찾을 수 없습니다." });
  res.json({ ok: true });
});

module.exports = router;
