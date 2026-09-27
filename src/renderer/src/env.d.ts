/// <reference types="vite/client" />

// Values from .env (see .env.example). Both are safe to ship in the app.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Put there by the preload script (src/preload/index.ts). Missing when the UI
// runs in a plain browser tab, so every call site uses `window.desktop?.`.
interface Window {
  desktop?: {
    /** Brings the app window to the front. */
    focusWindow: () => Promise<void>
    setPreferences: (preferences: {
      theme: 'system' | 'light' | 'dark'
      dark: boolean
      keepInTray: boolean
    }) => Promise<void>
    setUnread: (count: number) => Promise<void>
    appVersion: () => Promise<string>
  }
}
