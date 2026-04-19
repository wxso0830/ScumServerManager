const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lgss', {
  listDisks: () => ipcRenderer.invoke('lgss:list-disks'),
  createFolder: (p) => ipcRenderer.invoke('lgss:create-folder', p),
  openFolder: (p) => ipcRenderer.invoke('lgss:open-folder', p),
  installServer: (opts) => ipcRenderer.invoke('lgss:install-server', opts),
  writeConfigFiles: (plan) => ipcRenderer.invoke('lgss:write-config-files', plan),
  startServer: (opts) => ipcRenderer.invoke('lgss:start-server', opts),
  stopServer: (opts) => ipcRenderer.invoke('lgss:stop-server', opts),
  backendInfo: () => ipcRenderer.invoke('lgss:backend-info'),

  // --- Auto-updater (GitHub Releases) ---
  getVersion: () => ipcRenderer.invoke('lgss:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('lgss:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('lgss:download-update'),
  installUpdate: () => ipcRenderer.invoke('lgss:install-update'),
  onUpdateEvent: (cb) => {
    const channel = 'lgss:update-event';
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  isElectron: true,
});
