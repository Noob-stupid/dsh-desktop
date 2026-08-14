const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  githubSave: (payload) => ipcRenderer.invoke('github:save', payload),
  githubStatus: () => ipcRenderer.invoke('github:status'),
  githubLogout: () => ipcRenderer.invoke('github:logout'),
  githubOpenBrowser: (url) => ipcRenderer.invoke('github:openBrowser', url),
});
