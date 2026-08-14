import React, { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc/lib/rfb.js";
import { X, RotateCcw } from "lucide-react";
import { getToken } from "./api";

// 원격 화면 위에서 커서를 더 잘 보이게 하기 위한 확대된 화살표 커서 (기본 커서보다 큼).
const BIG_CURSOR_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 2 L4 20 L9 15.5 L12.5 22 L15.5 20.5 L12 14 L19 14 Z' fill='black' stroke='white' stroke-width='1.5' stroke-linejoin='round'/></svg>`
);

export default function VncModal({ device, onClose }) {
  const containerRef = useRef(null);
  const rfbRef = useRef(null);
  const [status, setStatus] = useState("connecting"); // connecting | connected | error | disconnected
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState(device.vncPassword || "media");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStatus("connecting");
    setErrorMsg("");

    const token = getToken();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/vnc-proxy?token=${encodeURIComponent(token || "")}&deviceId=${encodeURIComponent(device.id)}`;

    const rfb = new RFB(containerRef.current, url, {
      credentials: { password },
    });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfbRef.current = rfb;

    const onConnect = () => setStatus("connected");
    const onDisconnect = (e) => {
      setStatus("error");
      const clean = e && e.detail && e.detail.clean;
      setErrorMsg(clean ? "연결이 종료되었습니다." : "장비에 연결할 수 없습니다. IP와 장비 전원을 확인해 주세요.");
    };
    const onCredentialsRequired = () => {
      setStatus("error");
      setErrorMsg("VNC 비밀번호가 필요합니다.");
    };
    const onSecurityFailure = (e) => {
      setStatus("error");
      setErrorMsg((e && e.detail && e.detail.reason) || "비밀번호가 올바르지 않습니다.");
    };

    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);
    rfb.addEventListener("credentialsrequired", onCredentialsRequired);
    rfb.addEventListener("securityfailure", onSecurityFailure);

    return () => {
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      rfb.removeEventListener("credentialsrequired", onCredentialsRequired);
      rfb.removeEventListener("securityfailure", onSecurityFailure);
      try {
        rfb.disconnect();
      } catch (e) {
        /* ignore */
      }
      rfbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-2 md:p-6">
      <style>{`
        .vnc-canvas-area canvas {
          cursor: url("data:image/svg+xml,${BIG_CURSOR_SVG}") 4 2, auto !important;
        }
      `}</style>
      <div className="bg-stone-900 w-full h-full max-w-5xl max-h-[85vh] rounded-lg overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-3 py-2 bg-stone-800 text-stone-100 text-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{device.name}</span>
            <span className="text-stone-400 font-mono text-xs">{device.ip}</span>
            {status === "connecting" && <span className="text-amber-400 text-xs">연결 중...</span>}
            {status === "connected" && <span className="text-emerald-400 text-xs">연결됨</span>}
            {status === "error" && <span className="text-rose-400 text-xs">연결 실패</span>}
          </div>
          <button onClick={onClose} className="text-stone-300 hover:text-white shrink-0" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="relative flex-1 min-h-0 bg-black">
          <div ref={containerRef} className="vnc-canvas-area absolute inset-0 [&>canvas]:!m-auto [&>canvas]:max-w-full [&>canvas]:max-h-full" />

          {status !== "connected" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="bg-stone-800 rounded-lg p-5 w-72 text-stone-100 text-sm">
                {status === "connecting" && <div className="text-center text-stone-300">VNC로 접속하는 중입니다...</div>}
                {status === "error" && (
                  <>
                    <div className="text-rose-400 mb-3">{errorMsg}</div>
                    <label className="block text-xs text-stone-400 mb-1">VNC 비밀번호</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && retry()}
                      className="w-full mb-3 px-2 py-1.5 rounded bg-stone-900 border border-stone-600 text-stone-100 text-sm focus:outline-none focus:border-orange-500"
                    />
                    <button
                      onClick={retry}
                      className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-sm"
                    >
                      <RotateCcw size={14} /> 다시 연결
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
