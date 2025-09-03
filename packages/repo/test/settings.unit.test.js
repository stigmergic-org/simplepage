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

    describe('nested keys', () => {
      beforeEach(async () => {
        // Set up nested settings
        const nestedSettings = {
          theme: 'light',
          language: 'en',
          user: {
            preferences: {
              theme: 'dark',
              notifications: true
            },
            profile: {
              name: 'John Doe',
              email: 'john@example.com'
            }
          },
          api: {
            keys: {
              main: 'abc123',
              backup: 'def456'
            },
            endpoints: {
              base: 'https://api.example.com',
              version: 'v1'
            }
          }
        };
        await settings.write(nestedSettings);
      });

      it('should read nested properties with dot notation', async () => {
        expect(await settings.readProperty('user.preferences.theme')).toBe('dark');
        expect(await settings.readProperty('user.preferences.notifications')).toBe(true);
        expect(await settings.readProperty('user.profile.name')).toBe('John Doe');
        expect(await settings.readProperty('user.profile.email')).toBe('john@example.com');
        expect(await settings.readProperty('api.keys.main')).toBe('abc123');
        expect(await settings.readProperty('api.keys.backup')).toBe('def456');
        expect(await settings.readProperty('api.endpoints.base')).toBe('https://api.example.com');
        expect(await settings.readProperty('api.endpoints.version')).toBe('v1');
      });

      it('should return undefined for non-existent nested properties', async () => {
        expect(await settings.readProperty('user.preferences.nonexistent')).toBeUndefined();
        expect(await settings.readProperty('user.nonexistent.field')).toBeUndefined();
        expect(await settings.readProperty('nonexistent.field')).toBeUndefined();
        expect(await settings.readProperty('api.keys.nonexistent')).toBeUndefined();
      });

      it('should handle single-level keys (backward compatibility)', async () => {
        expect(await settings.readProperty('theme')).toBe('light');
        expect(await settings.readProperty('language')).toBe('en');
      });
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

    describe('nested keys', () => {
      it('should create nested structure when writing to non-existent path', async () => {
        await settings.writeProperty('user.preferences.theme', 'dark');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.user.preferences.theme).toBe('dark');
        expect(updatedSettings.theme).toBe('light'); // existing property preserved
        expect(updatedSettings.language).toBe('en'); // existing property preserved
      });

      it('should update existing nested properties', async () => {
        // First create nested structure
        await settings.writeProperty('user.preferences.theme', 'dark');
        await settings.writeProperty('user.preferences.notifications', true);
        
        // Then update existing nested property
        await settings.writeProperty('user.preferences.theme', 'light');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.user.preferences.theme).toBe('light');
        expect(updatedSettings.user.preferences.notifications).toBe(true);
      });

      it('should create multiple levels of nesting', async () => {
        await settings.writeProperty('api.keys.main', 'abc123');
        await settings.writeProperty('api.keys.backup', 'def456');
        await settings.writeProperty('api.endpoints.base', 'https://api.example.com');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.api.keys.main).toBe('abc123');
        expect(updatedSettings.api.keys.backup).toBe('def456');
        expect(updatedSettings.api.endpoints.base).toBe('https://api.example.com');
      });

      it('should preserve existing nested structure when adding new properties', async () => {
        // Create initial nested structure
        await settings.writeProperty('user.profile.name', 'John Doe');
        await settings.writeProperty('user.profile.email', 'john@example.com');
        
        // Add new property to existing nested structure
        await settings.writeProperty('user.profile.age', 30);
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.user.profile.name).toBe('John Doe');
        expect(updatedSettings.user.profile.email).toBe('john@example.com');
        expect(updatedSettings.user.profile.age).toBe(30);
      });

      it('should handle complex nested objects', async () => {
        const complexValue = {
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' }
          }
        };
        
        await settings.writeProperty('complex.data', complexValue);
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.complex.data).toEqual(complexValue);
      });

      it('should handle single-level keys (backward compatibility)', async () => {
        await settings.writeProperty('theme', 'dark');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.theme).toBe('dark');
        expect(updatedSettings.language).toBe('en'); // existing property preserved
      });

      it('should call write method with updated nested settings', async () => {
        const writeSpy = jest.spyOn(settings, 'write');
        
        await settings.writeProperty('user.preferences.theme', 'dark');
        
        const expectedSettings = {
          theme: 'light',
          language: 'en',
          user: {
            preferences: {
              theme: 'dark'
            }
          }
        };
        expect(writeSpy).toHaveBeenCalledWith(expectedSettings);
      });

      it('should work correctly with write() and read() methods integration', async () => {
        // First, write a complete nested object using write()
        const initialSettings = {
          theme: 'light',
          language: 'en',
          user: {
            profile: {
              name: 'John Doe',
              email: 'john@example.com',
              age: 30
            },
            preferences: {
              theme: 'dark',
              notifications: true,
              language: 'es'
            }
          },
          api: {
            keys: {
              main: 'abc123',
              backup: 'def456'
            },
            endpoints: {
              base: 'https://api.example.com',
              version: 'v1'
            }
          }
        };
        await settings.write(initialSettings);
        
        // Verify the initial state
        const initialRead = await settings.read();
        expect(initialRead).toEqual(initialSettings);
        
        // Now update specific nested properties using writeProperty()
        await settings.writeProperty('user.profile.name', 'Jane Smith');
        await settings.writeProperty('user.profile.age', 25);
        await settings.writeProperty('user.preferences.theme', 'light');
        await settings.writeProperty('api.keys.main', 'xyz789');
        await settings.writeProperty('api.endpoints.version', 'v2');
        await settings.writeProperty('new.nested.property', 'new value');
        
        // Read the complete object and verify all changes
        const finalRead = await settings.read();
        const expectedFinalSettings = {
          theme: 'light',
          language: 'en',
          user: {
            profile: {
              name: 'Jane Smith', // updated
              email: 'john@example.com', // unchanged
              age: 25 // updated
            },
            preferences: {
              theme: 'light', // updated
              notifications: true, // unchanged
              language: 'es' // unchanged
            }
          },
          api: {
            keys: {
              main: 'xyz789', // updated
              backup: 'def456' // unchanged
            },
            endpoints: {
              base: 'https://api.example.com', // unchanged
              version: 'v2' // updated
            }
          },
          new: {
            nested: {
              property: 'new value' // newly added
            }
          }
        };
        
        expect(finalRead).toEqual(expectedFinalSettings);
        
        // Verify individual properties can still be read correctly
        expect(await settings.readProperty('user.profile.name')).toBe('Jane Smith');
        expect(await settings.readProperty('user.profile.email')).toBe('john@example.com');
        expect(await settings.readProperty('user.preferences.theme')).toBe('light');
        expect(await settings.readProperty('api.keys.main')).toBe('xyz789');
        expect(await settings.readProperty('new.nested.property')).toBe('new value');
      });
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

    describe('nested keys', () => {
      beforeEach(async () => {
        // Set up nested settings
        const nestedSettings = {
          theme: 'light',
          language: 'en',
          user: {
            preferences: {
              theme: 'dark',
              notifications: true,
              language: 'es'
            },
            profile: {
              name: 'John Doe',
              email: 'john@example.com',
              age: 30
            }
          },
          api: {
            keys: {
              main: 'abc123',
              backup: 'def456'
            },
            endpoints: {
              base: 'https://api.example.com',
              version: 'v1'
            }
          }
        };
        await settings.write(nestedSettings);
      });

      it('should delete nested properties with dot notation', async () => {
        await settings.deleteProperty('user.preferences.notifications');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.user.preferences.notifications).toBeUndefined();
        expect(updatedSettings.user.preferences.theme).toBe('dark');
        expect(updatedSettings.user.preferences.language).toBe('es');
        expect(updatedSettings.user.profile.name).toBe('John Doe');
      });

      it('should delete deeply nested properties', async () => {
        await settings.deleteProperty('api.keys.backup');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.api.keys.backup).toBeUndefined();
        expect(updatedSettings.api.keys.main).toBe('abc123');
        expect(updatedSettings.api.endpoints.base).toBe('https://api.example.com');
      });

      it('should preserve other properties when deleting nested property', async () => {
        await settings.deleteProperty('user.profile.email');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.user.profile.email).toBeUndefined();
        expect(updatedSettings.user.profile.name).toBe('John Doe');
        expect(updatedSettings.user.profile.age).toBe(30);
        expect(updatedSettings.user.preferences.theme).toBe('dark');
        expect(updatedSettings.api.keys.main).toBe('abc123');
      });

      it('should handle deleting non-existent nested properties gracefully', async () => {
        await expect(settings.deleteProperty('user.preferences.nonexistent')).resolves.not.toThrow();
        await expect(settings.deleteProperty('user.nonexistent.field')).resolves.not.toThrow();
        await expect(settings.deleteProperty('nonexistent.field')).resolves.not.toThrow();
        
        const updatedSettings = await settings.read();
        // All original properties should still exist
        expect(updatedSettings.user.preferences.theme).toBe('dark');
        expect(updatedSettings.user.profile.name).toBe('John Doe');
        expect(updatedSettings.api.keys.main).toBe('abc123');
      });

      it('should handle deleting properties when intermediate path doesn\'t exist', async () => {
        await expect(settings.deleteProperty('nonexistent.field.value')).resolves.not.toThrow();
        await expect(settings.deleteProperty('user.nonexistent.field')).resolves.not.toThrow();
        
        const updatedSettings = await settings.read();
        // All original properties should still exist
        expect(updatedSettings.user.preferences.theme).toBe('dark');
        expect(updatedSettings.user.profile.name).toBe('John Doe');
      });

      it('should handle single-level keys (backward compatibility)', async () => {
        await settings.deleteProperty('theme');
        
        const updatedSettings = await settings.read();
        expect(updatedSettings.theme).toBeUndefined();
        expect(updatedSettings.language).toBe('en');
        expect(updatedSettings.user.preferences.theme).toBe('dark');
      });

      it('should call write method with updated nested settings', async () => {
        const writeSpy = jest.spyOn(settings, 'write');
        
        await settings.deleteProperty('user.preferences.notifications');
        
        const expectedSettings = {
          theme: 'light',
          language: 'en',
          user: {
            preferences: {
              theme: 'dark',
              language: 'es'
            },
            profile: {
              name: 'John Doe',
              email: 'john@example.com',
              age: 30
            }
          },
          api: {
            keys: {
              main: 'abc123',
              backup: 'def456'
            },
            endpoints: {
              base: 'https://api.example.com',
              version: 'v1'
            }
          }
        };
        expect(writeSpy).toHaveBeenCalledWith(expectedSettings);
      });
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

  describe('Nested keys validation', () => {
    beforeEach(async () => {
      await settings.unsafeSetRepoRoot(repoRootCid);
    });

    it('should throw error for keys starting with dots', async () => {
      await expect(settings.readProperty('.hidden')).rejects.toThrow('Key cannot start with a dot');
      await expect(settings.writeProperty('.hidden', 'value')).rejects.toThrow('Key cannot start with a dot');
      await expect(settings.deleteProperty('.hidden')).rejects.toThrow('Key cannot start with a dot');
    });

    it('should throw error for keys ending with dots', async () => {
      await expect(settings.readProperty('trailing.')).rejects.toThrow('Key cannot end with a dot');
      await expect(settings.writeProperty('trailing.', 'value')).rejects.toThrow('Key cannot end with a dot');
      await expect(settings.deleteProperty('trailing.')).rejects.toThrow('Key cannot end with a dot');
    });

    it('should throw error for keys with consecutive dots', async () => {
      await expect(settings.readProperty('user..profile')).rejects.toThrow('Key cannot contain consecutive dots');
      await expect(settings.writeProperty('user..profile', 'value')).rejects.toThrow('Key cannot contain consecutive dots');
      await expect(settings.deleteProperty('user..profile')).rejects.toThrow('Key cannot contain consecutive dots');
    });

    it('should throw error for keys with only dots', async () => {
      await expect(settings.readProperty('...')).rejects.toThrow('Key cannot start with a dot');
      await expect(settings.writeProperty('...', 'value')).rejects.toThrow('Key cannot start with a dot');
      await expect(settings.deleteProperty('...')).rejects.toThrow('Key cannot start with a dot');
    });

    it('should throw error for non-string keys', async () => {
      await expect(settings.readProperty(null)).rejects.toThrow('Key must be a string');
      await expect(settings.readProperty(undefined)).rejects.toThrow('Key must be a string');
      await expect(settings.readProperty(123)).rejects.toThrow('Key must be a string');
      await expect(settings.readProperty({})).rejects.toThrow('Key must be a string');
    });

    it('should handle very deep nesting with valid keys', async () => {
      const deepKey = 'level1.level2.level3.level4.level5.level6.level7.level8.level9.level10';
      await settings.writeProperty(deepKey, 'deep value');
      
      const result = await settings.readProperty(deepKey);
      expect(result).toBe('deep value');
    });

    it('should handle overwriting objects with primitives', async () => {
      // First create a nested object
      await settings.writeProperty('user.preferences', { theme: 'dark' });
      expect(await settings.readProperty('user.preferences.theme')).toBe('dark');
      
      // Then overwrite with a primitive
      await settings.writeProperty('user.preferences', 'simple string');
      expect(await settings.readProperty('user.preferences')).toBe('simple string');
      expect(await settings.readProperty('user.preferences.theme')).toBeUndefined();
    });

    it('should handle overwriting primitives with objects', async () => {
      // First set a primitive
      await settings.writeProperty('user.preferences', 'simple string');
      expect(await settings.readProperty('user.preferences')).toBe('simple string');
      
      // Then overwrite with an object
      await settings.writeProperty('user.preferences.theme', { name: 'dark' });
      expect(await settings.readProperty('user.preferences.theme')).toEqual({ name: 'dark' });
    });
  });

  describe('Constants', () => {
    it('should export SETTINGS_FILE constant', () => {
      expect(SETTINGS_FILE).toBe('settings.json');
    });
  });
});
