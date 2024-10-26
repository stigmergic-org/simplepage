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
  constructor({ api, ipfsClient, maxStagedAge = 60 * 60 }) { // Default 1 hour
    assert(api || ipfsClient, 'api or ipfsClient must be provided')
    this.client = ipfsClient || create({ url: api })
    this.maxStagedAge = maxStagedAge
  }

  async writeCar(fileBuffer, stageDomain) {
    try {
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
      console.log(`Staged ${rootCid} with label: ${label}`)

      return rootCid
    } catch (error) {
      console.error('Error importing CAR file:', error)
      throw error
    }
  }

  async healthCheck() {
    try {
      await this.client.id()
      return true
    } catch (error) {
      console.error('Error checking IPFS health:', error)
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
      // Create new final pin first
      const finalLabel = `spg_final_${domain}_${blockNumber}`

      await this.client.pin.add(cid, { recursive: true, name: finalLabel })
      console.log(`Finalized ${cid} with label: ${finalLabel}`)
      
      // Remove all staged pins
      const stagedPins = await this.client.pin.ls({
        name: `spg_staged_${domain}`
      })
      for await (const pin of stagedPins) {
        await this.client.pin.rm(pin.cid, { recursive: true })
      }
    } catch (error) {
      console.error('Error finalizing DAG:', error)
      throw error
    }
  }

  async listFinalizedPages() {
    const pins = await all(await this.client.pin.ls({ name: 'spg_final_' }))
    return pins.map(pin => pin.name.split('_')[2])
  }

  async nukePage(domain) {
    try {
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
        console.log(`Removed pin ${pin.name}: ${pin.cid}`)
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
          console.log(`Removed block: ${cid}`)
        } catch (error) {
          // Block might already be removed or not exist
          console.log(`Block ${cid} already removed or doesn't exist`)
        }
      }
    } catch (error) {
      console.error('Error pruning page:', error)
      throw error
    }
  }

  async #collectChildCids(rootCid) {
    try {
      const car = await this.#readCar(rootCid)
      const cids = await all(car.blocks.cids())
      return cids
    } catch (error) {
      console.log(`Could not collect children for CID ${rootCid}:`, error.message)
    }
  }

  async pruneStaged() {
    try {
      // Get all pins with spg_staged_ prefix
      const stagedPins = await this.client.pin.ls({
        name: 'spg_staged_'
      })
      
      const now = Math.floor(Date.now() / 1000)
      
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
              console.log(`Pruned old staged pin: ${pin.name}`)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error pruning staged pins:', error)
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
    }
  }

  async removeFromList(name, dataType, value) {
    const list = await this._getList(name, dataType)

    if (list.includes(value)) {
      const itemCid = dataTypeToCidEncodeFn(dataType)(value)
      await this.client.pin.rm(itemCid, { name: `spg_list_${name}` })
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
      return 0
    }
    // Decode the CID to get the block number
    return dataTypeToCidDecodeFn('number')(cid)
  }

  async setLatestBlockNumber(blockNumber) {
    // get current latest block number cid
    const latestBlockNumberCid = await this._getLatestBlockNumberCid()
    // generate given block number cid
    const newBlockNumberCid = dataTypeToCidEncodeFn('number')(blockNumber)

    if (!latestBlockNumberCid) {
      await this.client.pin.add(newBlockNumberCid, { name: 'spg_latest_block_number' })
    } else if (!latestBlockNumberCid.equals(newBlockNumberCid)) {
      await this.client.pin.update(latestBlockNumberCid, newBlockNumberCid)
    }
  }
}