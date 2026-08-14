const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  check: () => ipcRenderer.invoke('dsh:check'),
  start: () => ipcRenderer.invoke('dsh:start'),
  stop: () => ipcRenderer.invoke('dsh:stop'),
  onLog: (cb) => ipcRenderer.on('dsh:log', (_e, line) => cb(line)),
  onStatus: (cb) => ipcRenderer.on('dsh:status', (_e, s) => cb(s)),
  githubSave: (payload) => ipcRenderer.invoke('github:save', payload),
  githubStatus: () => ipcRenderer.invoke('github:status'),
  githubLogout: () => ipcRenderer.invoke('github:logout'),
  githubOpenBrowser: (url) => ipcRenderer.invoke('github:openBrowser', url),
  githubOpenLoginWindow: () => ipcRenderer.invoke('github:openLoginWindow'),
});
