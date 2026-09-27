import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, Tray } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Lets Windows group our taskbar entry and name us on notifications. */
const APP_ID = 'com.m34r1k.friendpoll'

/** Matches --color-bg in the UI, so startup doesn't flash the wrong colour. */
const BACKGROUND = { light: '#f6f3ee', dark: '#171512' }

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
  /** The theme last in use, so the window opens the right colour. */
  dark?: boolean
}

const DEFAULT_STATE: WindowState = { width: 1280, height: 800 }
const stateFile = (): string => join(app.getPath('userData'), 'window-state.json')

/** True while the app is meant to close for good, not hide to the tray. */
let quitting = false
let tray: Tray | null = null
let keepInTray = true
let unreadCount = 0
let toldAboutTray = false
let dark = false

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
    writeFileSync(
      stateFile(),
      JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized(), dark })
    )
  } catch {
    // Forgetting the window size is not worth crashing over.
  }
}

const mainWindow = (): BrowserWindow | undefined => BrowserWindow.getAllWindows()[0]

/** Back to the front from anywhere: the tray, a notification, a second copy. */
function showWindow(): void {
  const win = mainWindow()
  if (!win) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  const state = readState()
  dark = state.dark === true
  const win = new BrowserWindow({
    ...state,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: dark ? BACKGROUND.dark : BACKGROUND.light,
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

  // Closing the window normally leaves the app in the tray, so invites and
  // answers still reach you. Quit from the tray, or turn this off in Settings.
  win.on('close', (event) => {
    saveState(win)
    if (quitting || !keepInTray || !tray) return
    event.preventDefault()
    win.hide()
    if (!toldAboutTray) {
      toldAboutTray = true
      tray.displayBalloon({
        title: 'FriendPoll is still running',
        content: 'It waits by the clock so notifications still reach you. Right-click it to quit.'
      })
    }
  })

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

function refreshTray(): void {
  if (!tray) return
  tray.setToolTip(unreadCount > 0 ? `FriendPoll - ${unreadCount} unread` : 'FriendPoll')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: unreadCount > 0 ? `${unreadCount} unread` : 'Nothing unread',
        enabled: false
      },
      { type: 'separator' },
      { label: 'Open FriendPoll', click: showWindow },
      {
        label: 'Quit FriendPoll',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  // build/tray.png ships next to the app; see extraResources in package.json.
  const icon = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../build/tray.png')
  try {
    tray = new Tray(icon)
  } catch {
    // No tray icon means no tray - the app still works, and closing the
    // window then quits as it used to.
    return
  }
  tray.on('click', () => {
    const win = mainWindow()
    if (win?.isVisible() && win.isFocused()) win.hide()
    else showWindow()
  })
  refreshTray()
}

app.setAppUserModelId(APP_ID)

// Clicking a desktop notification brings the app back, even when minimised.
ipcMain.handle('focus-window', () => showWindow())

ipcMain.handle('set-preferences', (_event, preferences: unknown) => {
  const prefs = (preferences ?? {}) as { theme?: string; dark?: boolean; keepInTray?: boolean }
  if (prefs.theme === 'system' || prefs.theme === 'light' || prefs.theme === 'dark') {
    nativeTheme.themeSource = prefs.theme
  }
  if (typeof prefs.dark === 'boolean' && prefs.dark !== dark) {
    dark = prefs.dark
    const win = mainWindow()
    win?.setBackgroundColor(dark ? BACKGROUND.dark : BACKGROUND.light)
    if (win) saveState(win)
  }
  if (typeof prefs.keepInTray === 'boolean') keepInTray = prefs.keepInTray
})

ipcMain.handle('set-unread', (_event, count: unknown) => {
  unreadCount = Math.max(0, Math.floor(Number(count) || 0))
  refreshTray()
})

ipcMain.handle('app-version', () => app.getVersion())

// Two copies would fight over the same saved window position.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(() => {
    createWindow()
    createTray()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // With a tray icon the app carries on without a window; without one, the
  // window closing is the app closing.
  if (process.platform !== 'darwin' && (!keepInTray || !tray)) app.quit()
})
