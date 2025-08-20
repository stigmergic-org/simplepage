import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDomain } from '../hooks/useDomain';
import { useRepo } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import Icon from '../components/Icon';

const Settings = () => {
  const navigate = useNavigate();
  const domain = useDomain();
  const repo = useRepo();
  const [forkButtonStyle, setForkButtonStyle] = useState('rainbow');

  document.title = `Settings - ${domain}`;

  const handleBackClick = () => {
    navigate(-1);
  };

  const handleClearPageEdits = () => {
    // TODO: Implement clear page edits functionality
    console.log('Clear page edits clicked');
  };

  const handleClearFileEdits = () => repo.clearChanges()

  const handleClearAllCache = () => {
    // TODO: Implement clear all cache functionality
    console.log('Clear all cache clicked');
  };

  return (
    <>
      <Navbar 
        activePage="Settings"
      />
      <div className="container mx-auto max-w-3xl px-4 py-6">
        
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-base-content/60">Manage preferences for {domain}</p>
        </div>

        <div className="space-y-6">
          {/* General Settings */}
          {/*
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Icon name="settings" size={5} />
              General Settings
            </h2>
          </div>
          */}

          {/* Appearance Settings */}
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Icon name="palette" size={5} />
              Appearance
            </h2>
            
            {/* Fork Button Style */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium mb-2">Fork Button Style</span>
              </label>
              <div className="flex flex-row gap-6">
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="radio-2"
                    className="radio"
                    value="rainbow"
                    checked={forkButtonStyle === 'rainbow'}
                    onChange={(e) => setForkButtonStyle(e.target.value)}
                  />
                  <button
                    className="btn btn-sm rainbow-fork text-lg"
                    onClick={() => setForkButtonStyle('rainbow')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      width="16"
                      height="16"
                    >
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
                    name="radio-1"
                    className="radio"
                    value="plain"
                    checked={forkButtonStyle === 'plain'}
                    onChange={(e) => setForkButtonStyle(e.target.value)}
                  />
                  <button
                    className="btn btn-sm plain-fork text-lg bg-transparent"
                    onClick={() => setForkButtonStyle('plain')}
                  >
                    <Icon name="fork" size={4} />
                  </button>
                </label>
              </div>
            </div>

            <div className="divider"></div>

            {/* Theme */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium mb-2">Theme</span>
              </label>
            </div>
          </div>

          {/* Privacy & Security */}
          {/*
          <div className="border border-base-300 rounded-lg p-6 bg-base-100">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Icon name="shield" size={5} />
              Privacy & Security
            </h2>
          </div>
          */}

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
                  <span className="text-base-content/60">Clear all cached data</span>
                </div>
                <button 
                  className="btn btn-outline btn-error"
                  onClick={handleClearAllCache}
                >
                  Clear All Cache
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

