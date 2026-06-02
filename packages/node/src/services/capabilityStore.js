import { verifyCapability } from '@simplepg/common'
import { decodeDomainPathSegment } from './ipfs/mfsStore.js'

const DEFAULT_CAPABILITY_TTL_MS = 30 * 60 * 1000
const DEFAULT_CAPABILITY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000

const domainKey = (domain, key) => `${domain}::${key}`
const encodeCapabilityPathSegment = (value) => encodeURIComponent(value)
const decodeCapabilityPathSegment = (value) => decodeURIComponent(value)

export class CapabilityStore {
  #viemClient
  #chainId
  #logger
  #entries
  #cleanupIntervalMs
  #cleanupTimer
  #ttlMs
  #mfs
  #publishRoot
  #verifyCapabilityFn

  constructor({
    viemClient,
    chainId,
    logger,
    ttlMs = DEFAULT_CAPABILITY_TTL_MS,
    cleanupIntervalMs = DEFAULT_CAPABILITY_CLEANUP_INTERVAL_MS,
    mfs = null,
    publishRoot = null,
    verifyCapabilityRecord = null,
  }) {
    this.#viemClient = viemClient
    this.#chainId = chainId
    this.#logger = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }
    this.#entries = new Map()
    this.#cleanupIntervalMs = cleanupIntervalMs
    this.#cleanupTimer = null
    this.#ttlMs = ttlMs
    this.#mfs = mfs
    this.#publishRoot = publishRoot
    this.#verifyCapabilityFn = verifyCapabilityRecord
  }

  async start() {
    if (!this.#cleanupTimer) {
      if (this.#mfs) {
        await this.#loadPersistedCapabilities()
      }

      this.pruneExpired()
      this.#cleanupTimer = setInterval(() => {
        try {
          this.pruneExpired()
        } catch (error) {
          this.#logger.warn('Capability pruning failed', {
            error: error.message,
            stack: error.stack,
          })
        }
      }, this.#cleanupIntervalMs)
    }
  }

  stop() {
    if (this.#cleanupTimer) {
      clearInterval(this.#cleanupTimer)
      this.#cleanupTimer = null
    }

  }

  pruneExpired(now = Date.now()) {
    const expiredEntries = []
    for (const [key, entry] of this.#entries.entries()) {
      if (entry.expiresAtMs <= now) {
        this.#entries.delete(key)
        expiredEntries.push(entry)
      }
    }

    if (expiredEntries.length > 0) {
      void this.#deleteStoredEntries(expiredEntries)
    }
  }

  async putCapability(payload) {
    const normalizedDomain = typeof payload?.domain === 'string' && payload.domain.trim().length > 0
      ? payload.domain.trim()
      : null
    if (!normalizedDomain) {
      throw new Error('Missing capability domain')
    }

    const verified = await this.#verifyCapabilityRecord(payload, normalizedDomain)
    const { capability } = await this.storeVerifiedCapability(verified)
    return capability
  }

  getCapability(domain, key) {
    this.pruneExpired()
    const entry = this.#entries.get(domainKey(domain, key))
    return entry ? this.#toPublicCapability(entry) : null
  }

  listCapabilities(domain) {
    this.pruneExpired()
    const entries = []
    for (const entry of this.#entries.values()) {
      if (entry.domain === domain) {
        entries.push(this.#toPublicCapability(entry))
      }
    }
    entries.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
    return entries
  }

  async storeVerifiedCapability(record, { publish = true, persist = true } = {}) {
    const stored = this.#normalizeStoredCapability(record)
    const key = domainKey(stored.domain, stored.key)
    const previous = this.#entries.get(key)
    const previousContent = previous ? JSON.stringify(this.#serializePersistedCapability(previous)) : null
    const nextContent = JSON.stringify(this.#serializePersistedCapability(stored))
    const changed = previousContent !== nextContent

    this.#entries.set(key, stored)

    if (this.#mfs && persist && changed) {
      const capabilityDir = await this.#mfs.getDomainOcapsDir(stored.domain)
      const capabilityPath = await this.#getCapabilityPath(stored.domain, stored.key)
      await this.#mfs.ensureDir(capabilityDir)
      await this.#mfs.writeFile(capabilityPath, nextContent, { updateRootPin: true })

      if (publish) {
        await this.#publishRootSafe('capability update')
      }
    }

    return {
      capability: this.#toPublicCapability(stored),
      stored: changed,
    }
  }

  async syncRemoteCapability({ peerId, domain, fileName, rawContent }) {
    let parsed
    try {
      parsed = JSON.parse(new TextDecoder().decode(rawContent))
    } catch (error) {
      this.#logger.warn('Skipping invalid remote capability payload', {
        peerId,
        domain,
        file: fileName,
        error: error.message,
      })
      return false
    }

    try {
      const didKey = this.#getDidKeyFromFileName(fileName)
      const verified = await this.#verifyCapabilityRecord({
        domain,
        didKey,
        key: didKey,
        ...parsed,
      }, domain)
      const result = await this.storeVerifiedCapability(verified, { publish: false })
      return result.stored
    } catch (error) {
      this.#logger.warn('Skipping unverifiable remote capability', {
        peerId,
        domain,
        file: fileName,
        error: error.message,
      })
      return false
    }
  }

  async #loadPersistedCapabilities() {
    await this.#mfs.ensureRootDir()
    const domainEntries = await this.#mfs.listDir(this.#mfs.refsDir)

    for (const domainEntry of domainEntries) {
      const domain = domainEntry?.name ? decodeDomainPathSegment(domainEntry.name) : null
      if (!domain) {
        continue
      }

      const capabilityDir = await this.#mfs.getDomainOcapsDir(domain)
      const capabilityEntries = await this.#mfs.listDir(capabilityDir)
      for (const capabilityEntry of capabilityEntries) {
        if (!capabilityEntry.name.endsWith('.json')) {
          continue
        }

        const capabilityPath = `${capabilityDir}/${capabilityEntry.name}`
        const rawContent = await this.#mfs.readFile(capabilityPath)
        if (!rawContent) {
          continue
        }

        try {
          const parsed = JSON.parse(rawContent)
          const didKey = this.#getDidKeyFromFileName(capabilityEntry.name)
          const verified = await this.#verifyCapabilityRecord({
            domain,
            didKey,
            key: didKey,
            ...parsed,
          }, domain)
          await this.storeVerifiedCapability(verified, { publish: false, persist: false })
        } catch (error) {
          this.#logger.warn('Dropping invalid persisted capability', {
            domain,
            file: capabilityEntry.name,
            error: error.message,
          })
          await this.#mfs.removePath(capabilityPath)
        }
      }
    }
  }

  async #verifyCapabilityRecord(record, expectedDomain) {
    if (typeof this.#verifyCapabilityFn === 'function') {
      return this.#verifyCapabilityFn(record, { expectedDomain })
    }

    if (!this.#viemClient || !this.#chainId) {
      throw new Error('Capability verification client is not configured')
    }

    return verifyCapability(record, {
      expectedDomain,
      expectedChainId: this.#chainId,
      expectedAgentName: record?.agentName,
      viemClient: this.#viemClient,
    })
  }

  #normalizeStoredCapability(record) {
    const messageExpiry = record.expiresAt ? new Date(record.expiresAt).getTime() : null
    const expiresAtMs = Number.isFinite(messageExpiry)
      ? messageExpiry
      : Date.now() + this.#ttlMs

    return {
      ...record,
      key: record.didKey,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
    }
  }

  async #getCapabilityPath(domain, key) {
    return `${await this.#mfs.getDomainOcapsDir(domain)}/${encodeCapabilityPathSegment(key)}.json`
  }

  #serializePersistedCapability(entry) {
    return {
      siweMessage: entry.siweMessage,
      siweSignature: entry.siweSignature,
    }
  }

  #getDidKeyFromFileName(fileName) {
    if (typeof fileName !== 'string' || !fileName.endsWith('.json')) {
      throw new Error('Invalid capability file name')
    }

    return decodeCapabilityPathSegment(fileName.slice(0, -'.json'.length))
  }

  async #deleteStoredEntries(entries) {
    if (!this.#mfs || entries.length === 0) {
      return
    }

    for (const entry of entries) {
      const capabilityPath = await this.#getCapabilityPath(entry.domain, entry.key)
      await this.#mfs.removePath(capabilityPath)
    }

    await this.#publishRootSafe('capability prune')
  }

  async #publishRootSafe(reason) {
    if (typeof this.#publishRoot !== 'function') {
      return
    }

    await this.#publishRoot().catch(error => {
      this.#logger.warn(`Failed to publish refs root after ${reason}`, {
        error: error.message,
        stack: error.stack,
      })
    })
  }

  #toPublicCapability(entry) {
    return {
      domain: entry.domain,
      key: entry.key,
      didKey: entry.didKey,
      siweMessage: entry.siweMessage,
      siweSignature: entry.siweSignature,
      ownerAddress: entry.ownerAddress,
      issuedAt: entry.issuedAt,
      expiresAt: entry.expiresAt,
      nonce: entry.nonce,
      agentName: entry.agentName || null,
    }
  }
}
