import React, { useState, useEffect } from 'react';
import { useDomain } from '../hooks/useDomain';
import { useRepo } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import Icon from '../components/Icon';
import LoadingSpinner from '../components/LoadingSpinner';

const THEMES = [
  'light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro',
  'cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel',
  'fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business',
  'acid','lemonade','night','coffee','winter'
];

const DEFAULT_SETTINGS = {
  appearance: {
    forkStyle: 'rainbow',
    theme: 'light',
  },
};

function applyThemeGlobally(theme) {
  if (typeof document !== 'undefined') {
    // Important: remove any tailwind v3 dark-mode class before applying DaisyUI theme
    document.documentElement.removeAttribute('class');
    document.documentElement.setAttribute('data-theme', theme);
  }
}

const Settings = () => {
  const domain = useDomain();
  const { repo } = useRepo();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // theme states
  const currentTheme = settings?.appearance?.theme ?? DEFAULT_SETTINGS.appearance.theme;
  const [draftTheme, setDraftTheme] = useState(currentTheme);

  document.title = `Settings - ${domain}`;

  const loadSettings = async () => {
    try {
      const loaded = await repo.settings.read();
      const merged =
        Object.keys(loaded || {}).length === 0
          ? DEFAULT_SETTINGS
          : {
              ...DEFAULT_SETTINGS,
              ...loaded,
              appearance: {
                ...DEFAULT_SETTINGS.appearance,
                ...(loaded.appearance || {}),
              },
            };

      setSettings(merged);
      setDraftTheme(merged.appearance.theme);
      // apply saved theme globally
      applyThemeGlobally(merged.appearance.theme);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  // Also auto-apply whenever currentTheme changes (keeps UI consistent)
  useEffect(() => {
    applyThemeGlobally(currentTheme);
  }, [currentTheme]);

  // Save fork button style to settings
  const handleForkButtonStyleChange = async (newStyle) => {
    try {
      const currentSettings = await repo.settings.read();
      const updatedSettings = {
        ...DEFAULT_SETTINGS,
        ...currentSettings,
        appearance: {
          ...DEFAULT_SETTINGS.appearance,
          ...(currentSettings.appearance || {}),
          forkStyle: newStyle,
        },
      };
      await repo.settings.write(updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save fork button style:', error);
    }
  };

  // Theme: persist + apply
  const handleApplyTheme = async () => {
    try {
      const currentSettings = await repo.settings.read();
      const updatedSettings = {
        ...DEFAULT_SETTINGS,
        ...currentSettings,
        appearance: {
          ...DEFAULT_SETTINGS.appearance,
          ...(currentSettings.appearance || {}),
          theme: draftTheme,
        },
      };
      await repo.settings.write(updatedSettings);
      setSettings(updatedSettings);
      applyThemeGlobally(draftTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const handleResetDraftTheme = () => setDraftTheme(currentTheme);

  const handleClearPageEdits = () => repo.restoreAllPages();
  const handleClearFileEdits = () => repo.files.clearChanges();
  const handleClearAllCache = () => {
    repo.files.clearChanges();
    repo.restoreAllPages();
    repo.settings.clearChanges();
    localStorage.clear();
    loadSettings();
  };

  // simple component palette preview content
  const ThemePreview = ({ themeName, title }) => (
    <div className="card bg-base-100 border border-base-300">
      {/* Put data-theme on an inner wrapper to scope preview */}
      <div className="card-body gap-4" data-theme={themeName}>
        <div className="flex items-center justify-between">
          <h3 className="card-title">{title}</h3>
          <span className="badge badge-outline">{themeName}</span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm">Primary</button>
          <button className="btn btn-secondary btn-sm">Secondary</button>
          <button className="btn btn-accent btn-sm">Accent</button>
        </div>
        <div className="flex gap-2">
          <input className="input input-bordered input-sm" placeholder="Input" />
          <select className="select select-bordered select-sm">
            <option>Option A</option>
            <option>Option B</option>
          </select>
        </div>
        <progress className="progress w-full" value="50" max="100"></progress>
        <div className="text-sm opacity-70">
          Body text preview – links <a className="link">look like this</a>.
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        <Navbar activePage="Settings" />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <Navbar activePage="Settings" />
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-base-content/60">Manage preferences for {domain}</p>
        </div>

        <div className="space-y-6">
          {/* Appearance Settings */}
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Icon name="palette" size={5} />
              Appearance
            </h2>

            {/* Fork Button Style */}
            <div className="form-control mb-6">
              <label className="label">
                <span className="label-text font-medium mb-2">Fork Button Style</span>
              </label>
              <div className="flex flex-row gap-6">
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="fork-style"
                    className="radio"
                    value="rainbow"
                    checked={settings?.appearance?.forkStyle === 'rainbow'}
                    onChange={(e) => handleForkButtonStyleChange(e.target.value)}
                  />
                  <button
                    className="btn btn-sm rainbow-fork text-lg"
                    onClick={() => handleForkButtonStyleChange('rainbow')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
                      <defs>
                        <mask id="fork-mask">
                          <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" fill="white" />
                        </mask>
                      </defs>
                    </svg>
                    {'fork'}
                  </button>
                </label>

                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="fork-style"
                    className="radio"
                    value="plain"
                    checked={settings?.appearance?.forkStyle === 'plain'}
                    onChange={(e) => handleForkButtonStyleChange(e.target.value)}
                  />
                  <button
                    className="btn btn-sm plain-fork text-lg bg-transparent"
                    onClick={() => handleForkButtonStyleChange('plain')}
                  >
                    <Icon name="fork" size={4} />
                  </button>
                </label>
              </div>
            </div>

            <div className="divider"></div>

            {/* Theme selector + dual preview */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium mb-2">Theme</span>
              </label>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <select
                  className="select select-bordered w-full max-w-xs"
                  value={draftTheme}
                  onChange={(e) => setDraftTheme(e.target.value)}
                >
                  {THEMES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <button
                  className="btn btn-primary"
                  onClick={handleApplyTheme}
                  disabled={draftTheme === currentTheme}
                  title={draftTheme === currentTheme ? 'Already applied' : 'Apply & Save'}
                >
                  Apply & Save
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={handleResetDraftTheme}
                  disabled={draftTheme === currentTheme}
                >
                  Reset
                </button>
              </div>

              {/* Previews */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ThemePreview themeName={currentTheme} title="Current Theme (Applied)" />
                <ThemePreview themeName={draftTheme} title="Preview (Draft)" />
              </div>

              <p className="mt-3 text-sm opacity-70">
                Select a theme to preview. Click <span className="font-medium">Apply &amp; Save</span> to use it site-wide and persist in your repo settings.
              </p>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Icon name="tools" size={5} />
              Advanced
            </h2>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-base-content/60">Clear all unsaved page edits</span>
                </div>
                <button
                  className="btn btn-outline btn-warning"
                  onClick={handleClearPageEdits}
                >
                  Clear Page Edits
                </button>
              </div>

              <div className="flex justify-between items-center">
                <div>
                  <span className="text-base-content/60">Clear all unsaved file edits</span>
                </div>
                <button
                  className="btn btn-outline btn-warning"
                  onClick={handleClearFileEdits}
                >
                  Clear File Edits
                </button>
              </div>

              <div className="flex justify-between items-center">
                <div>
                  <span className="text-base-content/60">Clear all locally cached data</span>
                </div>
                <button
                  className="btn btn-outline btn-error"
                  onClick={handleClearAllCache}
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Settings;