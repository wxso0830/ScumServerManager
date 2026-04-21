import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 15000 });

export const endpoints = {
  adminCheck: () => api.get("/system/admin-check").then(r => r.data),
  listDisks: () => api.get("/disks").then(r => r.data),
  getRequirements: () => api.get("/setup/requirements").then(r => r.data),
  getSetup: () => api.get("/setup").then(r => r.data),
  updateSetup: (payload) => api.put("/setup", payload).then(r => r.data),
  resetSetup: () => api.post("/setup/reset").then(r => r.data),
  getSchema: () => api.get("/settings/schema").then(r => r.data),
  listServers: () => api.get("/servers").then(r => r.data),
  createServer: (payload = {}) => api.post("/servers", payload).then(r => r.data),
  getServer: (id) => api.get(`/servers/${id}`).then(r => r.data),
  renameServer: (id, name) => api.put(`/servers/${id}`, { name }).then(r => r.data),
  updateSettings: (id, settings) => api.put(`/servers/${id}/settings`, { settings }).then(r => r.data),
  deleteServer: (id) => api.delete(`/servers/${id}`).then(r => r.data),
  startServer: (id) => api.post(`/servers/${id}/start`).then(r => r.data),
  stopServer: (id) => api.post(`/servers/${id}/stop`).then(r => r.data),
  exportFile: (id, fileKey) => api.get(`/servers/${id}/export/${fileKey}`).then(r => r.data),
  importFile: (id, fileKey, content) => api.post(`/servers/${id}/import/${fileKey}`, { content }).then(r => r.data),
  updateServer: (id) => api.post(`/servers/${id}/update`).then(r => r.data),
  installServer: (id) => api.post(`/servers/${id}/install`).then(r => r.data),
  saveConfig: (id) => api.post(`/servers/${id}/save-config`).then(r => r.data),
  getAppVersion: () => api.get("/app/version").then(r => r.data),
  applyManagerUpdate: () => api.post("/app/apply-update").then(r => r.data),
  updateAutomation: (id, payload) => api.put(`/servers/${id}/automation`, payload).then(r => r.data),
  generateNotifications: (id) => api.post(`/servers/${id}/automation/generate-notifications`).then(r => r.data),
  postInstall: (id) => api.post(`/servers/${id}/post-install`).then(r => r.data),
  firstBoot: (id, timeout_sec = 120) => api.post(`/servers/${id}/first-boot`, null, { params: { timeout_sec }, timeout: (timeout_sec + 30) * 1000 }).then(r => r.data),
  firstBootResult: (id) => api.get(`/servers/${id}/first-boot/result`).then(r => r.data),
  steamCheckUpdate: () => api.get("/steam/check-update").then(r => r.data),
  steamPublishBuild: (build_id, notes = "") => api.post("/steam/publish-build", { build_id, notes }).then(r => r.data),
  restartServer: (id) => api.post(`/servers/${id}/restart`).then(r => r.data),
  stopAllServers: () => api.post("/servers/bulk/stop-all").then(r => r.data),
  restartAllServers: () => api.post("/servers/bulk/restart-all").then(r => r.data),
  importBulk: (id, entries) => {
    // entries: [{ file_key, file: File }]
    const fd = new FormData();
    const keys = [];
    for (const e of entries) {
      fd.append("files", e.file);
      keys.push(e.file_key);
    }
    fd.append("file_keys", keys.join(","));
    return api.post(`/servers/${id}/import-bulk`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
  },
  listEvents: (id, params = {}) => api.get(`/servers/${id}/events`, { params }).then(r => r.data),
  eventStats: (id, days = 0) => api.get(`/servers/${id}/events/stats`, { params: { days } }).then(r => r.data),
  clearEvents: (id) => api.delete(`/servers/${id}/events`).then(r => r.data),
  scanLogs: (id, limit = 20) => api.post(`/servers/${id}/logs/scan`, null, { params: { limit } }).then(r => r.data),
  importLog: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/servers/${id}/logs/import`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
  },
  getDiscord: (id) => api.get(`/servers/${id}/discord`).then(r => r.data),
  setDiscord: (id, payload) => api.put(`/servers/${id}/discord`, payload).then(r => r.data),
  testDiscord: (id, event_type, webhook_url) => api.post(`/servers/${id}/discord/test`, { event_type, webhook_url }).then(r => r.data),
  updateServerPorts: (id, data) => api.put(`/servers/${id}/ports`, data).then(r => r.data),
  listPlayers: (id, params = {}) => api.get(`/servers/${id}/players`, { params }).then(r => r.data),
  getPlayer: (id, steam_id, limit = 50) => api.get(`/servers/${id}/players/${steam_id}`, { params: { limit } }).then(r => r.data),
  serverMetrics: (id) => api.get(`/servers/${id}/metrics`).then(r => r.data),
  installProgress: (id) => api.get(`/servers/${id}/install/progress`).then(r => r.data),
};
