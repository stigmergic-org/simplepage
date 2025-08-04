import { MemoryBlockstore } from 'blockstore-core/memory'
import { IDBBlockstore } from 'blockstore-idb'
import { CID } from 'multiformats/cid'
import { fromString } from 'uint8arrays/from-string'
import { toString } from 'uint8arrays/to-string'

const toBase64 = (bytes) => toString(bytes, 'base64')
const fromBase64 = (base64) => fromString(base64, 'base64')

const CID_PREFIX = 'ipld_block:'
const IDB_NAME = 'hybrid-blockstore'

/**
 * A blockstore that combines memory and IndexedDB storage.
 * Writes to memory immediately and IndexedDB asynchronously for performance.
 */
export class HybridBlockstore {
  #openPromise
  #memory
  #idb
  #pendingWrites
  #storage
  #flushTimer

  /**
   * @param {LocalStorage} storage 
   */
  constructor(storage) {
    this.#memory = new MemoryBlockstore()
    this.#idb = new IDBBlockstore(IDB_NAME)
    this.#pendingWrites = new Map() // Track pending IndexedDB writes
    this.#storage = storage
    this.#openPromise = (async () => {
      await this.#idb.open()
      await this.#importWAL()
    })()
    this.#flushTimer = setInterval(() => {
      this.flush().catch(console.error)
    }, 10000) // every 10s
  }

  async #importWAL() {
    if (this.#storage) {
      const keys = Object.keys(this.#storage).filter(key => key.startsWith(CID_PREFIX))
      for (const key of keys) {
        const cid = CID.parse(key.slice(CID_PREFIX.length))
        const value = this.#storage.getItem(key)
        if (value) {
          await this.#idb.put(cid, fromBase64(value))
        }
      }
    }
  }

  async #afterOpen(action) {
    await this.#openPromise
    return action()
  }

  /**
   * Put a block into both memory and IndexedDB (async)
   */
  async put(cid, bytes, options = {}) {
    // Write to memory immediately
    await this.#memory.put(cid, bytes, options)
    
    // For blocks larger than 256KB, await IndexedDB write directly
    const isLargeBlock = bytes.length > 256 * 1024 // 256KB
    const idbPromise = this.#afterOpen(() => this.#idb.put(cid, bytes, options))
    
    if (isLargeBlock) {
      // Await the IndexedDB write for large blocks
      await idbPromise
    } else {
      // Write to IndexedDB asynchronously for smaller blocks (don't await)
      this.#pendingWrites.set(cid.toString(), idbPromise)
      if (this.#storage) {
        this.#storage.setItem(`${CID_PREFIX}${cid.toString()}`, toBase64(bytes))
      }
    }
    return cid
  }

  /**
   * Get a block from memory first, then IndexedDB if not found
   */
  async get(cid, options = {}) {
    try {
      // Try memory first
      return await this.#memory.get(cid, options)
    } catch (error) {
      if (error.code === 'ERR_NOT_FOUND') {
        // Try IndexedDB
        const bytes = await this.#afterOpen(() => this.#idb.get(cid, options))
        // Add to memory for faster subsequent access
        this.#memory.put(cid, bytes, options)
        return bytes
      }
      throw error
    }
  }

  /**
   * Check if a block exists in memory or IndexedDB
   */
  async has(cid, options = {}) {
    // Check memory first
    if (await this.#memory.has(cid, options)) {
      return true
    }
    // Check IndexedDB
    const exists = await this.#afterOpen(() => this.#idb.has(cid, options))
    if (exists) {
      // If it exists in IndexedDB, also add it to memory for faster access
      try {
        this.#afterOpen(() => this.#idb.get(cid, options)).then(bytes => {
          this.#memory.put(cid, bytes, options)
        })
      } catch (error) {
        console.error('Error getting from IndexedDB', error)
      }
    }
    return exists
  }

  /**
   * Delete a block from both memory and IndexedDB
   */
  async delete(cid, options = {}) {
    // Remove from pending writes
    this.#pendingWrites.delete(cid.toString())
    
    // Delete from both stores
    await Promise.all([
      this.#memory.delete(cid, options),
      this.#afterOpen(() => this.#idb.delete(cid, options))
    ])
    if (this.#storage) {
      this.#storage.removeItem(`${CID_PREFIX}${cid.toString()}`)
    }
  }

  /**
   * Wait for all pending IndexedDB writes to complete
   */
  async flush() {
    const promises = Array.from(this.#pendingWrites.values())
    this.#pendingWrites.clear()
    
    // Wait for all pending writes to complete
    const results = await Promise.all(promises)

    // If storage exists, remove all successfully written cids from local storage
    if (this.#storage) {
      results.map(cid => {
        this.#storage.removeItem(`${CID_PREFIX}${cid}`)
      })
    }
  }

  /**
   * Close both blockstores
   */
  async close() {
    clearInterval(this.#flushTimer)
    await this.flush()
    await this.#idb.close()
  }
} 