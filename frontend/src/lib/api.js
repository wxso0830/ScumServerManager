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
  listServers: () => api.get("/servers").then(r => r.data),
  createServer: (payload = {}) => api.post("/servers", payload).then(r => r.data),
  getServer: (id) => api.get(`/servers/${id}`).then(r => r.data),
  renameServer: (id, name) => api.put(`/servers/${id}`, { name }).then(r => r.data),
  updateSettings: (id, settings) => api.put(`/servers/${id}/settings`, { settings }).then(r => r.data),
  deleteServer: (id) => api.delete(`/servers/${id}`).then(r => r.data),
  startServer: (id) => api.post(`/servers/${id}/start`).then(r => r.data),
  stopServer: (id) => api.post(`/servers/${id}/stop`).then(r => r.data),
};
