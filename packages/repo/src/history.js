import { CID } from 'multiformats/cid'
import { carFromBytes, assert, emptyUnixfs, cat } from '@simplepg/common'
import all from 'it-all'

const normalizeCid = (value, fieldName) => {
  if (!value) return null
  try {
    return CID.parse(value.toString())
  } catch (error) {
    throw new Error(`Invalid CID for ${fieldName}: ${error.message}`)
  }
}

const normalizeEntry = (entry) => {
  assert(entry?.cid, 'History entry missing CID')
  const cid = normalizeCid(entry.cid, 'cid')
  const parents = Array.isArray(entry.parents)
    ? entry.parents
      .map(parent => normalizeCid(parent, 'parents'))
      .filter(Boolean)
    : []
  const rawBlock = entry.blockNumber
  const blockNumber = rawBlock === null || rawBlock === undefined ? null : Number(rawBlock)
  return {
    ...entry,
    cid,
    parents,
    blockNumber: Number.isFinite(blockNumber) ? blockNumber : null
  }
}

const parseIndexHtml = (html) => {
  if (typeof DOMParser === 'undefined') {
    return { domain: null, version: null, title: null }
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const domainMeta = doc.querySelector('meta[name="ens-domain"]')
    const versionMeta = doc.querySelector('meta[name="version"]')
    const domain = domainMeta?.getAttribute('content') || null
    const version = versionMeta?.getAttribute('content') || null
    const title = doc.querySelector('title')?.textContent?.trim() || null
    return { domain, version, title }
  } catch (_error) {
    return { domain: null, version: null, title: null }
  }
}

/**
 * A class for retrieving SimplePage history entries.
 */
export class History {
  #domain
  #dservice
  #viemClient
  #repoRoot
  #initPromise
  #resolveInitPromise

  constructor(domain, dservice) {
    this.#domain = domain
    this.#dservice = dservice
    this.#initPromise = new Promise((resolve) => {
      this.#resolveInitPromise = resolve
    })
  }

  init(viemClient, repoRootCid) {
    this.#viemClient = viemClient
    this.#repoRoot = repoRootCid
    this.#resolveInitPromise()
  }

  setRepoRoot(repoRootCid) {
    this.#repoRoot = repoRootCid
  }

  async get() {
    await this.#initPromise

    const response = await this.#dservice.fetch(`/history?domain=${encodeURIComponent(this.#domain)}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`)
    }

    const carBytes = new Uint8Array(await response.arrayBuffer())
    const car = carFromBytes(carBytes, { verify: true })
    const root = car.get(car.roots[0])
    assert(root?.entries, 'Missing history entries in response')

    const { fs, blockstore } = emptyUnixfs()
    // Process all blocks in parallel using Promise.all
    await Promise.all(
      (await all(car.blocks)).map(block => blockstore.put(block.cid, block.payload))
    );

    const indexMetaByCid = new Map()
    const getIndexMeta = async (cid) => {
      const key = cid.toString()
      if (indexMetaByCid.has(key)) return indexMetaByCid.get(key)
      try {
        const html = await cat(fs, cid, 'index.html')
        const meta = parseIndexHtml(html)
        indexMetaByCid.set(key, meta)
        return meta
      } catch (_error) {
        indexMetaByCid.set(key, null)
        return null
      }
    }

    const normalizedEntries = root.entries.map(normalizeEntry)
    const entriesWithMeta = await Promise.all(normalizedEntries.map(async (entry) => {
      const meta = await getIndexMeta(entry.cid)
      return {
        ...entry,
        domain: meta?.domain || entry.domain || null,
        version: meta?.version || entry.version || null,
        title: meta?.title || null,
      }
    }))

    const entries = entriesWithMeta
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
}
