import { create } from 'kubo-rpc-client'
import { CarBlock } from 'cartonne'
import { CID } from 'multiformats/cid'
import { identity } from 'multiformats/hashes/identity'
import varint from 'varint'
import all from 'it-all'
import * as u8a from 'uint8arrays'
import assert from 'assert'
import { carFromBytes, emptyCar } from '@simplepg/common'

const dataTypeToCidEncodeFn = dataType => {
  if (dataType === 'string') {
    return s => CID.create(1, 0x55, identity.digest(u8a.fromString(s, 'utf8')))
  } else if (dataType === 'address') {
    return a => CID.create(1, 0x55, identity.digest(u8a.fromString(a.slice(2), 'hex')))
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
    this.logger = logger
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
    const self = this
    async function collectFiles(currentCid, path = '', isRoot = false) {
      for await (const entry of self.client.ls(currentCid)) {
        // Only descend into directories that don't start with _ if at root
        if (entry.type === 'dir') {
          if (isRoot && entry.name.startsWith('_')) continue
          neededCids.add(entry.cid.toString())
          await collectFiles(entry.cid, path + entry.name + '/', false)
        // } else if (["index.html", "index.md", "_template.html"].includes(entry.name)) {
        } else if (["index.html", "index.md", "_template.html", "manifest.webmanifest"].includes(entry.name)) {
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

  async isPageFinalized(cid, domain, blockNumber) {
    assert(cid instanceof CID, `cid must be an instance of CID, got ${typeof cid}`)
    const finalLabel = `spg_final_${domain}_${blockNumber}`
    const finalPins = await all(await this.client.pin.ls({
      name: finalLabel
    }))
    if (finalPins.length === 0) {
      return false
    }
    assert(finalPins[0].cid.equals(cid), `Finalized CID does not match: ${finalPins[0].cid.toString()} !== ${cid}`)
    assert(finalPins.length === 1, 'Expected exactly one final pin, got ' + finalPins.length)
    return true
  }

  async finalizePage(cid, domain, blockNumber) {
    assert(cid instanceof CID, `cid must be an instance of CID, got ${typeof cid}`)
    try {
      this.logger.info('Finalizing page', { 
        cid: cid.toString(), 
        domain, 
        blockNumber 
      })
      
      // Create new final pin first
      const finalLabel = `spg_final_${domain}_${blockNumber}`

      await this.client.pin.add(cid, { recursive: true, name: finalLabel })
      this.logger.info('Page finalized successfully', { 
        cid: cid.toString(), 
        label: finalLabel 
      })
      
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
    const pins = await all(await this.client.pin.ls({ name: 'spg_final_' }))
    return pins.map(pin => pin.name.split('_')[2])
  }

  async nukePage(domain) {
    try {
      this.logger.info('Nuking page', { domain })
      
      // Get all final pins for the domain
      const pinRoots = await all(await this.client.pin.ls({
        name: `spg_final_${domain}`
      }))
      
      // Collect all CIDs that need to be checked for removal
      const cidsToCheck = []
      for (const pin of pinRoots) {
        const recursiveCids = await this.#collectChildCids(pin.cid)
        cidsToCheck.push(...recursiveCids)
      }
      
      // Remove all final pins for this domain
      for (const pin of pinRoots) {
        await this.client.pin.rm(pin.cid, { recursive: true })
        this.logger.info('Removed pin', { 
          pinName: pin.name, 
          pinCid: pin.cid.toString() 
        })
      }

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
          await all(this.client.block.rm(cid))
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
        pinsRemoved: pinRoots.length,
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
    try {
      this.logger.debug('Starting staged pin pruning')
      
      // Get all pins with spg_staged_ prefix
      const stagedPins = await this.client.pin.ls({
        name: 'spg_staged_'
      })
      
      const now = Math.floor(Date.now() / 1000)
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
    const pins = await all(await this.client.pin.ls({ name: `spg_list_${name}` }))

    const decodeFn = dataTypeToCidDecodeFn(dataType)
    return pins.map(pin => decodeFn(pin.cid))
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
    const cid = await this._getLatestBlockNumberCid()
    if (!cid) {
      this.logger.debug('No latest block number found, returning 0')
      return 0
    }
    // Decode the CID to get the block number
    const blockNumber = dataTypeToCidDecodeFn('number')(cid)
    this.logger.debug('Retrieved latest block number', { blockNumber })
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
    } else if (!latestBlockNumberCid.equals(newBlockNumberCid)) {
      await this.client.pin.update(latestBlockNumberCid, newBlockNumberCid)
      this.logger.info('Updated latest block number pin', { 
        oldBlockNumber: dataTypeToCidDecodeFn('number')(latestBlockNumberCid),
        newBlockNumber: blockNumber 
      })
    } else {
      this.logger.debug('Latest block number unchanged', { blockNumber })
    }
  }
}