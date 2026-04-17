const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lgss', {
  listDisks: () => ipcRenderer.invoke('lgss:list-disks'),
  createFolder: (p) => ipcRenderer.invoke('lgss:create-folder', p),
  openFolder: (p) => ipcRenderer.invoke('lgss:open-folder', p),
  installServer: (opts) => ipcRenderer.invoke('lgss:install-server', opts),
  writeConfigFiles: (plan) => ipcRenderer.invoke('lgss:write-config-files', plan),
  startServer: (opts) => ipcRenderer.invoke('lgss:start-server', opts),
  stopServer: (opts) => ipcRenderer.invoke('lgss:stop-server', opts),
  isElectron: true,
});
