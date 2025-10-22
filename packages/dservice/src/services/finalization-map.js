import all from 'it-all'
import { CID } from 'multiformats/cid'
import { assert } from '@simplepg/common'

export class FinalizationMap {
  constructor(ipfsClient, logger) {
    this.client = ipfsClient
    this.logger = logger
    this.cid = null // Keep current CID in memory
    this.updateQueue = Promise.resolve() // Queue for atomic updates
  }

  async #getCid() {
    if (this.cid) {
      return this.cid
    }
    const pins = await all(await this.client.pin.ls({ name: 'spg_finalizations' }))
    if (pins.length === 0) {
      return null
    }
    assert(pins.length === 1, 'Expected exactly one finalizations pin, got ' + pins.length)
    this.cid = pins[0].cid
    return this.cid
  }

  async #get() {
    const cid = await this.#getCid()
    if (!cid) {
      return {}
    }
    try {
      const node = await this.client.dag.get(cid)
      return node.value || {}
    } catch (error) {
      this.logger.warn('Could not read finalizations DAG', { 
        cid: cid.toString(), 
        error: error.message 
      })
      return {}
    }
  }

  async #set(finalizations) {
    // const oldCid = this.cid
    try {
      const cid = await this.client.dag.put(finalizations, { 
        codec: 'dag-cbor',
        hashAlg: 'sha2-256'
      })
      const existingPins = await all(await this.client.pin.ls({ name: 'spg_finalizations' }))
      if (existingPins.length > 0) {
        await this.client.pin.update(existingPins[0].cid, cid)
      } else {
        await this.client.pin.add(cid, { name: 'spg_finalizations', recursive: true })
      }
      this.cid = cid
      this.logger.debug('Updated finalizations DAG', { 
        cid: cid.toString(),
        domainCount: Object.keys(finalizations).length 
      })
      return cid
    } catch (error) {
      this.logger.error('Error updating finalizations DAG', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  async getAll(domain) {
    const finalizations = await this.#get()
    return finalizations[domain] || []
  }

  async list() {
    const finalizations = await this.#get()
    return Object.keys(finalizations)
  }

  async push(domain, blockNumber, cid) {
    assert(cid instanceof CID, 'cid must be a CID')
    // Atomic: read-modify-write in queue
    return this.updateQueue = this.updateQueue.then(async () => {
      const allFinalizations = await this.#get();
      const arr = allFinalizations[domain] || [];
      const idx = arr.findIndex(f => f.blockNumber === blockNumber);
      const finalization = { blockNumber, cid: cid };
      if (idx >= 0) arr[idx] = finalization;
      else arr.push(finalization);
      arr.sort((a, b) => a.blockNumber - b.blockNumber);
      allFinalizations[domain] = arr;
      return this.#set(allFinalizations);
    });
  }

  async remove(domain) {
    // Atomic: read-modify-write in queue
    return this.updateQueue = this.updateQueue.then(async () => {
      const allFinalizations = await this.#get();
      delete allFinalizations[domain];
      return this.#set(allFinalizations);
    });
  }

  async isFinalized(domain, blockNumber, cid) {
    assert(cid instanceof CID, 'cid must be a CID')
    const domainFinalizations = await this.getAll(domain);
    const found = domainFinalizations.find(f => f.blockNumber === blockNumber && f.cid.equals(cid));
    return !!found;
  }
} 