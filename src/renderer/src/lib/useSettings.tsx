import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isTimeZone, setDisplayTimeZone, systemTimeZone } from './time'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeChoice
  /** `null` follows the computer's zone. */
  timeZone: string | null
  /** Windows notifications when the app isn't in front. */
  desktopNotifications: boolean
  /** Stay in the tray when the window is closed, so notifications keep coming. */
  keepInTray: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  timeZone: null,
  desktopNotifications: true,
  keepInTray: true
}

/** Settings belong to this computer, not the account, so they live locally. */
const STORE_KEY = 'friendpoll.settings'

function readStored(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<Settings>
    return {
      theme:
        saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system'
          ? saved.theme
          : DEFAULT_SETTINGS.theme,
      timeZone: typeof saved.timeZone === 'string' && isTimeZone(saved.timeZone) ? saved.timeZone : null,
      desktopNotifications: saved.desktopNotifications !== false,
      keepInTray: saved.keepInTray !== false
    }
  } catch {
    // Damaged or blocked storage just means the defaults.
    return DEFAULT_SETTINGS
  }
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

interface SettingsApi {
  settings: Settings
  /** Changes one or more settings and saves them. */
  update: (change: Partial<Settings>) => void
  /** What `theme: 'system'` currently works out to. */
  dark: boolean
  /** The zone times are shown in: the override, or the computer's. */
  timeZone: string
}

const SettingsContext = createContext<SettingsApi | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readStored)
  const [systemDark, setSystemDark] = useState(prefersDark)
  const dark = settings.theme === 'system' ? systemDark : settings.theme === 'dark'
  const timeZone = settings.timeZone ?? systemTimeZone

  // Set while rendering, not in an effect, so the screens below this format
  // their times in the new zone on this very paint.
  setDisplayTimeZone(settings.timeZone)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = (): void => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings))
    } catch {
      // Not worth interrupting anyone over.
    }
    // The main process paints the window frame and owns the tray icon.
    void window.desktop?.setPreferences({
      theme: settings.theme,
      dark: settings.theme === 'system' ? prefersDark() : settings.theme === 'dark',
      keepInTray: settings.keepInTray
    })
  }, [settings, systemDark])

  const api = useMemo<SettingsApi>(
    () => ({
      settings,
      update: (change) => setSettings((current) => ({ ...current, ...change })),
      dark,
      timeZone
    }),
    [settings, dark, timeZone]
  )

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext)
  if (!api) throw new Error('useSettings() needs a <SettingsProvider> above it')
  return api
}

/** Every zone this computer knows, for the settings list. */
export function allTimeZones(): string[] {
  const supported = Intl.supportedValuesOf?.('timeZone') ?? []
  return supported.length > 0 ? supported : [systemTimeZone, 'UTC']
}
