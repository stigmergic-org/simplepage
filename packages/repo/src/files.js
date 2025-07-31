import { get, set, del, keys } from 'idb-keyval'
import { concat } from 'uint8arrays/concat'
import all from 'it-all'

import { tree as treeFiles, addFile, rm, ls, assert, getChildCids } from '@simplepg/common'
import { CHANGE_TYPE } from './constants.js'

export const FILES_ROOT = '_files'

const STORAGE_PREFIX = 'spg_files_'

/**
 * A class for managing file operations in a SimplePage repository.
 * Provides methods for listing, adding, and removing files with staging support.
 *
 * @param {object} fs - The unixfs filesystem instance.
 * @param {object} blockstore - The blockstore instance.
 * @param {function} ensureRepoData - A function to ensure the repo data is loaded.
 */
export class Files {
  #ensureRepoData
  #blockstore
  #fs
  #root
  #dservice

  constructor(fs, blockstore, dservice, ensureRepoData) {
    this.#fs = fs
    this.#blockstore = blockstore
    this.#dservice = dservice
    this.#ensureRepoData = ensureRepoData
    this.#root = null
  }

  /**
   * Sets the repo root CID for file operations.
   * @param {CID} root - The root CID to use for file operations.
   */
  async unsafeSetRepoRoot(root) {
    // Check if /_files exists in the root
    try {
      const refs = await ls(this.#blockstore, root)
      const filesDir = refs.find(([name]) => name === FILES_ROOT)
      this.#root = filesDir[1]
      console.log('root', this.#root)
    } catch (err) {
      console.log('err', err)
      // Create empty directory if it doesn't exist
      const emptyDir = await this.#fs.addDirectory()
      this.#root = emptyDir
    }
  }

  /**
   * Gets a change from IndexedDB.
   * @param {string} path - The file path.
   * @returns {Promise<object|null>} The change data or null if not found.
   */
  async #getChange(path) {
    const key = `${STORAGE_PREFIX}${path}`
    const data = await get(key)
    if (data) {
      if (!this.#root || data.root === this.#root.toString()) {
        return data
      }
    }
    return null
  }

  /**
   * Sets a change in IndexedDB.
   * @param {string} path - The file path.
   * @param {object} changeData - The change data to store.
   */
  async #setChange(path, changeData) {
    const key = `${STORAGE_PREFIX}${path}`
    await set(key, {
      ...changeData,
      root: this.#root.toString()
    })
  }

  /**
   * Removes a change from IndexedDB.
   * @param {string} path - The file path.
   */
  async #removeChange(path) {
    const key = `${STORAGE_PREFIX}${path}`
    await del(key)
  }

  /**
   * Checks if a file exists in the filesystem.
   * @param {string} path - The file path.
   * @returns {Promise<[string, CID] | undefined>} The file entry [name, CID] if found, undefined if not found.
   */
  async #fileExists(path) {
    if (path.startsWith('/')) {
      path = path.slice(1)
    }
    const split = path.split('/')
    let ref = ['', this.#root]
    for (const path of split) {
      const refs = await ls(this.#blockstore, ref[1])
      ref = refs.find(f => f[0] === path)
      if (!ref) return undefined
    }
    return ref
  }

  async #isReady() {
    if (!this.#root) {
      throw new Error('Root not set. Call unsafeSetRoot() first.')
    }
    await this.#ensureRepoData()
  }

  /**
   * Lists all files in the filesystem, including staged changes.
   * @returns {Promise<{ path: string, type?: string }[]>} Array of file objects with path and optional type.
   */
  async tree() {
    await this.#isReady()
    const files = await treeFiles(this.#blockstore, this.#root)

    // Get staged changes
    const changes = await this.#getChanges()
    const stagedFiles = changes.map(change => ({ path: change.path, type: change.type }))

    // Combine files from filesystem and staged changes
    const allFiles = new Map()

    // Add filesystem files (no type means they're from filesystem)
    for (const path of files) {
      allFiles.set(path, { path })
    }

    // Add or update with staged changes
    for (const stagedFile of stagedFiles) {
      allFiles.set(stagedFile.path, stagedFile)
    }

    return Array.from(allFiles.values())
  }

  /**
   * Adds a file to the staging area.
   * @param {string} path - The path where to add the file.
   * @param {Uint8Array} content - The file content as a Uint8Array.
   * @returns {Promise<void>} Resolves when the file is staged.
   */
  async add(path, content) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`
    const type = await this.#fileExists(path) ? CHANGE_TYPE.EDIT : CHANGE_TYPE.NEW
    await this.#setChange(path, {
      content,
      type
    })
  }

  /**
   * Removes a file from the staging area or filesystem.
   * @param {string} path - The path of the file to remove.
   * @returns {Promise<void>} Resolves when the file is staged for deletion or removed.
   */
  async rm(path) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`
    if (await this.#fileExists(path)) {
      await this.#setChange(path, {
        type: CHANGE_TYPE.DELETE
      })
    } else {
      await this.#removeChange(path)
    }
  }

  /**
   * Reads the content of a file from the staging area or filesystem.
   * @param {string} path - The path of the file to read.
   * @returns {Promise<Uint8Array>} The file content as a Uint8Array.
   */
  async cat(path) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`

    // Check for staged changes first
    const change = await this.#getChange(path)
    if (change && change.content) {
      return change.content
    }
    try {
      return concat(await all(this.#fs.cat(this.#root, { path })))
    } catch (err) {
      const fileRef = await this.#fileExists(path)
      assert(Boolean(fileRef), `File not found: ${path}`)
      const [_, cid] = fileRef
      const response = await this.#dservice.fetch(`/file?cid=${cid.toString()}`)
      if (response.status === 200) {
        const content = new Uint8Array(await response.arrayBuffer())
        await this.#blockstore.put(cid, content)
        return content
      }
      throw new Error('Failed to fetch file from dservice')
    }
  }

  /**
   * Returns a list of all paths with unstaged changes.
   * @returns {Promise<{ path: string, type: string }[]>} The list of paths with unstaged changes.
   */
  async #getChanges() {
    await this.#isReady()
    const changes = []
    const allKeys = await keys()
    const changeKeys = allKeys.filter(key => key.startsWith(STORAGE_PREFIX))

    for (const key of changeKeys) {
      const path = key.replace(STORAGE_PREFIX, '')
      const data = await get(key)
      if (data) {
        if (data.root === this.#root.toString()) {
          changes.push({
            path,
            type: data.type
          })
        }
      }
    }

    return changes
  }

  /**
   * Stages all changes and returns a new CID of the updated filesystem root.
   * @returns {Promise<{ cid: CID, unchangedCids: CidSet }>} The CID of the new root after staging changes.
   */
  async stage() {
    await this.#isReady()
    const changes = await this.#getChanges()
    let newRoot = this.#root

    for (const { path, type } of changes) {
      switch (type) {
        case CHANGE_TYPE.DELETE:
          newRoot = await rm(this.#fs, newRoot, path)
          break
        case CHANGE_TYPE.EDIT:
        case CHANGE_TYPE.NEW:
          const change = await this.#getChange(path)
          assert(change?.content, 'Change must have content')
          newRoot = await addFile(this.#fs, newRoot, path, change.content)
          break
      }
    }
    const unchangedCids = await getChildCids(this.#blockstore, this.#root)
    return { cid: newRoot, unchangedCids }
  }

  /**
   * Finalizes a commit.
   * Clears out all edits and updates the repo state.
   * @param {string} cid - The CID of the new repo root.
   */
  async finalizeCommit(cid) {
    await this.#isReady()
    this.#root = cid
    const allKeys = await keys()
    const changeKeys = allKeys.filter(key =>
      typeof key === 'string' && key.startsWith(STORAGE_PREFIX)
    )
    for (const key of changeKeys) {
      await del(key)
    }
  }

  /**
   * Clears all staged changes.
   */
  async clearChanges() {
    await this.#isReady()
    const allKeys = await keys()
    const changeKeys = allKeys.filter(key => key.startsWith(STORAGE_PREFIX))
    for (const key of changeKeys) {
      await del(key)
    }
  }

  /**
   * Restores a staged change.
   * @param {string} path - The path of the file to restore.
   */
  async restore(path) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`
    await this.#removeChange(path)
  }
}