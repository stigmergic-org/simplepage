// frontend/src/hooks/useApplyThemeFromSettings.js
import { useEffect } from 'react'
import { useRepo } from '../hooks/useRepo'

const THEME_STORAGE_KEY = '__spg_theme_mode' // stores "light" | "dark" | "system"

function resolveSystemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function computeTheme(mode, opts = {}) {
  // mode is "light" | "dark" | "system"
  if (mode === 'system') return resolveSystemTheme()
  return mode === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme) {
  const root = document.documentElement
  // Tailwind/Daisy usually key off data-theme or class; use whichever your CSS expects.
  root.setAttribute('data-theme', theme)
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export function useApplyThemeFromSettings() {
  const repo = useRepo()

  useEffect(() => {
    let unsubMedia;

    (async () => {
      try {
        // 1) First, apply from localStorage IMMEDIATELY (prevents flicker on SPA nav)
        const stored = localStorage.getItem(THEME_STORAGE_KEY)
        if (stored) {
          applyTheme(computeTheme(stored))
        }

        // 2) Wait for repo to be ready, then load canonical preference
        await repo?.ready

        const settings = await repo.settings.read()
        const mode = settings?.appearance?.themeMode || 'system'

        // Persist & apply
        localStorage.setItem(THEME_STORAGE_KEY, mode)
        applyTheme(computeTheme(mode))

        // 3) If user tracks system theme, react to OS changes live
        if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
          const mql = window.matchMedia('(prefers-color-scheme: dark)')
          const onChange = () => applyTheme(mql.matches ? 'dark' : 'light')
          mql.addEventListener?.('change', onChange)
          unsubMedia = () => mql.removeEventListener?.('change', onChange)
        }
      } catch (e) {
        // Fallback: system
        const fallback = computeTheme('system')
        localStorage.setItem(THEME_STORAGE_KEY, 'system')
        applyTheme(fallback)
        // Optional: console.warn('Theme load failed', e)
      }
    })()

    return () => {
      if (unsubMedia) unsubMedia()
    }
  }, [repo])
}