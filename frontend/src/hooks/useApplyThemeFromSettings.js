import { useEffect } from 'react'
import { useRepo } from '../hooks/useRepo'
import useDarkMode from '../hooks/useDarkMode'

function applyTheme(theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export function useApplyThemeFromSettings() {
  const { repo } = useRepo()
  const isDarkMode = useDarkMode()

  useEffect(() => {

    (async () => {
      const mode = isDarkMode ? 'dark' : 'light'
      const { appearance } = await repo.settings.read()
      const theme = appearance?.theme?.[mode] || mode
      applyTheme(theme)
    })()

  }, [repo, isDarkMode])
}