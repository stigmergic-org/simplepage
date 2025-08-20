import { jest } from '@jest/globals'
import { CID } from 'multiformats/cid'
import { emptyUnixfs, ls } from '@simplepg/common'
import { Settings, SETTINGS_FILE } from '../src/settings.js'

// Mock storage for testing
class MockStorage {
  constructor() {
    this.store = new Map();
    return new Proxy(this, {
      ownKeys: () => [...this.store.keys()],
      getOwnPropertyDescriptor: (target, prop) => {
        return {
          enumerable: true,
          configurable: true,
          value: this.store.get(prop)
        };
      }
    });
  }

  getItem(key) {
    return this.store.get(key) || null;
  }

  setItem(key, value) {
    this.store.set(key, value);
  }

  removeItem(key) {
    this.store.delete(key);
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return Array.from(this.store.keys())[index];
  }

  clear() {
    this.store.clear();
  }
}

describe('Settings Unit Tests', () => {
  let settings;
  let fs;
  let blockstore;
  let mockStorage;
  let mockEnsureRepoData;
  let repoRootCid;
  let settingsCid;

  beforeEach(async () => {
    // Create actual filesystem
    ({ fs, blockstore } = emptyUnixfs());
    
    // Create a real repository root with settings.json file
    const emptyDir = await fs.addDirectory();
    const testSettings = { theme: 'light', language: 'en' };
    const settingsBytes = await fs.addBytes(new TextEncoder().encode(JSON.stringify(testSettings)));
    
    // Add settings.json to repo root
    repoRootCid = await fs.cp(settingsBytes, emptyDir, 'settings.json');
    settingsCid = settingsBytes;
    
    // Mock ensureRepoData function
    mockEnsureRepoData = jest.fn().mockResolvedValue(undefined);
    
    // Mock storage
    mockStorage = new MockStorage();
    
    settings = new Settings(fs, blockstore, mockEnsureRepoData, mockStorage);
  });

  afterEach(async () => {
    mockStorage.clear();
  });

  describe('Constructor', () => {
    it('should create Settings instance', () => {
      expect(settings).toBeInstanceOf(Settings);
    });
  });

  describe('unsafeSetRepoRoot', () => {
    it('should set persistedCid when settings file exists', async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
      
      // Test that we can read the settings after initialization
      const result = await settings.read();
      expect(result).toEqual({ theme: 'light', language: 'en' });
    });

    it('should create default settings when no settings file exists', async () => {
      const emptyRoot = await fs.addDirectory();

      await settings.unsafeSetRepoRoot(emptyRoot);
      const result = await settings.read();
      expect(result).toEqual({});
      
      expect(true).toBe(true); // Placeholder test
    });
  });

  describe('read', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should read and parse settings JSON', async () => {
      const result = await settings.read();
      
      expect(result).toEqual({ theme: 'light', language: 'en' });
    });

    it('should return empty object when no settings exist', async () => {
      const emptyRoot = await fs.addDirectory();
      await settings.unsafeSetRepoRoot(emptyRoot);
      
      const result = await settings.read();
      
      expect(result).toEqual({});
    });
  });

  describe('readProperty', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should read specific property from settings', async () => {
      const result = await settings.readProperty('theme');
      
      expect(result).toBe('light');
    });

    it('should return undefined for non-existent property', async () => {
      const result = await settings.readProperty('nonexistent');
      
      expect(result).toBeUndefined();
    });
  });

  describe('writeProperty', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should write property to existing settings', async () => {
      await settings.writeProperty('theme', 'dark');
      
      const updatedSettings = await settings.read();
      expect(updatedSettings.theme).toBe('dark');
      expect(updatedSettings.language).toBe('en'); // existing property preserved
    });

    it('should add new property to settings', async () => {
      await settings.writeProperty('notifications', true);
      
      const updatedSettings = await settings.read();
      expect(updatedSettings.notifications).toBe(true);
      expect(updatedSettings.theme).toBe('light'); // existing property preserved
    });

    it('should call write method with updated settings', async () => {
      const writeSpy = jest.spyOn(settings, 'write');
      
      await settings.writeProperty('theme', 'dark');
      
      expect(writeSpy).toHaveBeenCalledWith({ theme: 'dark', language: 'en' });
    });
  });

  describe('write', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should write entire settings object', async () => {
      const testSettings = { theme: 'dark', language: 'en', notifications: true };
      
      await settings.write(testSettings);
      
      const result = await settings.read();
      expect(result).toEqual(testSettings);
    });

    it('should update changeCid after writing', async () => {
      const testSettings = { theme: 'dark' };
      
      // Before writing, no changes
      expect(await settings.hasChanges()).toBe(false);
      
      await settings.write(testSettings);
      
      // After writing, there should be changes
      expect(await settings.hasChanges()).toBe(true);
    });
  });

  describe('deleteProperty', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should delete existing property', async () => {
      await settings.deleteProperty('language');
      
      const updatedSettings = await settings.read();
      expect(updatedSettings.language).toBeUndefined();
      expect(updatedSettings.theme).toBe('light');
    });

    it('should call write method with updated settings', async () => {
      const writeSpy = jest.spyOn(settings, 'write');
      
      await settings.deleteProperty('language');
      
      expect(writeSpy).toHaveBeenCalledWith({ theme: 'light' });
    });

    it('should handle deleting non-existent property gracefully', async () => {
      await expect(settings.deleteProperty('nonexistent')).resolves.not.toThrow();
      
      const updatedSettings = await settings.read();
      expect(updatedSettings).toEqual({ theme: 'light', language: 'en' });
    });
  });

  describe('hasChanges', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should return false when no changes', async () => {
      const result = await settings.hasChanges();
      expect(result).toBe(false);
    });

    it('should return true when changes exist', async () => {
      const testSettings = { theme: 'dark' };
      await settings.write(testSettings);
      
      const result = await settings.hasChanges();
      expect(result).toBe(true);
    });
  });

  describe('restore', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should restore settings to persisted state', async () => {
      // Make some changes
      await settings.write({ theme: 'dark', language: 'en', notifications: true });
      expect(await settings.hasChanges()).toBe(true);
      
      // Restore
      await settings.restore();
      
      expect(await settings.hasChanges()).toBe(false);
      const restoredSettings = await settings.read();
      expect(restoredSettings).toEqual({ theme: 'light', language: 'en' });
    });
  });

  describe('stage', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should return current changeCid', async () => {
      const result = await settings.stage();
      expect(result).toBeInstanceOf(CID);
    });
  });

  describe('finalizeCommit', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should update persistedCid and changeCid', async () => {
      // Create a new settings file with the same content as the original
      const newSettings = { theme: 'light', language: 'en' };
      const newCid = await fs.addBytes(new TextEncoder().encode(JSON.stringify(newSettings)));
      
      await settings.finalizeCommit(newCid);
      
      // Test that we can still read settings after finalize
      const result = await settings.read();
      expect(result).toEqual({ theme: 'light', language: 'en' });
      
      // Test that there are no changes after finalize
      expect(await settings.hasChanges()).toBe(false);
    });
  });

  describe('clearChanges', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should clear all changes', async () => {
      // Make some changes
      await settings.write({ theme: 'dark' });
      expect(await settings.hasChanges()).toBe(true);
      
      // Clear changes
      await settings.clearChanges();
      
      expect(await settings.hasChanges()).toBe(false);
    });

    it('should call restore method', async () => {
      const restoreSpy = jest.spyOn(settings, 'restore');
      
      await settings.clearChanges();
      
      expect(restoreSpy).toHaveBeenCalled();
    });
  });

  describe('isOutdated', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should return false when no stored changes', async () => {
      const result = await settings.isOutdated();
      expect(result).toBe(false);
    });

    it('should return true when stored changes are outdated', async () => {
      const oldCid = await fs.addBytes(new TextEncoder().encode('{"old": "settings"}'));
      const newCid = await fs.addBytes(new TextEncoder().encode('{"new": "settings"}'));
      
      // Store old change data
      mockStorage.setItem('spg_settings_change_root', JSON.stringify({
        persistedCid: oldCid.toString(),
        changeCid: oldCid.toString()
      }));
      
      // Set current persistedCid to new value
      await settings.unsafeSetRepoRoot(newCid);
      
      const result = await settings.isOutdated();
      expect(result).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw error when calling methods before initialization', async () => {
      await expect(settings.read()).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.write({})).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.readProperty('test')).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.writeProperty('test', 'value')).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.deleteProperty('test')).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.hasChanges()).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.restore()).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.stage()).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      const testCid = await fs.addBytes(new TextEncoder().encode('{"test": "value"}'));
      await expect(settings.finalizeCommit(testCid)).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
      await expect(settings.clearChanges()).rejects.toThrow('Root not set. Call unsafeSetRepoRoot() first.');
    });
  });

  describe('Constants', () => {
    it('should export SETTINGS_FILE constant', () => {
      expect(SETTINGS_FILE).toBe('settings.json');
    });
  });
});
