import { concat } from 'uint8arrays/concat'
import { code as dagPbCode } from '@ipld/dag-pb'
import all from 'it-all'
import { CID } from 'multiformats/cid'

import { addFile, rm, ls, lsFull, assert, getChildCids, cp } from '@simplepg/common'
import { CHANGE_TYPE } from './constants.js'

export const FILES_ROOT = '_files'

const CHANGE_ROOT_KEY = 'spg_files_change_root'

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
  #changeRoot
  #dservice
  #storage

  constructor(fs, blockstore, dservice, ensureRepoData, storage) {
    this.#fs = fs
    this.#blockstore = blockstore
    this.#dservice = dservice
    this.#ensureRepoData = ensureRepoData
    this.#storage = storage
    this.#root = null
    this.#changeRoot = null
  }

  /**
   * Sets the repo root CID for file operations.
   * @param {CID} root - The root CID to use for file operations.
   */
  async unsafeSetRepoRoot(root) {
    // Check if /_files exists in the root
    const refs = await ls(this.#blockstore, root)
    const filesCid = refs.find(([name]) => name === FILES_ROOT)?.[1]
    this.#root = filesCid || (await this.#fs.addDirectory())
    await this.#initializeChangeRoot()
  }

  /**
   * Initializes the changeRoot from storage or creates a new one.
   */
  async #initializeChangeRoot() {
    const storedChangeRoot = JSON.parse(await this.#storage.getItem(CHANGE_ROOT_KEY))
    if (storedChangeRoot && storedChangeRoot.root === this.#root.toString()) {
      await this.#setChangeRoot(CID.parse(storedChangeRoot.changeRoot))
    } else {
      // Create a new changeRoot based on the current root
      await this.#setChangeRoot(this.#root)
    }
  }

  /**
   * Saves the changeRoot to storage.
   */
  async #setChangeRoot(changeRoot) {
    this.#changeRoot = changeRoot
    await this.#storage.setItem(CHANGE_ROOT_KEY, JSON.stringify({
      root: this.#root.toString(),
      changeRoot: changeRoot.toString()
    }))
  }

  /**
   * Checks if a file or folder exists in the filesystem.
   * @param {string} path - The file path.
   * @returns {Promise<CID | undefined>} The file entry CID if found, undefined if not found.
   */
  async #fileExists(path, inChangeRoot = false) {
    const split = path.split('/').filter(Boolean)
    let ref = ['', inChangeRoot ? this.#changeRoot : this.#root]
    for (const path of split) {
      const refs = await ls(this.#blockstore, ref[1])
      ref = refs.find(f => f[0] === path)
      if (!ref) return undefined
    }
    return ref[1]
  }

  async #isReady() {
    await this.#ensureRepoData()
    if (!this.#root) {
      throw new Error('Root not set. Call unsafeSetRoot() first.')
    }
  }

  async #ensureContent(cid) {
    if (!(await this.#blockstore.has(cid))) {
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
   * Lists the contents of a directory.
   * @param {string} path - The path of the directory to list.
   * @returns {Promise<UnixFSEntry[]>} The list of contents of the directory.
   */
  async ls(path) {
    await this.#isReady()

    const refsByPath = async (pathSplit, refs, inChangeRoot = false) => {
      for (const path of pathSplit) {
        const loc = refs.find(({ Name }) => Name === path)
        assert(!inChangeRoot || loc, `Folder not found: ${path}`)
        if (!loc) continue // we are calling ls in a folder that hasn't been created in fs yet
        refs = await lsFull(this.#blockstore, loc.Hash)
      }
      return refs
    }
    // Get entries from original filesystem
    const pathSplit = path.split('/').filter(Boolean)
    let refs = await lsFull(this.#blockstore, this.#root)
    refs = await refsByPath(pathSplit, refs)
    
    // Get entries from change filesystem
    let changeRefs = await lsFull(this.#blockstore, this.#changeRoot)
    changeRefs = await refsByPath(pathSplit, changeRefs, true)
    
    // Combine entries from both filesystems
    const allEntries = new Map()
    
    const refToEntry = (ref, fullPath, stat, change) => ({
      name: ref.Name,
      cid: ref.Hash,
      size: ref.Tsize,
      path: fullPath,
      type: stat.type === 'directory' ? 'directory' : 'file',
      change: change
    })
    // Add original entries
    for (const ref of refs) {
      const fullPath = [...pathSplit, ref.Name].join('/')
      await this.#ensureContent(ref.Hash)
      const stat = await this.#fs.stat(ref.Hash)
      // set all changes to delete, next loop will set the correct change if file still exists in changeRoot
      allEntries.set(ref.Name, refToEntry(ref, fullPath, stat, CHANGE_TYPE.DELETE))
    }
    
    // Add or update with change entries
    for (const ref of changeRefs) {
      const fullPath = [...pathSplit, ref.Name].join('/')
      const entry = allEntries.get(ref.Name)
      if (entry) {
        if (entry.cid.equals(ref.Hash)) {
          delete entry.change
        } else {
          entry.change = CHANGE_TYPE.EDIT
        }
        allEntries.set(ref.Name, entry)
      } else {
        const stat = await this.#fs.stat(ref.Hash)
        allEntries.set(ref.Name, refToEntry(ref, fullPath, stat, CHANGE_TYPE.NEW))
      }
    }
    
    return Array.from(allEntries.values())
  }

  /**
   * Adds a file to the change filesystem.
   * @param {string} path - The path where to add the file.
   * @param {Uint8Array} content - The file content as a Uint8Array.
   * @returns {Promise<void>} Resolves when the file is staged.
   */
  async add(path, content) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`
    
    // Add file to changeRoot
    await this.#setChangeRoot(await addFile(this.#fs, this.#changeRoot, path, content))
  }

  /**
   * Removes a file from the change filesystem or commited filesystem.
   * @param {string} path - The path of the file to remove.
   * @returns {Promise<void>} Resolves when the file is staged for deletion or removed.
   */
  async rm(path) {
    await this.#isReady()
    // Remove from changeRoot
    await this.#setChangeRoot(await rm(this.#fs, this.#changeRoot, path, { recursive: false }))
  }

  /**
   * Creates a directory in the change filesystem.
   * @param {string} path - The path of the directory to create.
   * @returns {Promise<void>} Resolves when the directory is created.
   */
  async mkdir(path) {
    await this.#isReady()
    // filter removes ""
    const split = path.split('/').filter(Boolean)
    if (await this.#fileExists(split.join('/'), true)) {
      throw new Error(`Directory or file already exists: ${path}`)
    }
    let changePointer = await this.#fs.addDirectory()
    do {
      const name = split.pop()
      const reminderPath = split.join('/')
      const parentCid = await this.#fileExists(reminderPath, true)
      if (parentCid) {
        changePointer = await this.#fs.cp(changePointer, parentCid, name, { force: true })
      } else {
        throw new Error(`Parent directory ${reminderPath} does not exist`)
      }
    } while (split.length > 0)
    await this.#setChangeRoot(changePointer)
  }

  /**
   * Restores a file from the change filesystem to its commited state.
   * @param {string} path - The path of the file to restore.
   */
  async restore(path) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`

    // First check if file exists in root
    const fileCid = await this.#fileExists(path)
    if (!fileCid) {
      // If file doesn't exist in root, just remove it from changeRoot
      await this.#setChangeRoot(await rm(this.#fs, this.#changeRoot, path))
    } else {
      // Copy the file from root to changeRoot
      const newChangeRoot = await cp(this.#fs, fileCid, this.#changeRoot, path, { force: true })
      await this.#setChangeRoot(newChangeRoot)
    }
  }

  /**
   * Reads the content of a file from the change filesystem.
   * @param {string} path - The path of the file to read.
   * @returns {Promise<Uint8Array>} The file content as a Uint8Array.
   */
  async cat(path) {
    await this.#isReady()
    path = path.startsWith('/') ? path : `/${path}`

    const fileCid = await this.#fileExists(path, true)
    assert(fileCid, `File not found: ${path}`)
    await this.#ensureContent(fileCid)
    return concat(await all(this.#fs.cat(this.#changeRoot, { path })))
  }

  async hasChanges() {
    await this.#isReady()
    return !this.#changeRoot.equals(this.#root)
  }

  /**
   * Stages all changes and returns a new CID of the updated filesystem root.
   * @returns {Promise<{ cid: CID, unchangedCids: CidSet }>} The CID of the new root after staging changes.
   */
  async stage() {
    await this.#isReady()
    // The changeRoot already contains all the staged changes
    const unchangedCids = await getChildCids(this.#blockstore, this.#root)
    return { cid: this.#changeRoot, unchangedCids }
  }

  /**
   * Finalizes a commit.
   * Clears out all edits and updates the repo state.
   * @param {string} cid - The CID of the new repo root.
   */
  async finalizeCommit(cid) {
    await this.#isReady()
    this.#root = cid
    await this.#setChangeRoot(cid)
  }

  /**
   * Clears all staged changes.
   */
  async clearChanges() {
    await this.#isReady()
    await this.#setChangeRoot(this.#root)
  }
}