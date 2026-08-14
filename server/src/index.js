require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const locationRoutes = require("./routes/locations");
const deviceRoutes = require("./routes/devices");
const requestRoutes = require("./routes/requests");
const { attachVncProxy } = require("./vncProxy");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

// Uploaded floor-plan images (served as static files).
// If this app is exposed outside your internal network, put it behind
// a reverse proxy / VPN so floor plan images aren't publicly reachable.
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api", deviceRoutes);
app.use("/api", requestRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "서버 오류가 발생했습니다." });
});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`Floorplan service API listening on port ${PORT}`);
});
attachVncProxy(server);
