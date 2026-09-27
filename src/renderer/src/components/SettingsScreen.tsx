import { useEffect, useState, type ReactNode } from 'react'
import { formatTime, systemTimeZone } from '../lib/time'
import { useNow } from '../lib/useNow'
import { allTimeZones, useSettings, type ThemeChoice } from '../lib/useSettings'

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match Windows' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

/** Everything here is saved on this computer only, not to your account. */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { settings, update, timeZone } = useSettings()
  const now = useNow(1000)
  const [version, setVersion] = useState<string | null>(null)
  const [hasTray, setHasTray] = useState(false)
  const desktop = window.desktop

  useEffect(() => {
    void desktop?.appVersion().then(setVersion)
    void desktop?.hasTray().then(setHasTray)
  }, [desktop])

  return (
    <main className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6">
        <button type="button" onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">
          ← Home
        </button>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          These are saved on this computer, so each of your devices can differ.
        </p>

        <Group title="Appearance">
          <Row label="Theme" hint="Dark keeps the same warm colours, just turned down.">
            <div className="inline-flex rounded-lg bg-sunken p-1">
              {THEMES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={settings.theme === choice.value}
                  onClick={() => update({ theme: choice.value })}
                  className={`rounded-md px-3 py-1 text-sm font-semibold ${
                    settings.theme === choice.value ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </Row>
        </Group>

        <Group title="Times">
          <Row
            label="Time zone"
            hint={`Every time in the app is shown - and entered - by this clock. It's ${formatTime(now, timeZone)} there now.`}
          >
            <select
              aria-label="Time zone"
              value={settings.timeZone ?? ''}
              onChange={(e) => update({ timeZone: e.target.value || null })}
              className="max-w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Match my computer ({systemTimeZone})</option>
              {allTimeZones().map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Row>
        </Group>

        <Group title="Notifications">
          <Toggle
            checked={settings.desktopNotifications}
            onChange={(on) => update({ desktopNotifications: on })}
            label="Show Windows notifications"
            hint="For invites, answers and times turning on - only while the app isn't the window you're looking at."
          />
          {hasTray && (
            <Toggle
              checked={settings.keepInTray}
              onChange={(on) => update({ keepInTray: on })}
              label="Keep running in the tray when I close the window"
              hint="Notifications keep arriving. Right-click the tray icon near the clock to quit for real."
            />
          )}
        </Group>

        <Group title="About">
          <p className="px-4 py-3 text-sm text-muted">
            FriendPoll{version ? ` ${version}` : ''} · MIT licence ·{' '}
            <a
              href="https://github.com/m34r1k/FriendPoll"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent hover:underline"
            >
              github.com/m34r1k/FriendPoll
            </a>
          </p>
        </Group>
      </div>
    </main>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint: string
}

function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </label>
  )
}
