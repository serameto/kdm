const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "[auth] JWT_SECRET이 설정되지 않았습니다. .env에 JWT_SECRET을 설정하고 서버를 재시작하세요. " +
    "지금은 임시 개발용 값을 사용합니다 — 서버를 재시작할 때마다, 또는 다른 방식(docker 등)으로 " +
    "실행할 때마다 이전에 발급된 로그인 토큰이 무효화됩니다."
  );
}
const EFFECTIVE_SECRET = JWT_SECRET || "dev-only-change-me";

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    EFFECTIVE_SECRET,
    { expiresIn: "12h" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다." });
  try {
    req.user = jwt.verify(token, EFFECTIVE_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "세션이 만료되었습니다. 다시 로그인해 주세요." });
  }
}

// roles: array of allowed roles, e.g. requireRole(['main_admin'])
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "이 작업을 수행할 권한이 없습니다." });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, EFFECTIVE_SECRET };
