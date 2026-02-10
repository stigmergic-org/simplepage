import { create } from 'kubo-rpc-client'
import { CarBlock } from 'cartonne'
import { CID } from 'multiformats/cid'
import all from 'it-all'
import * as u8a from 'uint8arrays'
import { assert, carFromBytes, emptyCar, CidSet } from '@simplepg/common'
import { LRUCache } from 'lru-cache'

const SPG_DATA_ROOT = '/spg-data'
const SPG_DOMAINS_DIR = `${SPG_DATA_ROOT}/domains`
const SPG_PIN_FAILURES_DIR = `${SPG_DATA_ROOT}/pin-failures`
const SPG_ROOT_PIN = 'spg_data_root'
const FINALIZED_PIN_PREFIX = 'spg_finalized'
const STAGED_PIN_PREFIX = 'spg_staged'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export class IpfsService {
  constructor({ api, ipfsClient, maxStagedAge = 60 * 60, logger }) { // Default 1 hour
    assert(api || ipfsClient, 'api or ipfsClient must be provided')
    this.client = ipfsClient || create({ url: api })
    this.maxStagedAge = maxStagedAge
    this.logger = logger || { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }
    this._listCache = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 }) // 5 min TTL
    this._lastPruneStaged = 0
    this._rootPinCid = null
    this._domainsCache = null
    this._resolverCache = new Map()
    this._lastRetryFailedPins = 0
    this._rootEnsured = false
  }

  async #ensureDir(path) {
    try {
      await this.client.files.stat(path)
    } catch (error) {
      await this.client.files.mkdir(path, { parents: true })
    }
  }

  async #ensureRootDir() {
    if (this._rootEnsured) {
      return
    }
    await this.#ensureDir(SPG_DATA_ROOT)
    await this.#ensureDir(SPG_DOMAINS_DIR)
    await this.#ensureDir(SPG_PIN_FAILURES_DIR)
    this._rootEnsured = true
  }

  async #pathExists(path) {
    try {
      await this.client.files.stat(path)
      return true
    } catch (_error) {
      return false
    }
  }

  async #listDir(path) {
    try {
      return await all(await this.client.files.ls(path))
    } catch (_error) {
      return []
    }
  }

  async #readFile(path) {
    try {
      const chunks = await all(await this.client.files.read(path))
      return u8a.toString(Buffer.concat(chunks), 'utf8')
    } catch (_error) {
      return null
    }
  }

  async #copyCidToMfs(cid, path) {
    await this.#removePath(path, { recursive: true })
    await this.client.files.cp(`/ipfs/${cid.toString()}`, path, { parents: true })
  }

  async #readCidFromMfs(path) {
    try {
      const stat = await this.client.files.stat(path)
      return stat?.cid || null
    } catch (_error) {
      return null
    }
  }

  async #writeFile(path, content, { updateRootPin = true } = {}) {
    await this.client.files.write(path, new TextEncoder().encode(content), {
      create: true,
      truncate: true,
      parents: true
    })
    if (updateRootPin) {
      await this.#updateRootPin()
    }
  }

  async #removePath(path, { recursive = false } = {}) {
    try {
      await this.client.files.rm(path, { recursive })
      await this.#updateRootPin()
    } catch (_error) {
      return
    }
  }

  #sanitizeKey(value) {
    return String(value).replace(/[^a-zA-Z0-9.-]/g, '_')
  }

  async #getRootPinCid() {
    const pins = await all(await this.client.pin.ls({ name: SPG_ROOT_PIN }))
    if (pins.length > 1) {
      const [keep, ...rest] = pins
      for (const pin of rest) {
        try {
          await this.client.pin.rm(pin.cid, { name: pin.name })
        } catch (_error) {
          // ignore
        }
      }
      return keep?.cid || null
    }
    return pins[0]?.cid || null
  }

  async #updateRootPin() {
    await this.#ensureRootDir()
    const stat = await this.client.files.stat(SPG_DATA_ROOT)
    const newCid = stat.cid
    if (!this._rootPinCid) {
      this._rootPinCid = await this.#getRootPinCid()
    }
    if (!this._rootPinCid) {
      await this.client.pin.add(newCid, { recursive: false, name: SPG_ROOT_PIN })
      this._rootPinCid = newCid
      return
    }
    if (!this._rootPinCid.equals(newCid)) {
      try {
        await this.client.pin.update(this._rootPinCid, newCid, { recursive: false })
      } catch (_error) {
        await this.client.pin.add(newCid, { recursive: false, name: SPG_ROOT_PIN })
      }
      this._rootPinCid = newCid
    }
  }

  async stageCar(fileBuffer, stageDomain) {
    // Create abort controller with 3-minute timeout
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, 3 * 60 * 1000) // 3 minutes

    try {
      this.logger.info('Writing CAR file', { stageDomain, bufferSize: fileBuffer.length })
      
      let rootCid
      
      // Create an AsyncIterable that yields CAR files as Uint8Arrays
      const sources = (async function* () {
        yield new Uint8Array(fileBuffer)
      })()
      
      // Import with abort signal
      for await (const result of this.client.dag.import(sources, { signal: abortController.signal })) {
        rootCid = result.root.cid
      }

      if (rootCid.code !== 0x70 && rootCid.code !== 0x55) {
        throw new Error('CAR root must be UnixFS (dag-pb or raw)')
      }

      const timestamp = Math.floor(Date.now() / 1000)
      const pinName = `${STAGED_PIN_PREFIX}_${stageDomain}_${timestamp}`

      // Pin to ensure the car file is complete before adding to mfs.
      // This ensures we don't get locking while pinning the mfs root if blocks
      // are missing from the car file.
      await this.client.pin.add(rootCid, { recursive: true, name: pinName, signal: abortController.signal })
      await this.recordStaged({ domain: stageDomain, timestamp, cid: rootCid })

      // Clear timeout since operation completed successfully
      clearTimeout(timeoutId)
      this.logger.info('Staged CAR file successfully', {
        rootCid: rootCid.toString(),
        stageDomain,
        timestamp,
        pinName
      })

      return rootCid
    } catch (error) {
      // Clear timeout on error
      clearTimeout(timeoutId)
      if (abortController.signal.aborted) {
        this.logger.error('CAR file operation timed out after 3 minutes', {
          stageDomain,
          error: error.message
        })
        throw new Error(`CAR file import timed out after 3 minutes. Make sure your CAR file is valid.`)
      }
      this.logger.error('Error importing CAR file', {
        error: error.message, 
        stageDomain,
        stack: error.stack 
      })
      throw error
    }
  }

  async healthCheck() {
    try {
      await this.client.id()
      this.logger.debug('IPFS health check passed')
      return true
    } catch (error) {
      this.logger.error('IPFS health check failed', { 
        error: error.message, 
        stack: error.stack 
      })
      return false
    }
  }

  async readCarLite(cid) {
    // Helper to recursively collect needed CIDs
    const neededCids = new Set([cid])
    const self = this
    async function collectFiles(currentCid, path = '', isRoot = false) {
      for await (const entry of self.client.ls(currentCid)) {
        // Only descend into directories that don't start with _ if at root
        if (entry.type === 'dir') {
          if (isRoot && entry.name.startsWith('_') && entry.name !== '_files') continue
          neededCids.add(entry.cid.toString())
          await collectFiles(entry.cid, path + entry.name + '/', false)
        } else if (!path.includes('_files')) {
          // don't collect files in _files directory,
          // as they are large and can be collected when needed
          neededCids.add(entry.cid.toString())
        }
      }
    }
    await collectFiles(cid, '', true)
    // Create a new CAR writer
    const car = emptyCar()
    // Add blocks for each needed CID
    for (const blockCid of neededCids) {
      const blockData = await this.client.block.get(blockCid)
      car.blocks.put(new CarBlock(CID.parse(blockCid), blockData))
    }
    // Add the root CID to the CAR
    car.roots.push(CID.parse(cid))
    return car.bytes
  }

  async readBlock(cid) {
    try {
      this.logger.debug('Reading raw IPFS block', { cid })
      const blockData = await this.client.block.get(cid)
      this.logger.debug('Raw IPFS block read successfully', { cid, blockSize: blockData.length })
      return blockData
    } catch (error) {
      this.logger.error('Error reading raw IPFS block', {
        cid,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  async #readCar(cid) {
    return carFromBytes(Buffer.concat(await all(this.client.dag.export(cid))), { verify: false })
  }

  async #collectChildCids(rootCid) {
    try {
      const car = await this.#readCar(rootCid)
      const cids = await all(car.blocks.cids())
      return cids
    } catch (error) {
      this.logger.warn('Could not collect children for CID', {
        rootCid: rootCid.toString(),
        error: error.message
      })
    }
  }

  async isPageFinalized(cid, domain, txHash) {
    assert(cid instanceof CID, `cid must be an instance of CID, got ${typeof cid}`)
    const finalizations = await this.getFinalizations(domain)
    return finalizations.some(entry => entry.txHash === txHash && entry.cid.equals(cid))
  }

  async providePage(cid) {
    // Recursively walk the DAG from cid, skipping any path containing '_prev'
    const cids = new CidSet();
    const self = this;
    async function walk(currentCid, path = '') {
      cids.add(currentCid);
      for await (const entry of self.client.ls(currentCid)) {
        const entryPath = `${path}/${entry.name}`;
        // Skip any entry under a _prev directory at any level
        if (entry.name === '_prev') continue;
        cids.add(entry.cid);
        if (entry.type === 'dir') {
          await walk(entry.cid, entryPath);
        }
      }
    }
    await walk(cid, '');
    // Provide all collected CIDs in a batch
    try {
      await all(await this.client.routing.provide(Array.from(cids)))
      this.logger.info('Provided all CIDs for page', { root: cid.toString(), count: cids.size });
    } catch (error) {
      this.logger.error('Error providing page', {
        error: error.message,
        cid: cid.toString(),
        stack: error.stack
      })
    }
  }

  async #getDomainDir(domain) {
    return `${SPG_DOMAINS_DIR}/${domain}`
  }

  async #getStagedDir(domain) {
    return `${SPG_DOMAINS_DIR}/${domain}/staged`
  }

  async #getFinalizedDir(domain) {
    return `${SPG_DOMAINS_DIR}/${domain}/finalized`
  }

  async #getResolverPath(domain) {
    return `${SPG_DOMAINS_DIR}/${domain}/resolver`
  }

  #pinFailurePath(domain, txHash) {
    const safeDomain = this.#sanitizeKey(domain)
    return `${SPG_PIN_FAILURES_DIR}/${safeDomain}-${txHash}.json`
  }

  async #recordPinFailure({ domain, txHash, cid, error }) {
    const path = this.#pinFailurePath(domain, txHash)
    let attempts = 0
    const existing = await this.#readFile(path)
    if (existing) {
      try {
        const parsed = JSON.parse(existing)
        attempts = parsed.attempts || 0
      } catch (_error) {
        attempts = 0
      }
    }
    const payload = {
      domain,
      txHash,
      cid: cid.toString(),
      error: error?.message || String(error),
      attempts: attempts + 1,
      lastAttempt: new Date().toISOString()
    }
    await this.#writeFile(path, JSON.stringify(payload), { updateRootPin: true })
  }

  async #removePinFailure(domain, txHash) {
    const path = this.#pinFailurePath(domain, txHash)
    await this.#removePath(path, { recursive: false })
  }

  async listFailedPins() {
    await this.#ensureRootDir()
    const entries = await this.#listDir(SPG_PIN_FAILURES_DIR)
    const results = []
    for (const entry of entries) {
      const content = await this.#readFile(`${SPG_PIN_FAILURES_DIR}/${entry.name}`)
      if (!content) continue
      try {
        results.push(JSON.parse(content))
      } catch (_error) {
        continue
      }
    }
    return results
  }

  async retryFailedPins({ concurrency = 4, timeoutMs = 10 * 60 * 1000 } = {}) {
    const now = Math.floor(Date.now() / 1000)
    if (this._lastRetryFailedPins && (now - this._lastRetryFailedPins < 60 * 60)) {
      return
    }
    this._lastRetryFailedPins = now
    const failures = await this.listFailedPins()
    const workItems = failures.filter(failure => failure?.cid && failure?.domain && failure?.txHash)
    const workerCount = Math.min(concurrency, workItems.length || 1)
    let index = 0
    const workers = Array.from({ length: workerCount }, async () => {
      while (index < workItems.length) {
        const currentIndex = index
        index += 1
        const failure = workItems[currentIndex]
        const cid = CID.parse(failure.cid)
        const pinName = `${FINALIZED_PIN_PREFIX}_${failure.domain}_${failure.txHash}`
        const abortController = new AbortController()
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)
        try {
          await this.client.pin.add(cid, { recursive: true, name: pinName, signal: abortController.signal })
          await this.#removePinFailure(failure.domain, failure.txHash)
        } catch (error) {
          await this.#recordPinFailure({
            domain: failure.domain,
            txHash: failure.txHash,
            cid,
            error
          })
        } finally {
          clearTimeout(timeoutId)
        }
      }
    })
    await Promise.all(workers)
  }

  async getList(name) {
    await this.#ensureRootDir()
    if (this._listCache.has(name)) {
      return this._listCache.get(name)
    }
    const path = `${SPG_DATA_ROOT}/${name}`
    const content = await this.#readFile(path)
    if (!content) {
      this._listCache.set(name, [])
      return []
    }
    const list = content
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
    this._listCache.set(name, list)
    return list
  }

  async addToList(name, value) {
    const list = await this.getList(name)
    if (!list.includes(value)) {
      list.push(value)
      await this.#writeFile(`${SPG_DATA_ROOT}/${name}`, list.join('\n'), { updateRootPin: true })
      this._listCache.delete(name)
      this.logger.info('Added item to list', { name, value })
    } else {
      this.logger.debug('Item already in list', { name, value })
    }
  }

  async removeFromList(name, value) {
    const list = await this.getList(name)
    const nextList = list.filter(item => item !== value)
    if (nextList.length === list.length) {
      this.logger.debug('Item not in list', { name, value })
      return
    }
    const path = `${SPG_DATA_ROOT}/${name}`
    if (nextList.length === 0) {
      await this.#removePath(path, { recursive: false })
    } else {
      await this.#writeFile(path, nextList.join('\n'), { updateRootPin: true })
    }
    this._listCache.delete(name)
    this.logger.info('Removed item from list', { name, value })
  }

  async ensureDomain(domain) {
    await this.#ensureRootDir()
    await this.#ensureDir(await this.#getDomainDir(domain))
    await this.#updateRootPin()
    if (this._domainsCache && !this._domainsCache.includes(domain)) {
      this._domainsCache.push(domain)
    }
  }

  async setDomainResolver(domain, resolver) {
    await this.ensureDomain(domain)
    const resolverPath = await this.#getResolverPath(domain)
    const value = resolver ? resolver.toLowerCase() : ZERO_ADDRESS
    if (value !== ZERO_ADDRESS) {
      await this.addToList('resolvers', value)
    }
    await this.#writeFile(resolverPath, value, { updateRootPin: true })
    this._resolverCache.set(domain, value)
  }

  async getDomainResolver(domain) {
    if (this._resolverCache.has(domain)) {
      return this._resolverCache.get(domain)
    }
    const resolverPath = await this.#getResolverPath(domain)
    const content = await this.#readFile(resolverPath)
    if (!content) {
      return null
    }
    const trimmed = content.trim()
    this._resolverCache.set(domain, trimmed)
    return trimmed
  }

  async domainExists(domain) {
    return this.#pathExists(await this.#getDomainDir(domain))
  }

  async listDomains() {
    await this.#ensureRootDir()
    if (this._domainsCache) {
      return this._domainsCache
    }
    const entries = await this.#listDir(SPG_DOMAINS_DIR)
    const domains = entries.map(entry => entry.name)
    this._domainsCache = domains
    return domains
  }

  async listFinalizableDomains() {
    const domains = await this.listDomains()
    const blocked = await this.getList('block-list')
    const allowList = await this.getList('allow-list')
    let domainsToSync = domains.filter(domain => !blocked.includes(domain))
    if (allowList.length > 0) {
      domainsToSync = domainsToSync.filter(domain => allowList.includes(domain))
    }
    return domainsToSync
  }

  async isDomainFinalizable(domain) {
    const blocked = await this.getList('block-list')
    if (blocked.includes(domain)) {
      return false
    }
    const allowList = await this.getList('allow-list')
    if (allowList.length === 0) {
      return true
    }
    return allowList.includes(domain)
  }

  async recordStaged({ domain, timestamp, cid }) {
    await this.ensureDomain(domain)
    const stagedDir = await this.#getStagedDir(domain)
    await this.#ensureDir(stagedDir)
    const stagedPath = `${stagedDir}/${timestamp}`
    await this.#copyCidToMfs(cid, stagedPath)
    await this.#updateRootPin()
  }

  async listStaged(domain) {
    const stagedDir = await this.#getStagedDir(domain)
    const entries = await this.#listDir(stagedDir)
    const staged = []
    for (const entry of entries) {
      const timestamp = parseInt(entry.name, 10)
      if (Number.isNaN(timestamp)) continue
      const cid = await this.#readCidFromMfs(`${stagedDir}/${entry.name}`)
      if (!cid) continue
      staged.push({ timestamp, cid: cid.toString() })
    }
    return staged
  }

  async pruneStaged() {
    const now = Math.floor(Date.now() / 1000)
    if (this._lastPruneStaged && (now - this._lastPruneStaged < 60)) {
      this.logger && this.logger.debug && this.logger.debug('pruneStaged: Skipping, called too soon')
      return
    }
    this._lastPruneStaged = now
    try {
      this.logger.debug('Starting staged pin pruning')
      const domains = await this.listDomains()
      let prunedCount = 0
      for (const domain of domains) {
        const stagedEntries = await this.listStaged(domain)
        for (const entry of stagedEntries) {
          const age = now - entry.timestamp
          if (age > this.maxStagedAge) {
            await this.#removePath(`${await this.#getStagedDir(domain)}/${entry.timestamp}`, { recursive: true })
            const pinName = `${STAGED_PIN_PREFIX}_${domain}_${entry.timestamp}`
            try {
              await this.client.pin.rm(entry.cid, { name: pinName })
            } catch (_error) {
              // ignore if not pinned
            }
            this.logger.info('Pruned old staged entry', {
              domain,
              cid: entry.cid,
              age
            })
            prunedCount++
          }
        }
      }
      if (prunedCount > 0) {
        this.logger.info('Staged pin pruning completed', { prunedCount })
      }
    } catch (error) {
      this.logger.error('Error pruning staged entries', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  async recordFinalization({ domain, txHash, blockNumber, cid }) {
    await this.ensureDomain(domain)
    const finalizedDir = await this.#getFinalizedDir(domain)
    const entryDir = `${finalizedDir}/${txHash}`
    await this.#ensureDir(entryDir)
    const contentPath = `${entryDir}/content`
    await this.#copyCidToMfs(cid, contentPath)
    await this.#writeFile(`${entryDir}/blockNumber`, String(blockNumber), { updateRootPin: false })
    await this.#updateRootPin()
  }

  async getFinalizations(domain) {
    const finalizedDir = await this.#getFinalizedDir(domain)
    const entries = await this.#listDir(finalizedDir)
    const results = []
    for (const entry of entries) {
      const entryDir = `${finalizedDir}/${entry.name}`
      const contentCid = await this.#readCidFromMfs(`${entryDir}/content`)
      const blockNumberRaw = await this.#readFile(`${entryDir}/blockNumber`)
      if (!contentCid || !blockNumberRaw) continue
      const blockNumber = parseInt(blockNumberRaw, 10)
      if (Number.isNaN(blockNumber)) continue
      results.push({
        txHash: entry.name,
        blockNumber,
        cid: contentCid
      })
    }
    return results
  }

  async getLatestFinalization(domain) {
    const finalizations = await this.getFinalizations(domain)
    if (finalizations.length === 0) return null
    return finalizations.reduce((max, entry) => entry.blockNumber > max.blockNumber ? entry : max)
  }

  async finalizePage(cid, domain, blockNumber, txHash) {
    assert(cid instanceof CID, `cid must be an instance of CID, got ${typeof cid}`)
    try {
      this.logger.info('Finalizing page', {
        cid: cid.toString(),
        domain,
        blockNumber,
        txHash
      })

      await this.recordFinalization({ domain, txHash, blockNumber, cid })

      const pinName = `${FINALIZED_PIN_PREFIX}_${domain}_${txHash}`
      try {
        await this.client.pin.add(cid, { recursive: true, name: pinName })
        await this.#removePinFailure(domain, txHash)
      } catch (error) {
        await this.#recordPinFailure({ domain, txHash, cid, error })
      }

      this.logger.info('Page finalized successfully', {
        cid: cid.toString(),
        domain,
        blockNumber,
        txHash
      })

      await this.providePage(cid)
    } catch (error) {
      this.logger.error('Error finalizing page', {
        error: error.message,
        cid: cid.toString(),
        domain,
        blockNumber,
        txHash,
        stack: error.stack
      })
    }
  }

  async clearStaged(domain) {
    const stagedDir = await this.#getStagedDir(domain)
    const stagedEntries = await this.listStaged(domain)
    for (const entry of stagedEntries) {
      await this.#removePath(`${stagedDir}/${entry.timestamp}`, { recursive: false })
      try {
          } catch (_error) {
            // ignore if missing
          }
    }
  }

  async listFinalizedPages() {
    const domains = await this.listDomains()
    const finalized = []
    for (const domain of domains) {
      const entries = await this.#listDir(await this.#getFinalizedDir(domain))
      if (entries.length > 0) {
        finalized.push(domain)
      }
    }
    return finalized
  }

  async resetIndexerData() {
    await this.#removePath(SPG_DOMAINS_DIR, { recursive: true })
    await this.#ensureDir(SPG_DOMAINS_DIR)
    await this.#removePath(`${SPG_DATA_ROOT}/resolvers`, { recursive: false })
    this._listCache.clear()
    this._domainsCache = null
    this._resolverCache.clear()
    await this.#updateRootPin()
  }

  async nukePage(domain) {
    try {
      this.logger.info('Nuking page', { domain })

      const finalizations = await this.getFinalizations(domain)
      const cidsToCheck = []
      for (const entry of finalizations) {
        const recursiveCids = await this.#collectChildCids(entry.cid)
        if (recursiveCids?.length) {
          cidsToCheck.push(...recursiveCids)
        }
      }

      const finalizedDir = await this.#getFinalizedDir(domain)
      await this.#removePath(finalizedDir, { recursive: true })

      const stagedDir = await this.#getStagedDir(domain)
      await this.#removePath(stagedDir, { recursive: true })

      const finalizedPinPrefix = `${FINALIZED_PIN_PREFIX}_${domain}_`
      const finalizedPins = await all(await this.client.pin.ls({ name: finalizedPinPrefix }))
      for (const pin of finalizedPins) {
        try {
          await this.client.pin.rm(pin.cid, { name: pin.name })
        } catch (_error) {
          // ignore
        }
      }

      const stagedPinPrefix = `${STAGED_PIN_PREFIX}_${domain}_`
      const stagedPins = await all(await this.client.pin.ls({ name: stagedPinPrefix }))
      for (const pin of stagedPins) {
        try {
          await this.client.pin.rm(pin.cid, { name: pin.name })
        } catch (_error) {
          // ignore
        }
      }

      const cidsWithPins = []
      for (const cid of cidsToCheck) {
        try {
          const pins = await all(this.client.pin.ls({ paths: [cid] }))
          if (pins.length > 0) {
            cidsWithPins.push(pins[0].cid)
          }
        } catch (_error) {
          continue
        }
      }

      const cidsToNuke = cidsToCheck.filter(checkCid => !cidsWithPins.find(keepCid => keepCid.equals(checkCid)))
      for (const cid of cidsToNuke) {
        try {
          await all(await this.client.block.rm(cid))
          this.logger.debug('Removed block', { cid: cid.toString() })
        } catch (_error) {
          this.logger.debug('Block already removed or doesn\'t exist', { cid: cid.toString() })
        }
      }

      this.logger.info('Page nuked successfully', {
        domain,
        finalizationsRemoved: finalizations.length
      })
      this._resolverCache.delete(domain)
    } catch (error) {
      this.logger.error('Error nuking page', {
        error: error.message,
        domain,
        stack: error.stack
      })
      throw error
    }
  }

  async getLatestBlockNumber() {
    await this.#ensureRootDir()
    if (this._listCache.has('latestBlockNumber')) {
      return this._listCache.get('latestBlockNumber')
    }
    const content = await this.#readFile(`${SPG_DATA_ROOT}/latestBlockNumber`)
    if (!content) {
      this._listCache.set('latestBlockNumber', 0)
      return 0
    }
    const blockNumber = parseInt(content, 10)
    if (Number.isNaN(blockNumber)) {
      return 0
    }
    this._listCache.set('latestBlockNumber', blockNumber)
    return blockNumber
  }

  async setLatestBlockNumber(blockNumber) {
    this.logger.debug('Setting latest block number', { blockNumber })
    await this.#writeFile(`${SPG_DATA_ROOT}/latestBlockNumber`, String(blockNumber), { updateRootPin: true })
    this._listCache.set('latestBlockNumber', blockNumber)
  }
}
