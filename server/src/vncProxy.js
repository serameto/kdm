const net = require("net");
const { URL } = require("url");
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const db = require("./db");
const { EFFECTIVE_SECRET } = require("./auth");

const VNC_PORT = 5900;

function attachVncProxy(server) {
  const wss = new WebSocketServer({ noServer: true, handleProtocols: () => "binary" });

  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch (e) {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/vnc-proxy") return; // let other upgrade handlers (if any) deal with it

    const token = url.searchParams.get("token");
    const deviceId = url.searchParams.get("deviceId");

    let user;
    try {
      user = jwt.verify(token || "", EFFECTIVE_SECRET);
    } catch (e) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const device = db.prepare("SELECT id, ip FROM devices WHERE id = ?").get(deviceId || "");
    if (!device || !device.ip) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, { user, device });
    });
  });

  wss.on("connection", (ws, req, { device }) => {
    const target = net.connect({ host: device.ip, port: VNC_PORT }, () => {
      // connected to the device's VNC server
    });
    target.setNoDelay(true);

    ws.on("message", (data) => {
      if (target.writable) target.write(data);
    });
    target.on("data", (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    const cleanup = () => {
      target.destroy();
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close();
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
    target.on("close", cleanup);
    target.on("error", cleanup);
  });
}

module.exports = { attachVncProxy };
