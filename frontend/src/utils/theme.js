const STORAGE_KEY = 'spg-theme';
export const THEMES = [
  'light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk',
  'valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe',
  'black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee',
  'winter','dim','nord','sunset'
];
const FALLBACK = 'light';

export const loadTheme = () => {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t && THEMES.includes(t) ? t : FALLBACK;
  } catch { return FALLBACK; }
};

const saveTheme = (t) => {
  try { localStorage.setItem(STORAGE_KEY, t && THEMES.includes(t) ? t : FALLBACK); } catch {}
};

export const applyTheme = (t) => {
  const root = document.documentElement;
  root.classList.remove('dark','light');
  document.body?.classList?.remove('dark','light');

  const valid = t && THEMES.includes(t) ? t : FALLBACK;
  root.setAttribute('data-theme', valid);
  saveTheme(valid);
};