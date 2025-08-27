// packages/repo/src/settings.js

// (Original imports preserved)
import { concat } from 'uint8arrays/concat'
import all from 'it-all'
import { CID } from 'multiformats/cid'

import { addFile, rm, ls, assert, CidSet, cp } from '@simplepg/common'

// (Original filename preserved so repo.js cp(...) remains correct)
export const SETTINGS_FILE = 'settings.json'

// (Original storage key preserved)
const CHANGE_ROOT_KEY = 'spg_settings_change_root'

/* -------------------------------------------------------------------------- */
/*                                ADDED (NEW)                                 */
/*  Default settings + helpers to migrate legacy single `appearance.theme`    */
/*  into the new dual-theme shape (themeLight/themeDark) and to support a     */
/*  structured diff [{path,from,to}] that the Publish page can format nicely. */
/* -------------------------------------------------------------------------- */

// ADDED: exported defaults (used by callers/UI and for safe reads)
export const DEFAULT_SETTINGS = {
  appearance: {
    forkStyle: 'rainbow',
    // dual-theme shape used by Settings UI (follow system: light/dark)
    themeLight: 'light',
    themeDark: 'dark',
  },
}

// ADDED: shallow-ish deepMerge for small settings trees
function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base }
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base?.[k] ?? {}, v)
    } else {
      out[k] = v
    }
  }
  return out
}

// ADDED: migrate older single-theme shape -> dual themes
function migrateAppearanceShape(s) {
  if (!s || !s.appearance) return s
  const a = s.appearance
  // If legacy `appearance.theme` exists and dual-theme keys are missing, fill them
  if ('theme' in a && (!('themeLight' in a) || !('themeDark' in a))) {
    return {
      ...s,
      appearance: {
        ...a,
        themeLight: a.themeLight ?? a.theme ?? 'light',
        // if old theme was "dark", keep dark; otherwise still give a dark theme default
        themeDark:  a.themeDark  ?? (a.theme === 'dark' ? 'dark' : 'dark'),
      },
    }
  }
  return s
}

// ADDED: structured diff for better UX on Publish screen
function diffSettings(a, b, prefix = '') {
  const changes = []
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
  for (const k of keys) {
    const pa = a?.[k]
    const pb = b?.[k]
    const path = prefix ? `${prefix}.${k}` : k
    const bothObjs =
      pa && pb &&
      typeof pa === 'object' && typeof pb === 'object' &&
      !Array.isArray(pa) && !Array.isArray(pb)

    if (bothObjs) {
      changes.push(...diffSettings(pa, pb, path))
    } else if (JSON.stringify(pa) !== JSON.stringify(pb)) {
      changes.push({ path, from: pa, to: pb })
    }
  }
  return changes
}

/* ------------------------------ END ADDED --------------------------------- */


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
    // (Original behavior) If missing, seed an empty object as file content.
    this.#persistedCid = settingsCid || (await this.#writeJson({}))
    await this.#initializeChangeCid()
  }

  /**
   * Initializes the changeCid from storage or creates a new one.
   */
  async #initializeChangeCid() {
    const storedChangeCid = this.#storage.getItem(CHANGE_ROOT_KEY)
    if (storedChangeCid) {
      try {
        const parsed = JSON.parse(storedChangeCid)
        const changeCid = CID.parse(parsed.changeCid)
        this.#changeCid = changeCid
        return
      } catch {
        // ignore parse errors and fall through
      }
    }
    this.#changeCid = this.#persistedCid
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
   *
   * NOTE (ADDED): We return a migrated + default-merged view so callers
   * always see dual-theme keys and sensible defaults. The underlying file
   * remains whatever was staged (we do not auto-write defaults here).
   */
  async read() {
    await this.#isReady()
    const content = await this.#cat()
    const raw = JSON.parse(new TextDecoder().decode(content) || '{}')
    const migrated = migrateAppearanceShape(raw) || {}
    const merged = deepMerge(DEFAULT_SETTINGS, migrated)
    return merged
  }

  /**
   * Reads a specific top-level property from settings.
   * @param {string} key - The property key to read.
   * @returns {Promise<any>} The property value, or undefined if not found.
   *
   * NOTE (unchanged): Reads from the merged view returned by read().
   */
  async readProperty(key) {
    const settings = await this.read()
    return settings[key]
  }

  /**
   * Writes a specific top-level property to settings.
   * @param {string} key - The property key to write.
   * @param {any} value - The property value to write.
   *
   * NOTE (unchanged core behavior): We edit the staged JSON and update #changeCid.
   * We intentionally DO NOT inject defaults here; the UI should pass the full object
   * if it wants defaults persisted.
   */
  async writeProperty(key, value) {
    await this.#isReady()
    
    const rawStaged = JSON.parse(new TextDecoder().decode(await this.#cat(false)) || '{}')
    rawStaged[key] = value
    
    return this.write(rawStaged)
  }

  /**
   * Writes the entire settings object.
   * @param {object} settings - The settings object to write.
   *
   * NOTE (unchanged): Caller should pass what they want persisted. This keeps
   * B's behavior and avoids silently baking defaults into the file.
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
   * Deletes a specific top-level property from settings.
   * @param {string} key - The property key to delete.
   */
  async deleteProperty(key) {
    await this.#isReady()
    
    const rawStaged = JSON.parse(new TextDecoder().decode(await this.#cat(false)) || '{}')
    delete rawStaged[key]
    
    return this.write(rawStaged)
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
   * Returns an array representing the changes to the settings
   * based on the persisted and change CIDs.
   * @returns {Promise<Array<string|{path:string,from:any,to:any}>>} The change diff.
   *
   * NOTE (ADDED): We return a structured diff [{path, from, to}] using a
   * migrated + default-merged view for human-friendly display. Your Publish
   * page already handles objects nicely; if you still need strings you can map
   * them externally.
   */
  async changeDiff() {
    await this.#isReady()
    const persisted = await this.#cat(true)
    const change = await this.#cat()
    const persistedJson = JSON.parse(new TextDecoder().decode(persisted) || '{}')
    const changeJson = JSON.parse(new TextDecoder().decode(change) || '{}')

    // Normalize both sides so diffs include dual-theme keys consistently
    const persistedNorm = deepMerge(DEFAULT_SETTINGS, migrateAppearanceShape(persistedJson) || {})
    const changeNorm    = deepMerge(DEFAULT_SETTINGS, migrateAppearanceShape(changeJson) || {})

    return diffSettings(persistedNorm, changeNorm)
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