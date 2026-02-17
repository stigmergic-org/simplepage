import React, { useState, useEffect } from 'react';
import { useDomain } from '../hooks/useDomain';
import { useRepo } from '../hooks/useRepo';
import useDarkMode from '../hooks/useDarkMode';
import { applyTheme } from '../hooks/useApplyTheme';
import Navbar from '../components/navbar';
import Icon from '../components/Icon';
import LoadingSpinner from '../components/LoadingSpinner';
import RainbowEditContent from '../components/RainbowEditContent';

const THEMES = [
  'light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro',
  'cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel',
  'fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business',
  'acid','lemonade','night','coffee','winter'
];

// Simple scoped preview card
function ThemePreview({ themeName, title }) {
  return (
    <div className="card bg-base-100 border border-base-300">
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
        <progress className="progress w-full" value="50" max="100" />
        <div className="text-sm opacity-70">
          Body text preview – links <a className="link">look like this</a>.
        </div>
      </div>
    </div>
  );
}

const Settings = () => {
  const domain = useDomain();
  const { repo } = useRepo();
  const isDarkMode = useDarkMode();
  const [editStyle, setEditStyle] = useState('rainbow');
  const [hideDonationNotice, setHideDonationNotice] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [lightTheme, setLightTheme] = useState('light');
  const [darkTheme, setDarkTheme] = useState('dark');
  const [isLoading, setIsLoading] = useState(true);

  document.title = `Settings - ${domain}`;

  // Load settings when component mounts
  const loadSettings = async () => {
    try {
      const settings = await repo.settings.read();
      setEditStyle(settings?.appearance?.editStyle || settings?.appearance?.forkStyle || editStyle);
      setHideDonationNotice(settings?.subscription?.hideDonationNotice || hideDonationNotice);
      setLightTheme(settings?.appearance?.theme?.light || lightTheme);
      setDarkTheme(settings?.appearance?.theme?.dark || darkTheme);
      setSearchEnabled(settings?.search?.enabled || searchEnabled);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    loadSettings();
  }, [repo]);

  // Save edit button style to settings
  const handleEditButtonStyleChange = async (newStyle) => {
    await repo.settings.writeProperty('appearance.editStyle', newStyle);
    setEditStyle(newStyle);
  };

  // Save donation notice setting
  const handleDonationNoticeToggle = async (hideDonationNotice) => {
    await repo.settings.writeProperty('subscription.hideDonationNotice', hideDonationNotice);
    setHideDonationNotice(hideDonationNotice);
  };

  const handleThemeChange = async (mode, theme) => {
    await repo.settings.writeProperty(`appearance.theme.${mode}`, theme);
    if (mode === 'light') setLightTheme(theme);
    else setDarkTheme(theme);

    if (isDarkMode && mode === 'dark' || !isDarkMode && mode === 'light') {
      applyTheme(theme);
    }
  }

  const handleSearchEnabledToggle = async (searchEnabled) => {
    await repo.settings.writeProperty('search.enabled', searchEnabled);
    setSearchEnabled(searchEnabled);
  };

  const handleClearPageEdits = () => repo.restoreAllPages();
  const handleClearFileEdits = () => repo.files.clearChanges();
  const handleClearAllCache = () => {
    repo.files.clearChanges();
    repo.restoreAllPages();
    repo.settings.clearChanges();
    localStorage.clear()
    loadSettings();
  };

  if (isLoading) {
    return (<>
      <Navbar activePage="Settings" />
      <LoadingSpinner />
    </>);
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
          {/* General Settings */}
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Icon name="settings" size={5} />
              General
            </h2>
            
            {/* Donation Notice Toggle */}
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={!hideDonationNotice}
                  onChange={(e) => handleDonationNoticeToggle(!e.target.checked)}
                />
                <div className="flex flex-col">
                  <span className="label-text font-medium">Show donation notice</span>
                  <span className="text-sm text-base-content/60 text-wrap">
                    <p>When enabled, visitors will see a notice asking for a donation when your subscription is about to expire (in less than 30 days).</p>
                  </span>
                </div>
              </label>

              {/* Search Enabled Toggle */}
              <label className="label cursor-pointer justify-start gap-3 mt-4">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={searchEnabled}
                  onChange={(e) => handleSearchEnabledToggle(e.target.checked)}
                />
                <div className="flex flex-col">
                  <span className="label-text font-medium">Enable search</span>
                  <span className="text-sm text-base-content/60 text-wrap">
                    <p>When enabled, visitors will be able to search the website.</p>
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Appearance Settings */}
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Icon name="palette" size={5} />
              Appearance
            </h2>

            {/* Edit Button Style */}
            <div className="form-control mb-6">
              <label className="label">
                <span className="label-text font-medium mb-2">Edit Button Style</span>
              </label>
              <div className="flex flex-row gap-6">
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="edit-style"
                    className="radio"
                    value="rainbow"
                    checked={editStyle === 'rainbow'}
                    onChange={(e) => handleEditButtonStyleChange(e.target.value)}
                  />
                  <button
                    className="btn btn-sm rainbow-edit text-lg"
                    onClick={() => handleEditButtonStyleChange('rainbow')}
                  >
                    <RainbowEditContent />
                  </button>
                </label>

                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="edit-style"
                    className="radio"
                    value="plain"
                    checked={editStyle === 'plain'}
                    onChange={(e) => handleEditButtonStyleChange(e.target.value)}
                  />
                  <button
                    className="btn btn-sm plain-edit text-lg bg-transparent"
                    onClick={() => handleEditButtonStyleChange('plain')}
                  >
                    <Icon name="edit" size={4} />
                  </button>
                </label>
              </div>
            </div>

            {/* Theme selectors + dual preview */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium mb-2">Themes</span>
              </label>

              <p className="mb-4 text-sm opacity-70">
                The active theme follows your system setting. Selecting a new{" "}
                <span className="font-medium">Light</span> or{" "}
                <span className="font-medium">Dark</span> theme saves instantly
                and live-applies if your OS is currently in that mode. Changes are
                included the next time you publish.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Light theme selector */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm opacity-70">Light</span>
                    <select
                      className="select select-bordered w-full max-w-xs"
                      value={lightTheme}
                      onChange={(e) => handleThemeChange('light', e.target.value)}
                    >
                      {THEMES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <ThemePreview themeName={lightTheme} title="Light Preview" />
                </div>

                {/* Dark theme selector */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm opacity-70">Dark</span>
                    <select
                      className="select select-bordered w-full max-w-xs"
                      value={darkTheme}
                      onChange={(e) => handleThemeChange('dark', e.target.value)}
                    >
                      {THEMES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <ThemePreview themeName={darkTheme} title="Dark Preview" />
                </div>
              </div>

              {/* Previews */}
              {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ThemePreview themeName={lightTheme} title="Light Preview" />
                <ThemePreview themeName={darkTheme} title="Dark Preview" />
              </div> */}

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
                <span className="text-base-content/60">Clear all unsaved page edits</span>
                <button className="btn btn-outline btn-warning" onClick={handleClearPageEdits}>
                  Clear Page Edits
                </button>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-base-content/60">Clear all unsaved file edits</span>
                <button className="btn btn-outline btn-warning" onClick={handleClearFileEdits}>
                  Clear File Edits
                </button>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-base-content/60">Clear all locally cached data</span>
                <button className="btn btn-outline btn-error" onClick={handleClearAllCache}>
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
