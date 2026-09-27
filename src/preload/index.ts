import { contextBridge, ipcRenderer } from 'electron'

// The only thing the UI can ask the OS for: bring our window to the front,
// used when someone clicks a desktop notification.
contextBridge.exposeInMainWorld('desktop', {
  focusWindow: (): Promise<void> => ipcRenderer.invoke('focus-window')
})
