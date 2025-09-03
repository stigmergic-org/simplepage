import { concat } from 'uint8arrays/concat'
import all from 'it-all'
import { CID } from 'multiformats/cid'

import { ls, assert } from '@simplepg/common'

export const SETTINGS_FILE = 'settings.json'

const CHANGE_ROOT_KEY = 'spg_settings_change_root'

/**
 * Validates a dot notation key and throws an error if invalid.
 * @param {string} key - The key to validate.
 * @throws {Error} If the key contains invalid dot notation patterns.
 */
function validateDotNotation(key) {
  assert(typeof key === 'string', 'Key must be a string');
  assert(!key.startsWith('.'), 'Key cannot start with a dot');
  assert(!key.endsWith('.'), 'Key cannot end with a dot');
  assert(!key.includes('..'), 'Key cannot contain consecutive dots');
  
  // Check for empty segments (which would result from consecutive dots or leading/trailing dots)
  const segments = key.split('.');
  assert(!segments.some(segment => segment === ''), 'Key cannot contain empty segments');
}

/**
 * A class for managing settings in a SimplePage repository.
 * Provides methods for reading and writing a single settings.json file
 * with staging support for top-level properties.
 *
 * @param {object} fs - The unixfs filesystem instance.
 * @param {object} blockstore - The blockstore instance.
 * @param {function} ensureRepoData - A function to ensure the repo data is loaded.
 * @param {object} storage - The storage object for persisting change state.
 */
export class Settings {
  #ensureRepoData
  #blockstore
  #fs
  #persistedCid
  #changeCid
  #storage

  constructor(fs, blockstore, ensureRepoData, storage) {
    this.#fs = fs
    this.#blockstore = blockstore
    this.#ensureRepoData = ensureRepoData
    this.#storage = storage
    this.#persistedCid = null
    this.#changeCid = null
  }

  /**
   * Sets the repo root CID for settings operations.
   * @param {CID} root - The root CID to use for settings operations.
   */
  async unsafeSetRepoRoot(root) {
    const refs = await ls(this.#blockstore, root)
    const settingsCid = refs.find(([name]) => name === SETTINGS_FILE)?.[1]
    this.#persistedCid = settingsCid || (await this.#writeJson({}))
    await this.#initializeChangeCid()
  }

  /**
   * Initializes the changeCid from storage or creates a new one.
   */
  async #initializeChangeCid() {
    const storedChangeCid = this.#storage.getItem(CHANGE_ROOT_KEY)
    if (storedChangeCid) {
      const parsed = JSON.parse(storedChangeCid)
      const changeCid = CID.parse(parsed.changeCid)
      this.#changeCid = changeCid
    } else {
      this.#changeCid = this.#persistedCid
    }
  }

  /**
   * Returns true if the settings changes are based on an old repo persistedCid.
   * @returns {boolean} Whether the settings changes are based on an old repo persistedCid.
   */
  async isOutdated() {
    await this.#isReady()
    const storedChangeRoot = this.#storage.getItem(CHANGE_ROOT_KEY)
    if (!storedChangeRoot) {
      return false
    }
    const parsed = JSON.parse(storedChangeRoot)
    return parsed.persistedCid !== this.#persistedCid.toString() && parsed.changeCid !== this.#persistedCid.toString()
  }

  /**
   * Saves the changeCid to storage.
   */
  async #setChangeCid(changeCid) {
    this.#changeCid = changeCid
    await this.#storage.setItem(CHANGE_ROOT_KEY, JSON.stringify({
      persistedCid: this.#persistedCid.toString(),
      changeCid: changeCid.toString()
    }))
  }

  /**
   * Reads the entire settings object from the current change root.
   * @returns {Promise<object>} The settings object.
   */
  async read() {
    await this.#isReady()
    
    const content = await this.#cat()
    return JSON.parse(new TextDecoder().decode(content))
  }

  /**
   * Reads a specific property from settings, supporting nested keys with dot notation.
   * @param {string} key - The property key to read (supports dot notation for nested properties).
   * @returns {Promise<any>} The property value, or undefined if not found.
   */
  async readProperty(key) {
    validateDotNotation(key)
    const settings = await this.read()
    return key.split('.').reduce((current, k) => {
      return current && current[k] !== undefined ? current[k] : undefined
    }, settings)
  }

  /**
   * Writes a specific property to settings, supporting nested keys with dot notation.
   * @param {string} key - The property key to write (supports dot notation for nested properties).
   * @param {any} value - The property value to write.
   */
  async writeProperty(key, value) {
    validateDotNotation(key)
    await this.#isReady()
    
    const settings = await this.read()
    const keys = key.split('.')
    const lastKey = keys.pop()
    const target = keys.reduce((current, k) => {
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {}
      }
      return current[k]
    }, settings)
    target[lastKey] = value
    
    return this.write(settings)
  }

  /**
   * Writes the entire settings object.
   * @param {object} settings - The settings object to write.
   */
  async write(settings) {
    await this.#isReady()
    
    const cid = await this.#writeJson(settings)
    await this.#setChangeCid(cid)
  }

  async #writeJson(json) {
    const jsonString = JSON.stringify(json, null, 2)
    const content = new TextEncoder().encode(jsonString)
    return this.#fs.addBytes(content)
  }

  /**
   * Deletes a specific property from settings, supporting nested keys with dot notation.
   * @param {string} key - The property key to delete (supports dot notation for nested properties).
   */
  async deleteProperty(key) {
    validateDotNotation(key)
    await this.#isReady()
    
    const settings = await this.read()
    const keys = key.split('.')
    const lastKey = keys.pop()
    const target = keys.reduce((current, k) => {
      return current && current[k] ? current[k] : null
    }, settings)
    
    if (target && target.hasOwnProperty(lastKey)) {
      delete target[lastKey]
    }
    
    return this.write(settings)
  }

  /**
   * Reads the content of the settings file from the change root.
   * @returns {Promise<Uint8Array>} The file content as a Uint8Array.
   */
  async #cat(persisted = false) {
    await this.#isReady()
    return concat(await all(this.#fs.cat(persisted ? this.#persistedCid : this.#changeCid)))
  }

  /**
   * Checks if there are any changes to the settings.
   * @returns {Promise<boolean>} Whether there are changes.
   */
  async hasChanges() {
    await this.#isReady()
    return !this.#changeCid.equals(this.#persistedCid)
  }

  /**
   * Returns an array of strings representing the changes to the settings.
   * based on the persisted and change CIDs.
   * @returns {Promise<string[]>} The change diff.
   */
  async changeDiff() {
    await this.#isReady()
    const persisted = await this.#cat(true)
    const change = await this.#cat()
    const persistedJson = JSON.parse(new TextDecoder().decode(persisted))
    const changeJson = JSON.parse(new TextDecoder().decode(change))

    const compareValues = (persistedVal, changeVal, path = '') => {
      if (persistedVal === changeVal) return []

      if (typeof persistedVal === 'object' && typeof changeVal === 'object' && 
        persistedVal !== null && changeVal !== null) {
        const diffs = []
        const allKeys = new Set([...Object.keys(persistedVal), ...Object.keys(changeVal)])
        
        for (const key of allKeys) {
          const newPath = path ? `${path}.${key}` : key
          diffs.push(...compareValues(persistedVal[key], changeVal[key], newPath))
        }
        return diffs
      } else if (persistedVal === undefined) {
        if (typeof changeVal === 'object' && changeVal !== null) {
          return compareValues({}, changeVal, path)
        } else {
          return [`${path}: ${JSON.stringify(changeVal)} (added)`]
        }
      } else if (changeVal === undefined) {
        if (typeof persistedVal === 'object' && persistedVal !== null) {
          return compareValues(persistedVal, {}, path)
        } else {
          return [`${path}: ${JSON.stringify(persistedVal)} (removed)`]
        }
      }

      return [`${path}: ${JSON.stringify(persistedVal)} -> ${JSON.stringify(changeVal)}`]
    }

    return compareValues(persistedJson, changeJson)
  }

  /**
   * Restores the settings to their committed state.
   */
  async restore() {
    await this.#isReady()
    await this.#setChangeCid(this.#persistedCid)
  }

  /**
   * Stages all changes and returns a new CID of the updated root.
   * @returns {Promise<CID>} The CID of the new root after staging changes.
   */
  async stage() {
    await this.#isReady()
    return this.#changeCid
  }

  /**
   * Finalizes a commit.
   * Clears out all changes and updates the settings state.
   * @param {CID} cid - The CID of the new repo root.
   */
  async finalizeCommit(cid) {
    await this.#isReady()
    this.#persistedCid = cid
    await this.#setChangeCid(cid)
  }

  /**
   * Clears all staged changes.
   */
  async clearChanges() {
    await this.restore()
  }

  /**
   * Ensures the settings instance is ready for operations.
   */
  async #isReady() {
    await this.#ensureRepoData()
    if (!this.#persistedCid) {
      throw new Error('Root not set. Call unsafeSetRepoRoot() first.')
    }
  }
}
