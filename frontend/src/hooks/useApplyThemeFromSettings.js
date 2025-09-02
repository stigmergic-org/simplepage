import { useEffect } from 'react'
import { useRepo } from '../hooks/useRepo'

function resolveSystemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function computeTheme(mode) {
  return mode === 'system' ? resolveSystemTheme() : (mode === 'dark' ? 'dark' : 'light')
}

function applyTheme(theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export function useApplyThemeFromSettings() {
  const repo = useRepo()

  useEffect(() => {
    let unsub = null

    ;(async () => {
      try {
        await repo?.ready
        const settings = await repo.settings.read()
        const mode = settings?.appearance?.themeMode || 'system'
        applyTheme(computeTheme(mode))

        if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
          const mql = window.matchMedia('(prefers-color-scheme: dark)')
          const onChange = () => applyTheme(mql.matches ? 'dark' : 'light')
          mql.addEventListener?.('change', onChange)
          unsub = () => mql.removeEventListener?.('change', onChange)
        }
      } catch {
        applyTheme(computeTheme('system'))
      }
    })()

    return () => { if (unsub) unsub() }
  }, [repo])
}