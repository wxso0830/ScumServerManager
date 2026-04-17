const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lgss', {
  listDisks: () => ipcRenderer.invoke('lgss:list-disks'),
  createFolder: (p) => ipcRenderer.invoke('lgss:create-folder', p),
  openFolder: (p) => ipcRenderer.invoke('lgss:open-folder', p),
  startServer: (opts) => ipcRenderer.invoke('lgss:start-server', opts),
  stopServer: (opts) => ipcRenderer.invoke('lgss:stop-server', opts),
  isElectron: true,
});
