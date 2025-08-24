// frontend/src/pages/theme.jsx
import React, { useEffect, useState } from 'react';
import Navbar from '../components/navbar';
import { THEMES, applyTheme, loadTheme } from '../utils/theme';

export default function ThemePage() {
  const [current, setCurrent] = useState('light');

  useEffect(() => {
    setCurrent(loadTheme());
  }, []);

  const onSelect = (t) => {
    setCurrent(t);
    applyTheme(t);
  };

  return (
    <>
      <Navbar activePage="Theme" />
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold mb-4">Theme</h1>

        <div className="mb-6">
          <label className="label">
            <span className="label-text">Choose a theme</span>
          </label>
          <select
            className="select select-bordered w-full max-w-xs"
            value={current}
            onChange={(e) => onSelect(e.target.value)}
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEMES.map((t) => (
            // ⬇️ Put data-theme here (on the same element as bg-base-100)
            <div key={t} data-theme={t} className="card bg-base-100 shadow">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <h2 className="card-title capitalize">{t}</h2>
                  <span className="badge badge-outline">{t}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary btn-sm">Primary</button>
                  <button className="btn btn-secondary btn-sm">Secondary</button>
                  <button className="btn btn-accent btn-sm">Accent</button>
                </div>
                <div className="mt-3">
                  <input type="text" className="input input-bordered input-sm w-full" placeholder="Input preview" />
                </div>
                <div className="mt-3">
                  <progress className="progress w-full" value="60" max="100" />
                </div>
                <div className="card-actions justify-end mt-4">
                  {current === t ? (
                    <button className="btn btn-success btn-sm" disabled>Active</button>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => onSelect(t)}>Apply</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}