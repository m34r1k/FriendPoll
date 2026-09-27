/// <reference types="vite/client" />

// Values from .env (see .env.example). Both are safe to ship in the app.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Put there by the preload script (src/preload/index.ts).
interface Window {
  desktop?: {
    /** Brings the app window to the front. */
    focusWindow: () => Promise<void>
  }
}
