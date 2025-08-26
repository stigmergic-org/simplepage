/*
 * Notes:
 * - Clears any legacy Tailwind v3 "dark" class to avoid conflicts.
 * - Falls back to DEFAULT_THEME if nothing is saved or if repo.settings fails.
 * - Runs once on mount and re-runs only if `repo` changes.
 * - Uses a simple "alive" flag to prevent updating DOM after unmount.
 *
 * This keeps the theme consistent across page refreshes and navigation,
 * without relying on localStorage. Pattern mirrors how forkStyle is persisted.
 */

import { useEffect } from 'react';
import { useRepo } from '../hooks/useRepo';

const DEFAULT_THEME = 'light';

function applyTheme(theme) {
  // clear any legacy tailwind v3 dark class just in case
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
