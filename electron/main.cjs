const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const { ipcMain } = require('electron')
const path = require('node:path')
const { runColmapCheck, detectCuda } = require('./colmap.cjs')
const { runPhotogrammetry } = require('./photogrammetry.cjs')

const isDevelopment = !app.isPackaged

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDevelopment) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173')
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('colmap:check', () => runColmapCheck())
ipcMain.handle('gpu:check', () => detectCuda())
ipcMain.handle('photogrammetry:run', async (event, files) => {
  try {
    return {
      ok: true,
      ...(await runPhotogrammetry(files, (progress) => {
        event.sender.send('photogrammetry:progress', progress)
      })),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})
ipcMain.handle('model:read', async (_event, modelPath) => {
  const data = await fs.readFile(modelPath)
  return new Uint8Array(data)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})