import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Lets Windows group our taskbar entry and name us on notifications. */
const APP_ID = 'com.m34r1k.friendpoll'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const DEFAULT_STATE: WindowState = { width: 1280, height: 800 }
const stateFile = (): string => join(app.getPath('userData'), 'window-state.json')

function readState(): WindowState {
  try {
    const saved = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<WindowState>
    if (typeof saved.width === 'number' && typeof saved.height === 'number') {
      return { ...DEFAULT_STATE, ...saved }
    }
  } catch {
    // First run, or the file is damaged - use the default size.
  }
  return DEFAULT_STATE
}

function saveState(win: BrowserWindow): void {
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
  } catch {
    // Forgetting the window size is not worth crashing over.
  }
}

function createWindow(): void {
  const state = readState()
  const win = new BrowserWindow({
    ...state,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#f6f3ee',
    autoHideMenuBar: true,
    title: 'FriendPoll',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  // Remember size and position, but not on every pixel of a drag.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const rememberSoon = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveState(win), 400)
  }
  win.on('resize', rememberSoon)
  win.on('move', rememberSoon)
  win.on('close', () => saveState(win))

  // Links open in the real browser, never in a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    // Surface UI errors in the terminal during development.
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        console.log(`[renderer ${event.level}] ${event.message}`)
      }
    })
  }

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setAppUserModelId(APP_ID)

// Clicking a desktop notification brings the app back, even when minimised.
ipcMain.handle('focus-window', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

// Two copies would fight over the same saved window position.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
