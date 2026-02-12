import { CID } from 'multiformats/cid'
import { carFromBytes, assert } from '@simplepg/common'

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

    console.log('History response', {
      domain: this.#domain,
      entries: root.entries,
    })

    const entries = root.entries.map(normalizeEntry)
    entries.sort((a, b) => {
      if (a.blockNumber && b.blockNumber) {
        return b.blockNumber - a.blockNumber
      }
      if (a.blockNumber) return -1
      if (b.blockNumber) return 1
      return 0
    })

    const entryMap = new Map(entries.map(entry => [entry.cid.toString(), entry]))
    const keep = new Set()
    const stack = []

    if (this.#repoRoot) {
      const repoRootKey = this.#repoRoot.toString()
      if (entryMap.has(repoRootKey)) {
        stack.push(repoRootKey)
      }
    }

    if (stack.length === 0) {
      for (const entry of entries) {
        if (entry.domain === this.#domain) {
          stack.push(entry.cid.toString())
        }
      }
    }

    while (stack.length > 0) {
      const cid = stack.pop()
      if (keep.has(cid)) continue
      const entry = entryMap.get(cid)
      if (!entry) continue
      keep.add(cid)
      for (const parent of entry.parents || []) {
        const parentKey = parent.toString()
        if (!keep.has(parentKey)) {
          stack.push(parentKey)
        }
      }
    }

    if (keep.size === 0) {
      return entries
    }

    return entries.filter(entry => keep.has(entry.cid.toString()))
  }
}
