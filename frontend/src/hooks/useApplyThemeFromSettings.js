import { useEffect } from 'react';
import { useRepo } from '../hooks/useRepo';

const DEFAULT_THEME = 'light';

function applyTheme(theme) {
  // Clear any legacy Tailwind v3 dark class just in case
  document.documentElement.removeAttribute('class');
  document.documentElement.setAttribute('data-theme', theme || DEFAULT_THEME);
}

export function useApplyThemeFromSettings() {
  const { repo } = useRepo();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const loaded = await repo.settings.read();
        const theme = loaded?.appearance?.theme || DEFAULT_THEME;
        if (alive) applyTheme(theme);
      } catch (err) {
        console.error('Theme load failed:', err);
        if (alive) applyTheme(DEFAULT_THEME);
      }
    })();
    return () => { alive = false; };
  }, [repo]);
}