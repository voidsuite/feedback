/**
 * App settings — persisted in IndexedDB (kv), applied live to the theme.
 * Theme + accent live here as the single source of truth; ThemeProvider only
 * applies them to the DOM.
 */

import * as React from "react"
import { useTheme } from "@/components/theme-provider"
import { kvGet, kvSet } from "@/lib/db"
import { defaultSettings, type AppSettings } from "@/lib/types"

const SETTINGS_KEY = "vdocs_settings"

interface SettingsContextValue {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
}

const SettingsContext = React.createContext<SettingsContextValue | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { setTheme, setAccent } = useTheme()
  const [settings, setSettings] = React.useState<AppSettings>(defaultSettings)
  const loaded = React.useRef(false)

  // Load persisted settings once.
  React.useEffect(() => {
    kvGet<AppSettings>(SETTINGS_KEY).then((saved) => {
      if (saved) setSettings({ ...defaultSettings, ...saved })
      loaded.current = true
    })
  }, [])

  // Apply theme/accent whenever settings change.
  React.useEffect(() => {
    setTheme(settings.theme)
    setAccent(settings.accent)
  }, [settings.theme, settings.accent, setTheme, setAccent])

  // Persist after the initial load lands (avoid clobbering with defaults).
  React.useEffect(() => {
    if (!loaded.current) return
    kvSet(SETTINGS_KEY, settings)
  }, [settings])

  const updateSettings = React.useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetSettings = React.useCallback(() => {
    setSettings(defaultSettings)
  }, [])

  const value = React.useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = React.useContext(SettingsContext)
  if (!context) throw new Error("useSettings must be used within a SettingsProvider")
  return context
}
