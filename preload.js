const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  check: () => ipcRenderer.invoke('dsh:check'),
  start: () => ipcRenderer.invoke('dsh:start'),
  stop: () => ipcRenderer.invoke('dsh:stop'),
  onLog: (cb) => ipcRenderer.on('dsh:log', (_e, line) => cb(line)),
  onStatus: (cb) => ipcRenderer.on('dsh:status', (_e, s) => cb(s)),
  githubStart: () => ipcRenderer.invoke('github:start'),
  githubPoll: () => ipcRenderer.invoke('github:poll'),
  githubStatus: () => ipcRenderer.invoke('github:status'),
  githubLogout: () => ipcRenderer.invoke('github:logout'),
  githubOpenBrowser: (url) => ipcRenderer.invoke('github:openBrowser', url),
  githubOpenLoginWindow: () => ipcRenderer.invoke('github:openLoginWindow'),
});
