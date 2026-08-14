const TOKEN_KEY = "floorplan_token";
const USER_KEY = "floorplan_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* no body */
  }
  if (!res.ok) {
    const message = (data && data.error) || `요청에 실패했습니다 (${res.status})`;
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new Event("auth-expired"));
    }
    throw new Error(message);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  getLocations: () => request("/locations"),
  createLocation: (name, floorName) =>
    request("/locations", { method: "POST", body: JSON.stringify({ name, floorName }) }),
  renameLocation: (id, name) =>
    request(`/locations/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteLocation: (id) => request(`/locations/${id}`, { method: "DELETE" }),
  addFloor: (locationId, name) =>
    request(`/locations/${locationId}/floors`, { method: "POST", body: JSON.stringify({ name }) }),
  renameFloor: (floorId, name) =>
    request(`/locations/floors/${floorId}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteFloor: (floorId) => request(`/locations/floors/${floorId}`, { method: "DELETE" }),
  getFloor: (floorId) => request(`/locations/floors/${floorId}`),
  uploadFloorImage: (floorId, file) => {
    const form = new FormData();
    form.append("image", file);
    return request(`/locations/floors/${floorId}/image`, { method: "POST", body: form });
  },

  getDevices: (floorId) => request(`/floors/${floorId}/devices`),
  createDevice: (floorId, device) =>
    request(`/floors/${floorId}/devices`, { method: "POST", body: JSON.stringify(device) }),
  updateDevice: (deviceId, patch) =>
    request(`/devices/${deviceId}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteDevice: (deviceId) => request(`/devices/${deviceId}`, { method: "DELETE" }),

  getDeviceRequests: (deviceId) => request(`/devices/${deviceId}/requests`),
  createDeviceRequest: (deviceId, symptom) =>
    request(`/devices/${deviceId}/requests`, { method: "POST", body: JSON.stringify({ symptom }) }),

  getOpenRequests: () => request(`/requests?status=open`),
  getFloorOpenRequests: (floorId) => request(`/floors/${floorId}/requests?status=open`),
  resolveRequest: (id) => request(`/requests/${id}`, { method: "PUT", body: JSON.stringify({ status: "resolved" }) }),
};
