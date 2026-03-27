import { CarBlock } from 'cartonne'
import { CID } from 'multiformats/cid'
import all from 'it-all'
import { JSDOM } from 'jsdom'
import { emptyCar } from '@simplepg/common'

const HISTORY_SCHEMA_VERSION = 1
const HISTORY_SLOW_LOG_MS = 10 * 1000
const DOMParser = new JSDOM().window.DOMParser

const sortEntries = (entries) => {
  entries.sort((a, b) => {
    if (a.blockNumber && b.blockNumber) {
      return b.blockNumber - a.blockNumber
    }
    if (a.blockNumber) return -1
    if (b.blockNumber) return 1
    return 0
  })
  return entries
}

const parseIndexMeta = async (client, indexCid) => {
  const chunks = await all(await client.cat(indexCid))
  const indexContent = new TextDecoder().decode(Buffer.concat(chunks))
  const doc = new DOMParser().parseFromString(indexContent, 'text/html')
  const domainMeta = doc.querySelector('meta[name="ens-domain"]')
  const versionMeta = doc.querySelector('meta[name="version"]')
  return {
    domain: domainMeta?.getAttribute('content') || null,
    version: versionMeta?.getAttribute('content') || null
  }
}

export class HistoryIndex {
  #client
  #getFinalizations
  #mfs
  #logger
  #cacheWritePromises

  constructor({
    client,
    getFinalizations,
    mfs,
    logger
  }) {
    this.#client = client
    this.#getFinalizations = getFinalizations
    this.#mfs = mfs
    this.#logger = logger || { info: () => {}, debug: () => {}, warn: () => {} }
    this.#cacheWritePromises = new Map()
  }

  async getHistory(domain) {
    const startedAt = Date.now()
    this.#logger.info('Building history response', { domain })
    const entries = await this.#ensureHistoryIndex(domain)
    const carBytes = await this.#buildHistoryCarBytes(entries, domain)
    this.#logger.info('History response ready', {
      domain,
      entries: entries.length,
      bytes: carBytes.length,
      durationMs: Date.now() - startedAt
    })
    return carBytes
  }

  async ensureHistoryIndexes() {
    const domains = await this.#mfs.listDomains()
    for (const domain of domains) {
      const existing = await this.#readHistoryIndex(domain)
      if (existing) continue
      const entries = await this.#buildHistoryIndex(domain)
      await this.#persistHistoryIndex(domain, entries)
    }
  }

  async updateHistoryIndexes({ domain, cid, txHash, blockNumber }) {
    try {
      if (!txHash || !cid) return
      const cidKey = cid.toString()
      const normalizedBlockNumber = Number(blockNumber)
      const entryBlockNumber = Number.isFinite(normalizedBlockNumber) ? normalizedBlockNumber : null

      await this.#refreshHistoryIndex(domain)

      const domains = await this.#mfs.listDomains()
      const otherDomains = domains.filter(otherDomain => otherDomain !== domain)
      await Promise.all(otherDomains.map(async otherDomain => {
        const entries = await this.#readHistoryIndex(otherDomain)
        if (!entries || entries.length === 0) return
        if (!entries.some(entry => entry.cid === cidKey)) return
        if (entries.some(entry => entry.tx === txHash)) return
        const baseEntry = entries.find(entry => entry.cid === cidKey)
        if (!baseEntry) return
        const nextEntries = entries
          .filter(entry => !(entry.cid === cidKey && (entry.tx === null || entry.tx === undefined)))
          .concat({
            cid: cidKey,
            tx: txHash,
            blockNumber: entryBlockNumber,
            domain: baseEntry.domain || null,
            version: baseEntry.version || null,
            parents: Array.isArray(baseEntry.parents) ? [...baseEntry.parents] : []
          })
        await this.#writeHistoryIndex(otherDomain, sortEntries(nextEntries), { updateRootPin: false })
      }))
    } catch (error) {
      this.#logger.warn('Error updating history index', {
        error: error.message,
        cid: cid?.toString?.(),
        domain,
        blockNumber,
        txHash,
        stack: error.stack
      })
    }
  }

  async #buildHistoryIndex(domain) {
    const mainHistory = await this.#withSlowLog('History finalizations read still running', {
      domain
    }, async () => this.#getFinalizations(domain))
    this.#logger.debug('Building history index from finalizations', {
      domain,
      finalizations: mainHistory.length
    })
    const historyEntriesByCid = new Map()
    const knownTxs = new Set()
    const auxDomains = new Set()
    const metaByCid = new Map()
    const parentsByCid = new Map()
    const chainCids = new Set()

    const collectRoot = async rootCid => {
      const cidKey = rootCid.toString()
      if (chainCids.has(cidKey)) return
      chainCids.add(cidKey)
      await this.#withSlowLog('History root traversal still running', {
        domain,
        cid: cidKey
      }, async () => {
        const parents = []
        for await (const entry of this.#client.ls(rootCid)) {
          switch (entry.name) {
            case 'index.html': {
              const meta = await parseIndexMeta(this.#client, entry.cid)
              metaByCid.set(cidKey, meta)
              if (meta.domain && meta.domain !== domain) {
                auxDomains.add(meta.domain)
              }
              break
            }
            case '_prev': {
              for await (const prevEntry of this.#client.ls(entry.cid)) {
                parents.push(prevEntry.cid)
                await collectRoot(prevEntry.cid)
              }
              break
            }
            default:
              break
          }
        }
        if (parents.length > 0) {
          parentsByCid.set(cidKey, parents)
        }
      })
    }

    const addHistoryEntry = (entry) => {
      const txHash = entry.txHash
      if (!txHash || knownTxs.has(txHash)) return
      knownTxs.add(txHash)
      const cidKey = entry.cid.toString()
      const existing = historyEntriesByCid.get(cidKey) || []
      existing.push({
        tx: txHash,
        blockNumber: entry.blockNumber
      })
      historyEntriesByCid.set(cidKey, existing)
    }

    for (const entry of mainHistory) {
      addHistoryEntry(entry)
    }
    for (const { cid } of mainHistory) {
      await collectRoot(cid)
    }

    for (const auxDomain of auxDomains) {
      const auxHistory = await this.#withSlowLog('Auxiliary history finalizations read still running', {
        domain,
        auxDomain
      }, async () => this.#getFinalizations(auxDomain))
      for (const entry of auxHistory) {
        if (!chainCids.has(entry.cid.toString())) continue
        addHistoryEntry(entry)
      }
    }

    const entries = []
    for (const cidKey of chainCids) {
      const meta = metaByCid.get(cidKey) || {}
      const parents = parentsByCid.get(cidKey) || []
      const historyEntries = historyEntriesByCid.get(cidKey) || []
      if (historyEntries.length === 0) {
        entries.push({
          cid: cidKey,
          tx: null,
          blockNumber: null,
          domain: meta.domain || null,
          version: meta.version || null,
          parents: parents.map(parent => parent.toString())
        })
        continue
      }
      for (const entry of historyEntries) {
        entries.push({
          cid: cidKey,
          tx: entry.tx,
          blockNumber: entry.blockNumber,
          domain: meta.domain || null,
          version: meta.version || null,
          parents: parents.map(parent => parent.toString())
        })
      }
    }

    const sortedEntries = sortEntries(entries)
    this.#logger.debug('History index built', {
      domain,
      entries: sortedEntries.length,
      roots: chainCids.size,
      auxDomains: auxDomains.size
    })
    return sortedEntries
  }

  #normalizeEntryForCar(entry) {
    return {
      ...entry,
      cid: CID.parse(entry.cid.toString()),
      parents: Array.isArray(entry.parents)
        ? entry.parents.map(parent => CID.parse(parent.toString()))
        : []
    }
  }

  async #buildHistoryCarBytes(entries, domain) {
    const historyCar = emptyCar()
    const entriesForCar = entries.map(entry => this.#normalizeEntryForCar(entry))
    this.#logger.debug('Encoding history response root', {
      domain,
      entries: entriesForCar.length
    })
    historyCar.put({ entries: entriesForCar }, { isRoot: true })
    this.#logger.debug('History response root encoded', {
      domain,
      entries: entriesForCar.length
    })
    await this.#addHistoryBlocksFromEntries(entriesForCar, historyCar, domain)
    return historyCar.bytes
  }

  async #addHistoryBlocksFromEntries(entries, historyCar, domain) {
    const visitedBlocks = new Set()
    const addBlock = async cid => {
      const cidKey = cid.toString()
      if (visitedBlocks.has(cidKey)) return
      const block = await this.#client.block.get(cid)
      visitedBlocks.add(cidKey)
      historyCar.blocks.put(new CarBlock(cid, block))
    }

    const uniqueCids = new Map()
    for (const entry of entries) {
      const cidKey = entry.cid.toString()
      if (!uniqueCids.has(cidKey)) {
        uniqueCids.set(cidKey, entry.cid)
      }
    }

    this.#logger.debug('Collecting history response blocks', {
      domain,
      roots: uniqueCids.size
    })

    const collectRootBlocks = async rootCid => {
      const cidKey = rootCid.toString()
      await this.#withSlowLog('History CAR root collection still running', {
        domain,
        cid: cidKey
      }, async () => {
        await addBlock(rootCid)
        for await (const entry of this.#client.ls(rootCid)) {
          switch (entry.name) {
            case 'index.html':
            case '_prev':
              await addBlock(entry.cid)
              break
            default:
              break
          }
        }
      })
    }

    await Promise.all([...uniqueCids.values()].map(rootCid => collectRootBlocks(rootCid)))
  }

  async #getHistoryPath(domain) {
    return `${await this.#mfs.getDomainDir(domain)}/history.json`
  }

  async #readHistoryIndex(domain) {
    const path = await this.#getHistoryPath(domain)
    const content = await this.#mfs.readFile(path)
    if (!content) return null
    try {
      const parsed = JSON.parse(content)
      if (parsed?.schemaVersion !== HISTORY_SCHEMA_VERSION) return null
      if (!Array.isArray(parsed?.entries)) return null
      return parsed.entries
    } catch (_error) {
      return null
    }
  }

  async #writeHistoryIndex(domain, entries, { updateRootPin = false } = {}) {
    const path = await this.#getHistoryPath(domain)
    const payload = {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      entries
    }
    await this.#mfs.writeFile(path, JSON.stringify(payload), { updateRootPin })
  }

  async #ensureHistoryIndex(domain) {
    const existing = await this.#withSlowLog('History index read still running', {
      domain
    }, async () => this.#readHistoryIndex(domain))
    if (existing) {
      this.#logger.debug('Using cached history index', {
        domain,
        entries: existing.length
      })
      return existing
    }
    this.#logger.info('History index cache miss, rebuilding', { domain })
    const entries = await this.#withSlowLog('History index rebuild still running', {
      domain
    }, async () => this.#buildHistoryIndex(domain))
    const exists = await this.#withSlowLog('History domain existence check still running', {
      domain
    }, async () => this.#mfs.domainExists(domain))
    if (entries.length > 0 || exists) {
      this.#scheduleHistoryIndexWrite(domain, entries)
    }
    return entries
  }

  async #refreshHistoryIndex(domain) {
    const entries = await this.#buildHistoryIndex(domain)
    await this.#persistHistoryIndex(domain, entries)
    return entries
  }

  #scheduleHistoryIndexWrite(domain, entries) {
    if (this.#cacheWritePromises.has(domain)) {
      this.#logger.debug('History index cache write already running', { domain })
      return
    }
    const promise = this.#persistHistoryIndex(domain, entries)
      .catch((error) => {
        this.#logger.warn('Failed to persist history index cache', {
          domain,
          error: error.message,
          stack: error.stack
        })
      })
      .finally(() => {
        if (this.#cacheWritePromises.get(domain) === promise) {
          this.#cacheWritePromises.delete(domain)
        }
      })
    this.#cacheWritePromises.set(domain, promise)
  }

  async #persistHistoryIndex(domain, entries) {
    this.#logger.debug('Persisting history index cache', {
      domain,
      entries: entries.length
    })
    await this.#withSlowLog('History cache directory ensure still running', {
      domain
    }, async () => this.#mfs.ensureDir(await this.#mfs.getDomainDir(domain)))
    await this.#withSlowLog('History cache write still running', {
      domain,
      entries: entries.length
    }, async () => this.#writeHistoryIndex(domain, entries, { updateRootPin: false }))
    this.#logger.debug('History index cache persisted', {
      domain,
      entries: entries.length
    })
  }

  async #withSlowLog(message, meta, fn) {
    const startedAt = Date.now()
    let warned = false
    const timeoutId = setTimeout(() => {
      warned = true
      this.#logger.warn(message, {
        ...meta,
        thresholdMs: HISTORY_SLOW_LOG_MS,
        durationMs: Date.now() - startedAt
      })
    }, HISTORY_SLOW_LOG_MS)
    try {
      return await fn()
    } finally {
      clearTimeout(timeoutId)
      if (warned) {
        this.#logger.info('Slow history operation finished', {
          ...meta,
          durationMs: Date.now() - startedAt
        })
      }
    }
  }
}
