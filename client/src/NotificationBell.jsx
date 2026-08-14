import React, { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { api } from "./api";

const POLL_MS = 20000;

export default function NotificationBell({ onSelectDevice }) {
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(false);
  const seenIds = useRef(null); // null until the first poll completes

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const poll = () => {
      api
        .getOpenRequests()
        .then((list) => {
          if (seenIds.current === null) {
            seenIds.current = new Set(list.map((r) => r.id));
          } else {
            const newOnes = list.filter((r) => !seenIds.current.has(r.id));
            newOnes.forEach((r) => {
              seenIds.current.add(r.id);
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("새 점검요청", { body: `${r.deviceName} — ${r.symptom}` });
              }
            });
          }
          setRequests(list);
        })
        .catch(() => {});
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const resolve = (id) => {
    api
      .resolveRequest(id)
      .then(() => setRequests((prev) => prev.filter((r) => r.id !== id)))
      .catch((err) => alert(err.message));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center text-stone-500 hover:text-orange-600"
        aria-label="점검요청 알림"
      >
        <Bell size={16} />
        {requests.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
            {requests.length > 9 ? "9+" : requests.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-50 w-80 bg-white border border-stone-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200 sticky top-0 bg-white">
              <span className="text-sm font-medium text-stone-800">점검요청 알림</span>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-orange-600">
                <X size={14} />
              </button>
            </div>
            {requests.length === 0 ? (
              <div className="text-xs text-stone-400 text-center py-6">대기중인 점검요청이 없습니다.</div>
            ) : (
              <div className="divide-y divide-stone-100">
                {requests.map((r) => (
                  <div key={r.id} className="p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <button
                        onClick={() => {
                          onSelectDevice(r.deviceId, r.locationId, r.floorId);
                          setOpen(false);
                        }}
                        className="font-medium text-stone-800 hover:text-orange-600 text-left"
                      >
                        {r.deviceName}
                      </button>
                      <span className="text-stone-400 font-mono">{r.requestedAt}</span>
                    </div>
                    <div className="text-stone-500 mb-1">{r.locationName} / {r.floorName}</div>
                    <div className="text-stone-700 whitespace-pre-wrap leading-relaxed mb-2">{r.symptom}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">{r.requestedBy}</span>
                      <button onClick={() => resolve(r.id)} className="text-orange-600 hover:underline">
                        읽음
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
