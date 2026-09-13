const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  checkColmap: () => ipcRenderer.invoke('colmap:check'),
  checkGpu: () => ipcRenderer.invoke('gpu:check'),
  runPhotogrammetry: (files) => ipcRenderer.invoke('photogrammetry:run', files),
  onPhotogrammetryProgress: (listener) => {
    const handler = (_event, progress) => listener(progress)
    ipcRenderer.on('photogrammetry:progress', handler)
    return () => ipcRenderer.removeListener('photogrammetry:progress', handler)
  },
  readModel: (modelPath) => ipcRenderer.invoke('model:read', modelPath),
})