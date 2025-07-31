import { create } from 'kubo-rpc-client'
import { CarBlock } from 'cartonne'
import { CID } from 'multiformats/cid'
import { identity } from 'multiformats/hashes/identity'
import varint from 'varint'
import all from 'it-all'
import * as u8a from 'uint8arrays'
import { assert, carFromBytes, emptyCar, CidSet } from '@simplepg/common'
import { FinalizationMap } from './finalization-map.js'
import { LRUCache } from 'lru-cache'

const BLOCK_NUMBER_LABEL = 'spg_latest_block_number'


const dataTypeToCidEncodeFn = dataType => {
  if (dataType === 'string') {
    return s => CID.create(1, 0x55, identity.digest(u8a.fromString(s, 'utf8')))
  } else if (dataType === 'address') {
    return a => {
      const hexAddr = a.slice(2).toLowerCase()
      return CID.create(1, 0x55, identity.digest(u8a.fromString(hexAddr, 'hex')))
    }
  } else if (dataType === 'number') {
    return n => {
      const encoded = new Uint8Array(varint.encode(n))
      return CID.create(1, 0x55, identity.digest(encoded))
    }
  } else {
    throw new Error(`Unsupported data type: ${dataType}`)
  }
}

const dataTypeToCidDecodeFn = dataType => {
  if (dataType === 'string') {
    return cid => u8a.toString(cid.multihash.digest, 'utf8')
  } else if (dataType === 'address') {
    return cid => '0x' + u8a.toString(cid.multihash.digest, 'hex')
  } else if (dataType === 'number') {
    return cid => varint.decode(cid.multihash.digest)
  } else {
    throw new Error(`Unsupported data type: ${dataType}`)
  }
}

export class IpfsService {
  constructor({ api, ipfsClient, maxStagedAge = 60 * 60, logger }) { // Default 1 hour
    assert(api || ipfsClient, 'api or ipfsClient must be provided')
    this.client = ipfsClient || create({ url: api })
    this.maxStagedAge = maxStagedAge
    this.logger = logger || { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }
    this.finalizations = new FinalizationMap(this.client, this.logger)
    this._listCache = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 }) // 5 min TTL
    this._lastPruneStaged = 0
  }

  async writeCar(fileBuffer, stageDomain) {
    try {
      this.logger.info('Writing CAR file', { stageDomain, bufferSize: fileBuffer.length })
      
      let rootCid
      
      // Create an AsyncIterable that yields CAR files as Uint8Arrays
      const sources = (async function* () {
        yield new Uint8Array(fileBuffer)
      })()
      
      for await (const result of this.client.dag.import(sources)) {
        rootCid = result.root.cid
      }

      // Create pin label with timestamp
      const label = `spg_staged_${stageDomain}_${Math.floor(Date.now() / 1000)}`

      // Pin the content recursively with the label
      await this.client.pin.add(rootCid, { recursive: true, name: label })
      this.logger.info('Staged CAR file successfully', { 
        rootCid: rootCid.toString(), 
        label, 
        stageDomain 
      })

      return rootCid
    } catch (error) {
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

  async #readCar(cid) {
    return carFromBytes(Buffer.concat(await all(this.client.dag.export(cid))), { verify: false })
  }

  async readCarLite(cid) {
    // Helper to recursively collect needed CIDs
    const neededCids = new Set([cid])
    const filesToCollect = ["index.html", "index.md", "_template.html", "manifest.webmanifest", "manifest.json"]
    const self = this
    async function collectFiles(currentCid, path = '', isRoot = false) {
      for await (const entry of self.client.ls(currentCid)) {
        // Only descend into directories that don't start with _ if at root
        if (entry.type === 'dir') {
          if (isRoot && entry.name.startsWith('_') && entry.name !== '_files') continue
          neededCids.add(entry.cid.toString())
          await collectFiles(entry.cid, path + entry.name + '/', false)
        } else if (filesToCollect.includes(entry.name) && !path.includes('_files')) {
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



  async isPageFinalized(cid, domain, blockNumber) {
    assert(cid instanceof CID, `cid must be an instance of CID, got ${typeof cid}`)
    return this.finalizations.isFinalized(domain, blockNumber, cid)
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

  async finalizePage(cid, domain, blockNumber) {
    assert(cid instanceof CID, `cid must be an instance of CID, got ${typeof cid}`)
    try {
      this.logger.info('Finalizing page', { 
        cid: cid.toString(), 
        domain, 
        blockNumber 
      })
      
      // Add finalization using the FinalizationMap
      await this.finalizations.push(domain, blockNumber, cid)
      
      this.logger.info('Page finalized successfully', { 
        cid: cid.toString(), 
        domain,
        blockNumber 
      })
      
      // Reprovide all new CIDs of the published page
      await this.providePage(cid)

      // Remove all staged pins
      const stagedPins = await this.client.pin.ls({
        name: `spg_staged_${domain}`
      })
      for await (const pin of stagedPins) {
        await this.client.pin.rm(pin.cid, { recursive: true })
        this.logger.debug('Removed staged pin', { 
          pinName: pin.name, 
          pinCid: pin.cid.toString() 
        })
      }
    } catch (error) {
      this.logger.error('Error finalizing page', { 
        error: error.message, 
        cid: cid.toString(),
        domain,
        blockNumber,
        stack: error.stack 
      })
      throw error
    }
  }

  async listFinalizedPages() {
    return this.finalizations.list()
  }

  async nukePage(domain) {
    try {
      this.logger.info('Nuking page', { domain })
      
      // Get current finalizations for the domain
      const domainFinalizations = await this.finalizations.getAll(domain)
      
      if (domainFinalizations.length === 0) {
        this.logger.debug('No finalizations found for domain', { domain })
        return
      }
      
      // Collect all CIDs that need to be checked for removal
      const cidsToCheck = []
      for (const { cid } of domainFinalizations) {
        const recursiveCids = await this.#collectChildCids(cid)
        cidsToCheck.push(...recursiveCids)
      }
      
      // Remove domain from finalizations
      await this.finalizations.remove(domain)
      
      this.logger.info('Removed domain from finalizations', { 
        domain,
        finalizationsRemoved: domainFinalizations.length 
      })

      const cidsWithOtherDomainPins = []
      for (const cid of cidsToCheck) {
        try {
          const pins = await all(this.client.pin.ls({ paths: [cid] }))
          if (pins.length > 0) {
            cidsWithOtherDomainPins.push(pins[0].cid)
          }
        } catch (error) {
          continue // Ignore errors from ls when CID is not pinned
        }
      }

      const cidsToNuke = cidsToCheck.filter(checkCid => !cidsWithOtherDomainPins.find(keepCid => keepCid.equals(checkCid)))

      for (const cid of cidsToNuke) {
        try {
          await all(await this.client.block.rm(cid))
          this.logger.debug('Removed block', { cid: cid.toString() })
        } catch (error) {
          // Block might already be removed or not exist
          this.logger.debug('Block already removed or doesn\'t exist', { 
            cid: cid.toString() 
          })
        }
      }
      
      this.logger.info('Page nuked successfully', { 
        domain, 
        finalizationsRemoved: domainFinalizations.length,
        blocksRemoved: cidsToNuke.length 
      })
    } catch (error) {
      this.logger.error('Error nuking page', { 
        error: error.message, 
        domain,
        stack: error.stack 
      })
      throw error
    }
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

  async pruneStaged() {
    const now = Math.floor(Date.now() / 1000)
    if (this._lastPruneStaged && (now - this._lastPruneStaged < 60)) {
      this.logger && this.logger.debug && this.logger.debug('pruneStaged: Skipping, called too soon')
      return
    }
    this._lastPruneStaged = now
    try {
      this.logger.debug('Starting staged pin pruning')
      // Get all pins with spg_staged_ prefix
      const stagedPins = await this.client.pin.ls({
        name: 'spg_staged_'
      })
      let prunedCount = 0
      for await (const pin of stagedPins) {
        // Extract timestamp from pin name
        // Format is spg_staged_domain_timestamp
        const parts = pin.name.split('_')
        if (parts.length >= 4) {
          const timestamp = parseInt(parts[parts.length - 1], 10)
          if (!isNaN(timestamp)) {
            const age = now - timestamp
            if (age > this.maxStagedAge) {
              await this.client.pin.rm(pin.cid, { recursive: true })
              this.logger.info('Pruned old staged pin', { 
                pinName: pin.name, 
                pinCid: pin.cid.toString(),
                age: age 
              })
              prunedCount++
            }
          }
        }
      }
      if (prunedCount > 0) {
        this.logger.info('Staged pin pruning completed', { prunedCount })
      }
    } catch (error) {
      this.logger.error('Error pruning staged pins', { 
        error: error.message, 
        stack: error.stack 
      })
      throw error
    }
  }

  async _getList(name, dataType) {
    if (this._listCache.has(name)) {
      return this._listCache.get(name)
    }
    const pins = await all(await this.client.pin.ls({ name: `spg_list_${name}` }))
    const decodeFn = dataTypeToCidDecodeFn(dataType)
    const result = pins.map(pin => decodeFn(pin.cid))
    this._listCache.set(name, result)
    return result
  }

  async getList(name, dataType) {
    return this._getList(name, dataType)
  }

  async addToList(name, dataType, value) {
    const list = await this._getList(name, dataType)
    const encodeFn = dataTypeToCidEncodeFn(dataType)
    const itemCid = encodeFn(value)
    if (!list.includes(value)) {
      await this.client.pin.add(itemCid, { name: `spg_list_${name}`, recursive: false })
      this.logger.info('Added item to list', { name, dataType, value })
      this._listCache.delete(name)
    } else {
      this.logger.debug('Item already in list', { name, dataType, value })
    }
  }

  async removeFromList(name, dataType, value) {
    this.logger.debug('Removing from list', { name, dataType, value })
    const list = await this._getList(name, dataType)
    if (list.includes(value)) {
      const itemCid = dataTypeToCidEncodeFn(dataType)(value)
      await this.client.pin.rm(itemCid, { name: `spg_list_${name}` })
      this.logger.info('Removed item from list', { name, dataType, value })
      this._listCache.delete(name)
    } else {
      this.logger.debug('Item not in list', { name, dataType, value })
    }
  }

  async _getLatestBlockNumberCid() {
    const pins = await all(await this.client.pin.ls({ name: 'spg_latest_block_number' }))
    assert(pins.length <= 1, 'Expected max one latest block number pin, got ' + pins.length)
    return pins[0]?.cid
  }

  async getLatestBlockNumber() {
    if (this._listCache.has(BLOCK_NUMBER_LABEL)) {
      return this._listCache.get(BLOCK_NUMBER_LABEL);
    }
    const cid = await this._getLatestBlockNumberCid()
    if (!cid) {
      this.logger.debug('No latest block number found, returning 0')
      this._listCache.set(BLOCK_NUMBER_LABEL, 0);
      return 0
    }
    // Decode the CID to get the block number
    const blockNumber = dataTypeToCidDecodeFn('number')(cid)
    this.logger.debug('Retrieved latest block number', { blockNumber })
    this._listCache.set(BLOCK_NUMBER_LABEL, blockNumber);
    return blockNumber
  }

  async setLatestBlockNumber(blockNumber) {
    this.logger.debug('Setting latest block number', { blockNumber })
    // get current latest block number cid
    const latestBlockNumberCid = await this._getLatestBlockNumberCid()
    // generate given block number cid
    const newBlockNumberCid = dataTypeToCidEncodeFn('number')(blockNumber)
    if (!latestBlockNumberCid) {
      await this.client.pin.add(newBlockNumberCid, { name: 'spg_latest_block_number' })
      this.logger.info('Created new latest block number pin', { blockNumber })
      this._listCache.delete(BLOCK_NUMBER_LABEL);
    } else if (!latestBlockNumberCid.equals(newBlockNumberCid)) {
      await this.client.pin.update(latestBlockNumberCid, newBlockNumberCid)
      this.logger.info('Updated latest block number pin', { 
        oldBlockNumber: dataTypeToCidDecodeFn('number')(latestBlockNumberCid),
        newBlockNumber: blockNumber 
      })
      this._listCache.delete(BLOCK_NUMBER_LABEL);
    } else {
      this.logger.debug('Latest block number unchanged', { blockNumber })
    }
  }
}