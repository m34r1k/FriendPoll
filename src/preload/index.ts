import { contextBridge, ipcRenderer } from 'electron'

/** Settings the OS side of the app cares about (see lib/useSettings.tsx). */
interface Preferences {
  theme: 'system' | 'light' | 'dark'
  /** What that theme works out to right now, for the window's own colours. */
  dark: boolean
  keepInTray: boolean
}

// The small, named set of things the UI may ask the OS for - nothing else of
// Electron or Node reaches the page.
contextBridge.exposeInMainWorld('desktop', {
  /** Brings the app window to the front, e.g. from a clicked notification. */
  focusWindow: (): Promise<void> => ipcRenderer.invoke('focus-window'),
  setPreferences: (preferences: Preferences): Promise<void> =>
    ipcRenderer.invoke('set-preferences', preferences),
  /** Unread total, for the tray icon's tooltip and menu. */
  setUnread: (count: number): Promise<void> => ipcRenderer.invoke('set-unread', count),
  /** False when the app is running from source, where there is no tray. */
  hasTray: (): Promise<boolean> => ipcRenderer.invoke('has-tray'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app-version')
})
