import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Tablet, Tv, Box, ZoomIn, ZoomOut, Maximize2, X, Building2, Plus, Pencil, Trash2,
  MapPin, Crosshair, Upload, Image as ImageIcon, Eye, EyeOff, LogOut, MonitorPlay, Wrench,
  ChevronLeft, ChevronRight, AlertCircle, Menu, List, Check,
} from "lucide-react";
import { api, getStoredUser, clearSession } from "./api";
import Login from "./Login";
import NotificationBell from "./NotificationBell";
import VncModal from "./VncModal";

const VB_W = 1000;
const VB_H = 620;

const STATUS = {
  normal: { label: "정상", hex: "#10b981", badge: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  faulty: { label: "불량", hex: "#f43f5e", badge: "bg-rose-100 text-rose-700 border-rose-300" },
  repair: { label: "수리중", hex: "#a855f7", badge: "bg-purple-100 text-purple-700 border-purple-300" },
  removed: { label: "철거", hex: "#78716c", badge: "bg-stone-200 text-stone-600 border-stone-300" },
};
const TYPES = {
  kiosk: { label: "키오스크", Icon: Tablet },
  did: { label: "DID", Icon: Tv },
  other: { label: "기타 장비", Icon: Box },
};
const TYPE_PREFIX = { kiosk: "KIOSK", did: "DID", other: "ETC" };

const emptyForm = { name: "", type: "kiosk", id: "", status: "normal", ip: "", vncPassword: "", memo: "" };
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isValidIp = (ip) => IP_RE.test(ip.trim()) && ip.trim().split(".").every((n) => Number(n) >= 0 && Number(n) <= 255);

function DeviceMarker({ device, isSelected, zoom, onSelect, dimmed, hasOpenRequest, sizeMult = 1 }) {
  const info = STATUS[device.status];
  const cx = (device.x / 100) * VB_W;
  const cy = (device.y / 100) * VB_H;
  const inv = (1 / zoom) * sizeMult;
  const removed = device.status === "removed";
  const Icon = TYPES[device.type].Icon;

  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${inv})`}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(device.id); }}
      style={{ cursor: "pointer", opacity: dimmed ? 0.3 : 1 }}
    >
      {isSelected && <circle r="15" fill="#f97316" opacity="0.3" className="animate-ping" />}
      <circle r="10" fill={info.hex} stroke="#292524" strokeWidth="2" opacity={removed ? 0.5 : 1} strokeDasharray={removed ? "3 2" : undefined} />
      <Icon x="-6" y="-6" width="12" height="12" color="#fff" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
      {isSelected && <circle r="13" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.9" />}
      {hasOpenRequest && (
        <g transform="translate(8 -8)" style={{ pointerEvents: "none" }}>
          <circle r="6" fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
          <text x="0" y="2.8" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fff">!</text>
        </g>
      )}
      <title>{device.name}</title>
    </g>
  );
}

export default function App() {
  const [user, setUser] = useState(getStoredUser());

  useEffect(() => {
    const onAuthExpired = () => setUser(null);
    window.addEventListener("auth-expired", onAuthExpired);
    return () => window.removeEventListener("auth-expired", onAuthExpired);
  }, []);

  if (!user) return <Login onLoggedIn={setUser} />;
  return <MainApp user={user} onLogout={() => { clearSession(); setUser(null); }} />;
}

function MainApp({ user, onLogout }) {
  const canManageLocations = user.role === "main_admin";
  const canRegisterDevice = user.role === "main_admin" || user.role === "ops_admin";
  const canEditDeviceInfo = user.role === "main_admin" || user.role === "ops_admin";
  const canMoveDevice = user.role === "main_admin" || user.role === "ops_admin";
  const canDeleteDevice = user.role === "main_admin";
  const canRequestMaintenance = user.role === "maintenance";
  const canManageMaintenanceRequests = user.role === "main_admin" || user.role === "ops_admin";

  const [locations, setLocations] = useState([]);
  const [locId, setLocId] = useState(null);
  const [floorId, setFloorId] = useState(null);
  const [floorImageUrl, setFloorImageUrl] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({ normal: true, faulty: true, repair: true, removed: true });
  const [showLegend, setShowLegend] = useState(true);
  const [deviceListCollapsed, setDeviceListCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [dragging, setDragging] = useState(false);

  const [mode, setMode] = useState("view"); // view | placing | moving
  const [pendingPos, setPendingPos] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestSymptom, setRequestSymptom] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [deviceRequests, setDeviceRequests] = useState([]);
  const [vncDevice, setVncDevice] = useState(null);
  const [detailTab, setDetailTab] = useState("info"); // info | requests
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [openRequestDeviceIds, setOpenRequestDeviceIds] = useState(new Set());

  const [showAddLoc, setShowAddLoc] = useState(false);
  const [locForm, setLocForm] = useState({ name: "", floorName: "1층" });
  const [locFormError, setLocFormError] = useState("");

  const [editLocId, setEditLocId] = useState(null);
  const [editLocName, setEditLocName] = useState("");
  const [editLocError, setEditLocError] = useState("");

  const [addFloorLocId, setAddFloorLocId] = useState(null);
  const [addFloorName, setAddFloorName] = useState("");
  const [addFloorError, setAddFloorError] = useState("");

  const [renameFloorId, setRenameFloorId] = useState(null);
  const [renameFloorInput, setRenameFloorInput] = useState("");
  const [renameFloorErr, setRenameFloorErr] = useState("");

  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, confirmLabel, onConfirm }
  const [confirmBusy, setConfirmBusy] = useState(false);

  const svgRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const pendingSelectRef = useRef(null);

  const location = locations.find((l) => l.id === locId) || null;
  const floor = location ? location.floors.find((f) => f.id === floorId) : null;
  const selectedDevice = devices.find((d) => d.id === selectedId) || null;
  const visibleDevices = devices.filter((d) => filters[d.status]);
  const mobilePanelVisible = formOpen || editMode || requestFormOpen || !!selectedDevice || mobileListOpen;

  // Initial load: locations, then default to first location/floor.
  useEffect(() => {
    api
      .getLocations()
      .then((locs) => {
        setLocations(locs);
        if (locs.length > 0) {
          setLocId(locs[0].id);
          setFloorId(locs[0].floors[0]?.id || null);
        }
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const resetView = useCallback(() => {
    const z = isMobile ? 3 : 1;
    setZoom(z);
    setPan({ x: (VB_W / 2) * (1 - z), y: (VB_H / 2) * (1 - z) });
  }, [isMobile]);
  const cancelModes = () => { setMode("view"); setPendingPos(null); setFormOpen(false); setEditMode(false); setRequestFormOpen(false); setFormError(""); };

  // Load floor image + devices whenever the selected floor changes.
  useEffect(() => {
    if (!floorId) return;
    setSelectedId(null);
    cancelModes();
    resetView();
    api.getFloor(floorId).then((f) => setFloorImageUrl(f.imageUrl)).catch(() => setFloorImageUrl(null));
    api.getDevices(floorId).then((list) => {
      setDevices(list);
      const pending = pendingSelectRef.current;
      if (pending && list.some((d) => d.id === pending)) {
        pendingSelectRef.current = null;
        setSelectedId(pending);
        setDeviceListCollapsed(false);
      }
    }).catch((err) => setLoadError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId]);

  const selectFloor = (loc, fl) => {
    setLocId(loc.id);
    setFloorId(fl.id);
    setMobileSidebarOpen(false);
  };

  const closeMobilePanel = () => {
    setSelectedId(null);
    setFormOpen(false);
    setEditMode(false);
    setRequestFormOpen(false);
    setMobileListOpen(false);
  };

  // Load maintenance request history whenever the selected device changes.
  useEffect(() => {
    setDetailTab("info");
    setShowAllRequests(false);
    if (!selectedId) { setDeviceRequests([]); return; }
    api.getDeviceRequests(selectedId).then(setDeviceRequests).catch(() => setDeviceRequests([]));
  }, [selectedId]);

  // Poll which devices on the current floor have an open maintenance request (for the "!" badge).
  useEffect(() => {
    if (!floorId) { setOpenRequestDeviceIds(new Set()); return; }
    let cancelled = false;
    const poll = () => {
      api.getFloorOpenRequests(floorId).then((list) => {
        if (!cancelled) setOpenRequestDeviceIds(new Set(list.map((r) => r.deviceId)));
      }).catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [floorId]);

  const getSvgPoint = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * VB_W, y: ((clientY - rect.top) / rect.height) * VB_H };
  };
  const getContentPercent = (clientX, clientY) => {
    const s = getSvgPoint(clientX, clientY);
    const cx = (s.x - pan.x) / zoom;
    const cy = (s.y - pan.y) / zoom;
    return { x: Math.min(100, Math.max(0, (cx / VB_W) * 100)), y: Math.min(100, Math.max(0, (cy / VB_H) * 100)) };
  };
  const zoomAt = (anchor, factor) => {
    setZoom((prevZoom) => {
      const newZoom = Math.min(4, Math.max(0.5, prevZoom * factor));
      setPan((prevPan) => {
        const cx = (anchor.x - prevPan.x) / prevZoom;
        const cy = (anchor.y - prevPan.y) / prevZoom;
        return { x: anchor.x - cx * newZoom, y: anchor.y - cy * newZoom };
      });
      return newZoom;
    });
  };
  const onWheel = (e) => {
    try { e.preventDefault(); } catch (err) {}
    zoomAt(getSvgPoint(e.clientX, e.clientY), e.deltaY < 0 ? 1.15 : 0.87);
  };

  const suggestDevice = (type) => {
    const typeCount = devices.filter((d) => d.type === type).length;
    const n = typeCount + 1;
    return { id: `${TYPE_PREFIX[type]}-${(floorId || "").toUpperCase()}-${String(n).padStart(2, "0")}`, name: `${TYPES[type].label} ${n}` };
  };

  const onPointerDown = (e) => {
    if (mode === "placing") {
      const pos = getContentPercent(e.clientX, e.clientY);
      setPendingPos(pos);
      setFormOpen(true);
      setForm({ ...emptyForm, ...suggestDevice("kiosk") });
      setFormError("");
      setMode("view");
      setSelectedId(null);
      return;
    }
    if (mode === "moving" && selectedDevice) {
      const pos = getContentPercent(e.clientX, e.clientY);
      setBusy(true);
      api
        .updateDevice(selectedDevice.id, { x: pos.x, y: pos.y })
        .then((updated) => setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d))))
        .catch((err) => setFormError(err.message))
        .finally(() => setBusy(false));
      setMode("view");
      return;
    }
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    if (!dragging || mode !== "view") return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStart.current.x) * (VB_W / rect.width);
    const dy = (e.clientY - dragStart.current.y) * (VB_H / rect.height);
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };
  const endDrag = () => setDragging(false);

  const toggleFilter = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  const statusCounts = { normal: 0, faulty: 0, repair: 0, removed: 0 };
  devices.forEach((d) => { statusCounts[d.status]++; });

  const startPlacing = () => { setSelectedId(null); setEditMode(false); setFormOpen(false); setRequestFormOpen(false); setMode("placing"); };
  const startMoving = () => { setEditMode(false); setRequestFormOpen(false); setMode("moving"); };
  const deleteDeviceHandler = () => {
    if (!selectedDevice) return;
    setConfirmDialog({
      title: "장비 삭제",
      message: `"${selectedDevice.name}" 장비를 삭제하시겠습니까?\n점검요청 내역을 포함해 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      onConfirm: async () => {
        await api.deleteDevice(selectedDevice.id);
        setDevices((prev) => prev.filter((d) => d.id !== selectedDevice.id));
        closeMobilePanel();
      },
    });
  };
  const startEdit = () => {
    if (!selectedDevice) return;
    setForm({ name: selectedDevice.name, type: selectedDevice.type, id: selectedDevice.id, status: selectedDevice.status, ip: selectedDevice.ip || "", vncPassword: selectedDevice.vncPassword || "", memo: selectedDevice.memo || "" });
    setFormError("");
    setRequestFormOpen(false);
    setEditMode(true);
  };

  const startRequest = () => {
    if (!selectedDevice) return;
    setFormOpen(false);
    setEditMode(false);
    setRequestSymptom("");
    setRequestError("");
    setRequestFormOpen(true);
  };
  const submitRequest = () => {
    if (!selectedDevice) return;
    if (!requestSymptom.trim()) { setRequestError("증상 내용을 입력해 주세요."); return; }
    setRequestBusy(true);
    api
      .createDeviceRequest(selectedDevice.id, requestSymptom.trim())
      .then((created) => {
        setDeviceRequests((prev) => [created, ...prev]);
        setOpenRequestDeviceIds((prev) => new Set(prev).add(selectedDevice.id));
        setRequestFormOpen(false);
        setRequestSymptom("");
      })
      .catch((err) => setRequestError(err.message))
      .finally(() => setRequestBusy(false));
  };

  const submitRegistration = () => {
    if (!pendingPos) { setFormError("위치 정보가 없습니다. 도면을 다시 클릭해 주세요."); return; }
    if (!form.name.trim() || !form.id.trim()) { setFormError("장비명과 식별 정보를 모두 입력해 주세요."); return; }
    if (form.ip.trim() && !isValidIp(form.ip)) { setFormError("IP 주소 형식이 올바르지 않습니다. (예: 192.168.1.10)"); return; }
    setBusy(true);
    api
      .createDevice(floorId, { ...form, id: form.id.trim(), name: form.name.trim(), x: pendingPos.x, y: pendingPos.y })
      .then((newDevice) => {
        setDevices((prev) => [...prev, newDevice]);
        setFormOpen(false);
        setPendingPos(null);
        setSelectedId(newDevice.id);
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setBusy(false));
  };

  const submitEdit = () => {
    if (!selectedDevice) return;
    if (!form.name.trim() || !form.id.trim()) { setFormError("장비명과 식별 정보를 모두 입력해 주세요."); return; }
    if (form.ip.trim() && !isValidIp(form.ip)) { setFormError("IP 주소 형식이 올바르지 않습니다. (예: 192.168.1.10)"); return; }
    setBusy(true);
    api
      .updateDevice(selectedDevice.id, { ...form, id: form.id.trim(), name: form.name.trim() })
      .then((updated) => {
        setDevices((prev) => prev.map((d) => (d.id === selectedDevice.id ? updated : d)));
        setEditMode(false);
        setSelectedId(updated.id);
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setBusy(false));
  };

  const setStatusQuick = (k) => {
    if (!selectedDevice) return;
    setBusy(true);
    api
      .updateDevice(selectedDevice.id, { status: k })
      .then((updated) => setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d))))
      .catch((err) => setFormError(err.message))
      .finally(() => setBusy(false));
  };

  const openAddLocation = () => { setLocForm({ name: "", floorName: "1층" }); setLocFormError(""); setShowAddLoc(true); };
  const submitAddLocation = () => {
    if (!locForm.name.trim() || !locForm.floorName.trim()) { setLocFormError("영업장명과 층 이름을 입력해 주세요."); return; }
    api
      .createLocation(locForm.name.trim(), locForm.floorName.trim())
      .then((newLoc) => {
        setLocations((prev) => [...prev, newLoc]);
        setLocId(newLoc.id);
        setFloorId(newLoc.floors[0].id);
        setShowAddLoc(false);
      })
      .catch((err) => setLocFormError(err.message));
  };

  const openEditLocation = (loc) => {
    setEditLocId(loc.id);
    setEditLocName(loc.name);
    setEditLocError("");
  };
  const submitEditLocation = async () => {
    if (!editLocName.trim()) { setEditLocError("영업장명을 입력해 주세요."); return; }
    try {
      await api.renameLocation(editLocId, editLocName.trim());
      setLocations((prev) => prev.map((l) => (l.id === editLocId ? { ...l, name: editLocName.trim() } : l)));
      setEditLocId(null);
    } catch (err) {
      setEditLocError(err.message);
    }
  };
  const deleteLocationHandler = (loc) => {
    setConfirmDialog({
      title: "영업장 삭제",
      message: `"${loc.name}" 영업장을 삭제하시겠습니까?\n모든 층과 장비, 도면 이미지가 함께 삭제되며 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      onConfirm: async () => {
        await api.deleteLocation(loc.id);
        const next = locations.filter((l) => l.id !== loc.id);
        setLocations(next);
        if (loc.id === locId) {
          const fallback = next[0] || null;
          setLocId(fallback ? fallback.id : null);
          setFloorId(fallback ? fallback.floors[0]?.id || null : null);
          if (!fallback) {
            setFloorImageUrl(null);
            setDevices([]);
          }
        }
      },
    });
  };
  const addFloorToLocation = (loc) => {
    setAddFloorLocId(loc.id);
    setAddFloorName("");
    setAddFloorError("");
  };
  const cancelAddFloor = () => {
    setAddFloorLocId(null);
    setAddFloorName("");
    setAddFloorError("");
  };
  const submitAddFloor = async (loc) => {
    if (!addFloorName.trim()) { setAddFloorError("층 이름을 입력해 주세요."); return; }
    try {
      const newFloor = await api.addFloor(loc.id, addFloorName.trim());
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, floors: [...l.floors, newFloor] } : l)));
      cancelAddFloor();
    } catch (err) {
      setAddFloorError(err.message);
    }
  };
  const startRenameFloor = (fl) => {
    setRenameFloorId(fl.id);
    setRenameFloorInput(fl.name);
    setRenameFloorErr("");
  };
  const cancelRenameFloor = () => {
    setRenameFloorId(null);
    setRenameFloorInput("");
    setRenameFloorErr("");
  };
  const submitRenameFloor = async (loc, fl) => {
    if (!renameFloorInput.trim()) { setRenameFloorErr("층 이름을 입력해 주세요."); return; }
    if (renameFloorInput.trim() === fl.name) { cancelRenameFloor(); return; }
    try {
      await api.renameFloor(fl.id, renameFloorInput.trim());
      setLocations((prev) =>
        prev.map((l) =>
          l.id !== loc.id ? l : { ...l, floors: l.floors.map((f) => (f.id === fl.id ? { ...f, name: renameFloorInput.trim() } : f)) }
        )
      );
      cancelRenameFloor();
    } catch (err) {
      setRenameFloorErr(err.message);
    }
  };
  const deleteFloorHandler = (loc, fl) => {
    if (loc.floors.length <= 1) { alert("영업장에는 최소 1개의 층이 있어야 합니다."); return; }
    setConfirmDialog({
      title: "층 삭제",
      message: `"${fl.name}" 층을 삭제하시겠습니까?\n해당 층의 장비와 도면 이미지가 함께 삭제되며 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      onConfirm: async () => {
        await api.deleteFloor(fl.id);
        const nextFloors = loc.floors.filter((f) => f.id !== fl.id);
        setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, floors: nextFloors } : l)));
        if (fl.id === floorId) {
          const fallback = nextFloors[0] || null;
          setFloorId(fallback ? fallback.id : null);
        }
      },
    });
  };
  const runConfirm = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setConfirmBusy(false);
    }
  };
  const uploadImageForCurrentFloor = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !floorId) return;
    try {
      const { imageUrl } = await api.uploadFloorImage(floorId, file);
      setFloorImageUrl(imageUrl);
      setLocations((prev) =>
        prev.map((l) =>
          l.id !== locId ? l : { ...l, floors: l.floors.map((f) => (f.id === floorId ? { ...f, hasImage: true } : f)) }
        )
      );
    } catch (err) {
      alert(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const inputCls = "w-full text-sm px-2 py-1.5 rounded border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400";
  const labelCls = "text-xs text-stone-500 mb-1 block";

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-rose-600 text-sm">
        <div>{loadError}</div>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 text-xs"
        >
          다시 로그인
        </button>
      </div>
    );
  }
  if (locations.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-100 text-stone-500 text-sm">
        <div className="flex items-center gap-2 text-stone-700">
          <Building2 size={18} className="text-orange-600" />
          <span>등록된 영업장이 없습니다.</span>
        </div>
        {canManageLocations ? (
          <button onClick={openAddLocation} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded bg-orange-500 text-white hover:bg-orange-600">
            <Plus size={15} /> 새 영업장 추가
          </button>
        ) : (
          <div className="text-xs text-stone-400">본사 관리자에게 영업장 등록을 요청해 주세요.</div>
        )}
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-orange-600">
          <LogOut size={13} /> 로그아웃
        </button>
        {showAddLoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40">
            <div className="w-80 bg-white rounded-lg border border-stone-300 p-4 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-stone-900">새 영업장 추가</span>
                <button onClick={() => setShowAddLoc(false)} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>영업장명</label>
                  <input className={inputCls} value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="예: 인천점" />
                </div>
                <div>
                  <label className={labelCls}>층 이름</label>
                  <input className={inputCls} value={locForm.floorName} onChange={(e) => setLocForm({ ...locForm, floorName: e.target.value })} placeholder="예: 1층" />
                </div>
                {locFormError && <div className="text-xs text-rose-600">{locFormError}</div>}
                <div className="flex gap-2 pt-1">
                  <button onClick={submitAddLocation} className="flex-1 text-sm px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600">추가</button>
                  <button onClick={() => setShowAddLoc(false)} className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">취소</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (!location || !floor) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="app-shell relative flex flex-col w-full bg-stone-100 text-stone-800">
      {/* Unified top header, full width */}
      <div className="h-14 border-b border-stone-200 bg-stone-50 flex items-center flex-shrink-0">
        <div className="w-auto md:w-56 flex-shrink-0 h-full pl-2 pr-3 md:px-4 flex items-center gap-2 border-r border-stone-200">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-1.5 -ml-1 text-stone-500 hover:text-orange-600"
            aria-label="메뉴 열기"
          >
            <Menu size={20} />
          </button>
          <Building2 size={16} className="hidden md:block text-orange-600" />
          <span className="text-sm font-medium text-stone-800 hidden md:inline">키오스크·DID 관리</span>
        </div>
        <div className="flex-1 h-full px-3 md:px-4 flex items-center justify-between min-w-0">
        <div className="text-sm font-mono text-stone-700 truncate">
          {location.name} <span className="text-orange-400">/</span> {floor.name}
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono">
            {Object.entries(statusCounts).map(([k, v]) => (
              <span key={k} className={`px-2 py-0.5 rounded border ${STATUS[k].badge}`}>{STATUS[k].label} {v}</span>
            ))}
          </div>
          {canManageLocations && (
            <label className="ml-0 md:ml-2 flex items-center gap-1 text-xs px-2.5 md:px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100 cursor-pointer">
              <Upload size={13} /> <span className="hidden sm:inline">{floorImageUrl ? "도면 교체" : "도면 업로드"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={uploadImageForCurrentFloor} />
            </label>
          )}
          {canRegisterDevice && (
            mode === "placing" ? (
              <button onClick={cancelModes} className="flex items-center gap-1 text-xs px-2.5 md:px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">
                <X size={14} /> <span className="hidden sm:inline">등록 취소</span>
              </button>
            ) : (
              <button onClick={startPlacing} className="flex items-center gap-1 text-xs px-2.5 md:px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600">
                <Plus size={14} /> <span className="hidden sm:inline">신규 장비 등록</span>
              </button>
            )
          )}
          {canManageMaintenanceRequests && (
            <div className="ml-2 md:ml-5">
              <NotificationBell
                onSelectDevice={(deviceId, deviceLocId, deviceFloorId) => {
                  setEditMode(false);
                  setFormOpen(false);
                  setRequestFormOpen(false);
                  setDeviceListCollapsed(false);
                  if (deviceFloorId && deviceFloorId !== floorId) {
                    pendingSelectRef.current = deviceId;
                    if (deviceLocId) setLocId(deviceLocId);
                    setFloorId(deviceFloorId);
                  } else {
                    setSelectedId(deviceId);
                  }
                }}
              />
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0">
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-stone-900/40"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <div
        className={`fixed top-14 bottom-0 left-0 z-40 w-72 max-w-[85vw] transform transition-transform duration-200 ease-out
          md:static md:top-auto md:bottom-auto md:z-auto md:w-56 md:max-w-none md:translate-x-0 md:transition-none
          ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          flex-shrink-0 bg-stone-50 border-r border-stone-200 overflow-y-auto flex flex-col`}
      >
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <span className="text-sm font-medium text-stone-800">영업장 / 층</span>
          <button onClick={() => setMobileSidebarOpen(false)} className="text-stone-400 hover:text-orange-600" aria-label="메뉴 닫기">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1">
          {locations.map((loc) => (
            <div key={loc.id} className="py-2">
              <div className="px-4 py-1 text-xs font-medium text-stone-500 uppercase tracking-wide flex items-center justify-between">
                <span>{loc.name}</span>
                {canManageLocations && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => addFloorToLocation(loc)} className="text-stone-400 hover:text-orange-600" aria-label="층 추가">
                      <Plus size={12} />
                    </button>
                    <button onClick={() => openEditLocation(loc)} className="text-stone-400 hover:text-orange-600" aria-label="영업장 수정">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => deleteLocationHandler(loc)} className="text-stone-400 hover:text-rose-600" aria-label="영업장 삭제">
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
              {loc.floors.map((fl) => {
                const active = loc.id === locId && fl.id === floorId;
                if (renameFloorId === fl.id) {
                  return (
                    <div key={fl.id} className="pl-5 pr-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={renameFloorInput}
                          onChange={(e) => setRenameFloorInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRenameFloor(loc, fl);
                            if (e.key === "Escape") cancelRenameFloor();
                          }}
                          className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-stone-300 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400"
                        />
                        <button onClick={() => submitRenameFloor(loc, fl)} className="text-orange-600 hover:text-orange-700 flex-shrink-0" aria-label="저장">
                          <Check size={16} />
                        </button>
                        <button onClick={cancelRenameFloor} className="text-stone-400 hover:text-stone-600 flex-shrink-0" aria-label="취소">
                          <X size={16} />
                        </button>
                      </div>
                      {renameFloorErr && <div className="text-xs text-rose-600 mt-1">{renameFloorErr}</div>}
                    </div>
                  );
                }
                return (
                  <div
                    key={fl.id}
                    className={`w-full pl-5 pr-3 py-2 text-sm flex items-center justify-between ${active ? "bg-orange-100 text-orange-800 font-medium" : "text-stone-600 hover:bg-stone-200 hover:text-stone-900"}`}
                  >
                    <button onClick={() => selectFloor(loc, fl)} className="flex-1 min-w-0 text-left truncate">
                      {fl.name}
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0 pl-1">
                      {!fl.hasImage && <ImageIcon size={11} className="text-stone-300" />}
                      {canManageLocations && (
                        <button onClick={() => startRenameFloor(fl)} className="text-stone-300 hover:text-orange-600" aria-label="층 수정">
                          <Pencil size={11} />
                        </button>
                      )}
                      {canManageLocations && loc.floors.length > 1 && (
                        <button onClick={() => deleteFloorHandler(loc, fl)} className="text-stone-300 hover:text-rose-600" aria-label="층 삭제">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {addFloorLocId === loc.id && (
                <div className="pl-5 pr-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={addFloorName}
                      onChange={(e) => setAddFloorName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitAddFloor(loc);
                        if (e.key === "Escape") cancelAddFloor();
                      }}
                      placeholder="층 이름"
                      className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-stone-300 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400"
                    />
                    <button onClick={() => submitAddFloor(loc)} className="text-orange-600 hover:text-orange-700 flex-shrink-0" aria-label="추가">
                      <Check size={16} />
                    </button>
                    <button onClick={cancelAddFloor} className="text-stone-400 hover:text-stone-600 flex-shrink-0" aria-label="취소">
                      <X size={16} />
                    </button>
                  </div>
                  {addFloorError && <div className="text-xs text-rose-600 mt-1">{addFloorError}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        {canManageLocations && (
          <button onClick={openAddLocation} className="flex items-center gap-1.5 px-4 py-3 text-sm text-orange-700 border-t border-stone-200 hover:bg-orange-50">
            <Plus size={15} /> 새 영업장 추가
          </button>
        )}
        <div className="px-4 py-3 border-t border-stone-200 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            {user.displayName}
            <div className="text-[10px] text-stone-400">
              {{ main_admin: "메인관리자", ops_admin: "운영 관리자", maintenance: "현장관리자" }[user.role]}
            </div>
          </div>
          <button onClick={onLogout} className="text-stone-400 hover:text-orange-600" aria-label="로그아웃">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Add location modal */}
      {showAddLoc && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-900/40">
          <div className="w-80 bg-white rounded-lg border border-stone-300 p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-stone-900">새 영업장 추가</span>
              <button onClick={() => setShowAddLoc(false)} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>영업장명</label>
                <input className={inputCls} value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="예: 인천점" />
              </div>
              <div>
                <label className={labelCls}>층 이름</label>
                <input className={inputCls} value={locForm.floorName} onChange={(e) => setLocForm({ ...locForm, floorName: e.target.value })} placeholder="예: 1층" />
              </div>
              {locFormError && <div className="text-xs text-rose-600">{locFormError}</div>}
              <div className="flex gap-2 pt-1">
                <button onClick={submitAddLocation} className="flex-1 text-sm px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600">추가</button>
                <button onClick={() => setShowAddLoc(false)} className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit location modal */}
      {editLocId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-900/40">
          <div className="w-80 bg-white rounded-lg border border-stone-300 p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-stone-900">영업장 수정</span>
              <button onClick={() => setEditLocId(null)} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>영업장명</label>
                <input className={inputCls} value={editLocName} onChange={(e) => setEditLocName(e.target.value)} />
              </div>
              {editLocError && <div className="text-xs text-rose-600">{editLocError}</div>}
              <div className="flex gap-2 pt-1">
                <button onClick={submitEditLocation} className="flex-1 text-sm px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600">저장</button>
                <button onClick={() => setEditLocId(null)} className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-900/40">
          <div className="w-80 bg-white rounded-lg border border-stone-300 p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-stone-900">{confirmDialog.title}</span>
              <button onClick={() => setConfirmDialog(null)} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
            </div>
            <div className="text-sm text-stone-600 whitespace-pre-wrap leading-relaxed mb-4">{confirmDialog.message}</div>
            <div className="flex gap-2">
              <button
                onClick={runConfirm}
                disabled={confirmBusy}
                className="flex-1 text-sm px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {confirmBusy ? "처리 중..." : (confirmDialog.confirmLabel || "확인")}
              </button>
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={confirmBusy}
                className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative flex-1 bg-amber-50">
          {(mode === "placing" || mode === "moving") && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-orange-500 text-white text-xs px-3 py-1.5 rounded-full shadow-sm">
              <Crosshair size={14} />
              {mode === "placing" ? "도면을 클릭하여 장비 위치를 지정하세요" : "도면을 클릭하여 새 위치를 지정하세요"}
              <button onClick={cancelModes} className="ml-1 hover:opacity-80"><X size={13} /></button>
            </div>
          )}
          {!floorImageUrl ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 text-sm z-10 pointer-events-none gap-2">
              <ImageIcon size={22} />
              이 층에는 등록된 도면이 없습니다.
            </div>
          ) : (
            devices.length === 0 && mode === "view" && (
              <div className="absolute inset-0 flex items-center justify-center text-stone-500 text-sm z-10 pointer-events-none">
                이 층에는 등록된 장비가 없습니다.
              </div>
            )
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full h-full"
            style={{ cursor: mode !== "view" ? "crosshair" : dragging ? "grabbing" : "grab", touchAction: "none" }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            <defs>
              <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e7dfd0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#grid)" />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {floorImageUrl && <image href={floorImageUrl} x="0" y="0" width={VB_W} height={VB_H} preserveAspectRatio="none" />}
              {visibleDevices.map((d) => (
                <DeviceMarker
                  key={d.id}
                  device={d}
                  isSelected={d.id === selectedId}
                  zoom={zoom}
                  onSelect={(id) => { if (mode === "view") { setSelectedId(id); setEditMode(false); setFormOpen(false); setRequestFormOpen(false); setDeviceListCollapsed(false); } }}
                  dimmed={mode === "moving" && d.id === selectedId}
                  hasOpenRequest={openRequestDeviceIds.has(d.id)}
                  sizeMult={isMobile ? 3 : 1}
                />
              ))}
              {pendingPos && formOpen && (
                <g transform={`translate(${(pendingPos.x / 100) * VB_W} ${(pendingPos.y / 100) * VB_H}) scale(${1 / zoom})`}>
                  <circle r="15" fill="#f97316" opacity="0.3" className="animate-ping" />
                  <circle r="9" fill="#f97316" stroke="#292524" strokeWidth="2" />
                </g>
              )}
            </g>
          </svg>

          <div className="absolute bottom-4 right-4 z-30 flex flex-col bg-white border border-stone-300 rounded-md overflow-hidden shadow-sm">
            <button onClick={() => zoomAt({ x: VB_W / 2, y: VB_H / 2 }, 1.25)} className="p-2 hover:bg-orange-50 hover:text-orange-600 text-stone-600"><ZoomIn size={16} /></button>
            <button onClick={() => zoomAt({ x: VB_W / 2, y: VB_H / 2 }, 0.8)} className="p-2 hover:bg-orange-50 hover:text-orange-600 text-stone-600 border-t border-stone-200"><ZoomOut size={16} /></button>
            <button onClick={resetView} className="p-2 hover:bg-orange-50 hover:text-orange-600 text-stone-600 border-t border-stone-200"><Maximize2 size={16} /></button>
          </div>

          {showLegend ? (
            <div className="absolute bottom-4 left-4 z-30 bg-white/95 border border-stone-300 rounded-md p-3 text-xs shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-stone-500 font-medium">상태 (클릭하여 필터)</span>
                <button onClick={() => setShowLegend(false)} className="text-stone-400 hover:text-orange-600" aria-label="범례 숨기기"><EyeOff size={13} /></button>
              </div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(STATUS).map(([k, v]) => (
                  <button key={k} onClick={() => toggleFilter(k)} className={`flex items-center gap-2 ${filters[k] ? "opacity-100" : "opacity-35"}`}>
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: v.hex }} />
                    <span className="text-stone-700">{v.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-stone-500 mt-3 mb-1 font-medium">장비 유형</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(TYPES).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-stone-700">
                    <v.Icon size={12} />
                    <span>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => setShowLegend(true)} className="absolute bottom-4 left-4 z-30 flex items-center gap-1.5 bg-white border border-stone-300 rounded-md px-3 py-2 text-xs text-stone-600 shadow-sm hover:bg-stone-50">
              <Eye size={13} /> 범례 보기
            </button>
          )}
        </div>
      </div>

      {/* Right panel collapse handle (desktop only) */}
      <button
        onClick={() => setDeviceListCollapsed((v) => !v)}
        className="hidden md:flex flex-shrink-0 w-4 items-center justify-center bg-stone-50 hover:bg-orange-100 border-l border-stone-200 text-stone-400 hover:text-orange-600"
        aria-label={deviceListCollapsed ? "장비 목록 보기" : "장비 목록 최소화"}
        title={deviceListCollapsed ? "장비 목록 보기" : "장비 목록 최소화"}
      >
        {deviceListCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Mobile floating button to open device list (top-right) */}
      {!mobilePanelVisible && (
        <button
          onClick={() => setMobileListOpen(true)}
          className="md:hidden fixed top-[69px] right-4 z-30 flex items-center justify-center bg-orange-500 text-white w-12 h-12 rounded-full shadow-lg hover:bg-orange-600"
          aria-label="장비 목록"
        >
          <List size={20} />
          {devices.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-white text-orange-600 text-sm font-bold leading-none rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1 border-2 border-orange-500">
              {devices.length}
            </span>
          )}
        </button>
      )}

      {/* Right panel */}
      {!deviceListCollapsed && (
      <div
        className={`${mobilePanelVisible ? "flex" : "hidden"} md:flex
          fixed inset-x-0 top-14 bottom-0 z-40 flex-col
          md:static md:inset-auto md:z-auto
          ${deviceListCollapsed ? "md:hidden" : ""}
          w-full md:w-72 flex-shrink-0 bg-white border-l border-stone-200 overflow-y-auto`}
      >
        <div className="p-4">
        {formOpen ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-stone-900">신규 장비 등록</span>
              <button onClick={cancelModes} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>장비명</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>장비 유형</label>
                <select
                  className={inputCls}
                  value={form.type}
                  onChange={(e) => {
                    const t = e.target.value;
                    const suggestion = suggestDevice(t);
                    setForm((f) => ({
                      ...f,
                      type: t,
                      id: f.id === suggestDevice(f.type).id ? suggestion.id : f.id,
                      name: f.name === suggestDevice(f.type).name ? suggestion.name : f.name,
                    }));
                  }}
                >
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>식별 정보 (ID)</label>
                <input className={inputCls} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>IP 주소 (선택)</label>
                <input className={`${inputCls} font-mono`} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="예: 192.168.1.10" />
              </div>
              <div>
                <label className={labelCls}>VNC 비밀번호 (선택)</label>
                <input className={`${inputCls} font-mono`} type="text" value={form.vncPassword} onChange={(e) => setForm({ ...form, vncPassword: e.target.value })} placeholder="원격 접속 시 자동 입력됩니다" />
              </div>
              <div>
                <label className={labelCls}>상태</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>메모 (선택)</label>
                <textarea className={`${inputCls} resize-none`} rows={3} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </div>
              {pendingPos && (
                <div className="text-xs text-stone-400 flex items-center gap-1">
                  <MapPin size={12} /> 위치: {Math.round(pendingPos.x)}%, {Math.round(pendingPos.y)}%
                </div>
              )}
              {formError && <div className="text-xs text-rose-600">{formError}</div>}
              <div className="flex gap-2 pt-2">
                <button disabled={busy} onClick={submitRegistration} className="flex-1 text-sm px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">등록</button>
                <button onClick={cancelModes} className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">취소</button>
              </div>
            </div>
          </>
        ) : editMode ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-stone-900">장비 정보 수정</span>
              <button onClick={() => setEditMode(false)} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>장비명</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>장비 유형</label>
                <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>식별 정보 (ID)</label>
                <input className={inputCls} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>IP 주소 (선택)</label>
                <input className={`${inputCls} font-mono`} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>상태</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>메모 (선택)</label>
                <textarea className={`${inputCls} resize-none`} rows={3} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </div>
              {formError && <div className="text-xs text-rose-600">{formError}</div>}
              <div className="flex gap-2 pt-2">
                <button disabled={busy} onClick={submitEdit} className="flex-1 text-sm px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">저장</button>
                <button onClick={() => setEditMode(false)} className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">취소</button>
              </div>
            </div>
          </>
        ) : requestFormOpen && selectedDevice ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-stone-900">점검요청</span>
              <button onClick={() => setRequestFormOpen(false)} className="text-stone-400 hover:text-orange-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div className="text-xs text-stone-500">{selectedDevice.name} <span className="font-mono text-stone-400">({selectedDevice.id})</span></div>
              <div>
                <label className={labelCls}>증상 내용</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={6}
                  value={requestSymptom}
                  onChange={(e) => setRequestSymptom(e.target.value)}
                  placeholder="예: 화면이 꺼져 있습니다 / 터치가 안 됩니다 / 카드리더기 오류"
                  autoFocus
                />
              </div>
              {requestError && <div className="text-xs text-rose-600">{requestError}</div>}
              <div className="flex gap-2 pt-1">
                <button disabled={requestBusy} onClick={submitRequest} className="flex-1 text-sm px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">점검요청 제출</button>
                <button onClick={() => setRequestFormOpen(false)} className="flex-1 text-sm px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">취소</button>
              </div>
            </div>
          </>
        ) : selectedDevice ? (
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                {React.createElement(TYPES[selectedDevice.type].Icon, { size: 18, className: "text-orange-600" })}
                <span className="text-xs text-stone-500">{TYPES[selectedDevice.type].label}</span>
              </div>
              <button onClick={() => { setSelectedId(null); setRequestFormOpen(false); }} className="text-stone-400 hover:text-orange-600" aria-label="닫기"><X size={22} /></button>
            </div>
            <div className="text-base font-medium text-stone-900 mb-1">{selectedDevice.name}</div>
            <div className="text-xs font-mono text-stone-400 mb-4">{selectedDevice.id}</div>
            <div className={`inline-block px-2 py-1 rounded border text-xs mb-4 ${STATUS[selectedDevice.status].badge}`}>
              {STATUS[selectedDevice.status].label}
            </div>

            <div className="flex border-b border-stone-200 -mx-4 px-4 mb-4">
              <button
                onClick={() => setDetailTab("info")}
                className={`flex-1 text-xs font-medium py-2 border-b-2 -mb-px ${detailTab === "info" ? "border-orange-500 text-orange-600" : "border-transparent text-stone-400 hover:text-stone-600"}`}
              >
                장비정보
              </button>
              <button
                onClick={() => setDetailTab("requests")}
                className={`flex-1 text-xs font-medium py-2 border-b-2 -mb-px ${detailTab === "requests" ? "border-orange-500 text-orange-600" : "border-transparent text-stone-400 hover:text-stone-600"}`}
              >
                <span className="inline-flex items-center gap-1">
                  점검요청 내역{deviceRequests.length > 0 ? ` (${deviceRequests.length})` : ""}
                  {openRequestDeviceIds.has(selectedDevice.id) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" aria-label="신규 점검요청 있음" />
                  )}
                </span>
              </button>
            </div>

            {detailTab === "info" ? (
              <>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-stone-500">영업장</span><span className="text-stone-700">{location.name}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">층</span><span className="text-stone-700">{floor.name}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-stone-500">IP 주소</span>
                    {selectedDevice.ip ? (
                      <button
                        onClick={() => setVncDevice(selectedDevice)}
                        className="text-stone-700 font-mono hover:text-orange-600 hover:underline flex items-center gap-1"
                        title="클릭하면 웹 VNC로 원격 접속합니다"
                      >
                        {selectedDevice.ip}
                        <MonitorPlay size={12} className="text-stone-400" />
                      </button>
                    ) : (
                      <span className="text-stone-700 font-mono">-</span>
                    )}
                  </div>
                  <div className="flex justify-between"><span className="text-stone-500">변경자</span><span className="text-stone-700 font-mono">{selectedDevice.updatedBy}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">변경 일시</span><span className="text-stone-700 font-mono">{selectedDevice.updatedAt}</span></div>
                </div>
                {selectedDevice.memo && (
                  <div className="border-t border-stone-200 mt-3 pt-3">
                    <div className="text-xs text-stone-500 mb-1">메모</div>
                    <div className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{selectedDevice.memo}</div>
                  </div>
                )}
                {(canEditDeviceInfo || canMoveDevice) && (
                  <div className="flex gap-2 mt-4">
                    {canEditDeviceInfo && (
                      <button onClick={startEdit} className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">
                        <Pencil size={12} /> 정보 수정
                      </button>
                    )}
                    {canMoveDevice && (
                      <button onClick={startMoving} className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">
                        <MapPin size={12} /> 위치 변경
                      </button>
                    )}
                  </div>
                )}
                {canDeleteDevice && (
                  <div className="flex gap-2 mt-2">
                    <button
                      disabled={busy}
                      onClick={deleteDeviceHandler}
                      className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> 장비 삭제
                    </button>
                  </div>
                )}
                {canRequestMaintenance && (
                  <div className="flex gap-2 mt-4">
                    <button onClick={startRequest} className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-50">
                      <Wrench size={12} /> 점검요청
                    </button>
                  </div>
                )}
                {!canRequestMaintenance && (
                  <div className="border-t border-stone-200 mt-4 pt-3">
                    <div className="text-xs text-stone-500 mb-2">상태 변경</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(STATUS).map(([k, v]) => (
                        <button
                          key={k}
                          disabled={selectedDevice.status === k || busy}
                          onClick={() => setStatusQuick(k)}
                          className={`px-2 py-1.5 rounded border text-xs ${selectedDevice.status === k ? "opacity-40 cursor-default" : "hover:bg-orange-50"} ${v.badge}`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                    {formError && <div className="text-xs text-rose-600 mt-2">{formError}</div>}
                  </div>
                )}
              </>
            ) : (
              <div>
                {deviceRequests.length === 0 ? (
                  <div className="text-xs text-stone-400">등록된 점검요청이 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {(showAllRequests ? deviceRequests : deviceRequests.slice(0, 4)).map((r) => (
                      <div key={r.id} className="text-xs border border-stone-200 rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${r.status === "open" ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-stone-100 text-stone-500 border-stone-300"}`}>
                            {r.status === "open" ? "대기중" : "처리완료"}
                          </span>
                          <span className="text-stone-400 font-mono">{r.requestedAt}</span>
                        </div>
                        <div className="text-stone-700 whitespace-pre-wrap leading-relaxed">{r.symptom}</div>
                        <div className="text-stone-400 mt-1">{r.requestedBy}</div>
                      </div>
                    ))}
                    {deviceRequests.length > 4 && (
                      <button
                        onClick={() => setShowAllRequests((v) => !v)}
                        className="w-full text-center text-xs text-stone-500 hover:text-orange-600 py-1"
                      >
                        {showAllRequests ? "접기" : `이전 내역 (${deviceRequests.length - 4}건 더보기)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-stone-900">{floor.name} 장비 목록</span>
                <span className="text-xs font-mono text-stone-400">{devices.length}대</span>
              </div>
              <button
                onClick={closeMobilePanel}
                className="md:hidden text-stone-500 hover:text-orange-600"
                aria-label="닫기"
              >
                <X size={22} />
              </button>
            </div>
            {devices.length === 0 ? (
              <div className="text-xs text-stone-400 py-6 text-center">이 층에는 등록된 장비가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {devices.map((d) => {
                  const Icon = TYPES[d.type].Icon;
                  return (
                    <button
                      key={d.id}
                      onClick={() => { setSelectedId(d.id); setEditMode(false); setFormOpen(false); setRequestFormOpen(false); setDeviceListCollapsed(false); }}
                      className="w-full flex items-center gap-2 px-2 rounded hover:bg-stone-100 text-left"
                      style={{ paddingTop: "6px", paddingBottom: "6px" }}
                    >
                      <Icon size={14} className="text-stone-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-stone-800 truncate">{d.name}</div>
                        <div className="text-[11px] font-mono text-stone-400 truncate">{d.id}</div>
                      </div>
                      {openRequestDeviceIds.has(d.id) ? (
                        <span className="flex-shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-300" title="점검요청 있음">
                          <AlertCircle size={11} /> 점검요청
                        </span>
                      ) : (
                        <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${STATUS[d.status].badge}`}>{STATUS[d.status].label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        </div>
      </div>
      )}
      </div>
      {vncDevice && <VncModal device={vncDevice} onClose={() => setVncDevice(null)} />}
    </div>
  );
}
