import all from 'it-all'
import * as dagCbor from '@ipld/dag-cbor'
import { LRUCache } from 'lru-cache'
import { CID } from 'multiformats/cid'

import { REF_ENVELOPE_KIND, REF_OCAP_GRACE_MS, REF_PAYLOAD_KIND, REF_SCHEMA_VERSION, normalizeRefRecord, parseSiweMessage, verifyRefRecord } from '@simplepg/common'
import { decodeDomainPathSegment } from './mfsStore.js'

const DOMAIN_OCAPS_DIR_NAME = '_ocaps'

const sanitizePinSegment = (value) => String(value).replace(/[^a-zA-Z0-9.-]/g, '_')
const encodeRefPathSegment = (value) => encodeURIComponent(value)
const decodeRefPathSegment = (value) => decodeURIComponent(value)
const isOcapsDir = (name) => {
  const decodedName = decodeRefPathSegment(name)
  return decodedName === DOMAIN_OCAPS_DIR_NAME
}
const normalizeEnvelopeCid = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) {
      throw new Error('Missing envelope CID')
    }
    return normalized
  }

  const cid = CID.asCID(value)
  if (cid) {
    return cid.toString()
  }

  throw new Error('Invalid envelope CID')
}
const toBlockBytes = async (value) => {
  if (value instanceof Uint8Array) {
    return value
  }
  if (value && typeof value[Symbol.asyncIterator] === 'function') {
    return Buffer.concat(await all(value))
  }

  throw new Error('Invalid block payload')
}

const sortRefs = (refs) => refs.sort((a, b) => {
  if (b.sequence !== a.sequence) {
    return b.sequence - a.sequence
  }
  return b.issuedAt.localeCompare(a.issuedAt)
})

export class RefIndex {
  #client
  #mfs
  #logger
  #viemClient
  #chainId
  #verifyRecord
  #lastPublishedCid
  #refOcapGraceMs
  #cleanupIntervalMs
  #cleanupTimer
  #listCache

  constructor({
    client,
    mfs,
    logger,
    viemClient = null,
    chainId = null,
    verifyRecord = null,
    refOcapGraceMs = REF_OCAP_GRACE_MS,
    cleanupIntervalMs = 60 * 60 * 1000,
  }) {
    this.#client = client
    this.#mfs = mfs
    this.#logger = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }
    this.#viemClient = viemClient
    this.#chainId = chainId
    this.#verifyRecord = verifyRecord
    this.#lastPublishedCid = null
    this.#refOcapGraceMs = refOcapGraceMs
    this.#cleanupIntervalMs = cleanupIntervalMs
    this.#cleanupTimer = null
    this.#listCache = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 })
  }

  async start() {
    await this.#mfs.ensureRootDir()
    await this.pruneExpiredRefs().catch(error => {
      this.#logger.warn('Failed to prune expired refs on startup', {
        error: error.message,
        stack: error.stack
      })
    })
    await this.publishRoot().catch(error => {
      this.#logger.warn('Failed to publish refs root on startup', {
        error: error.message,
        stack: error.stack
      })
    })
    if (!this.#cleanupTimer) {
      this.#cleanupTimer = setInterval(() => {
        this.pruneExpiredRefs().catch(error => {
          this.#logger.warn('Failed to prune expired refs', {
            error: error.message,
            stack: error.stack
          })
        })
      }, this.#cleanupIntervalMs)
    }
  }

  async stop() {
    if (this.#cleanupTimer) {
      clearInterval(this.#cleanupTimer)
      this.#cleanupTimer = null
    }
  }

  async listRefs(domain) {
    const cached = this.#listCache.get(domain)
    if (cached) {
      return cached
    }

    const domainRefsDir = await this.#mfs.getDomainRefsDir(domain)
    const refDirs = await this.#mfs.listDir(domainRefsDir)
    const refs = []

    for (const refDir of refDirs) {
      if (isOcapsDir(refDir.name)) {
        continue
      }

      const versionsDir = `${domainRefsDir}/${refDir.name}`
      const versionEntries = await this.#mfs.listDir(versionsDir)
      for (const versionEntry of versionEntries) {
        if (versionEntry.type === 'dir') {
          continue
        }

        const entry = await this.#readEntry(`${versionsDir}/${versionEntry.name}`, {
          verify: true,
          expectedDomain: domain,
          allowedExpiredMs: this.#refOcapGraceMs,
        })
        if (!entry || entry.record.refId !== decodeRefPathSegment(refDir.name)) {
          continue
        }
        refs.push(entry.record)
      }
    }

    const latestSequenceByRefId = new Map()
    for (const ref of refs) {
      const current = latestSequenceByRefId.get(ref.refId)
      if (typeof current !== 'number' || ref.sequence > current) {
        latestSequenceByRefId.set(ref.refId, ref.sequence)
      }
    }

    const result = sortRefs(refs).map(ref => ({
      ...ref,
      latest: latestSequenceByRefId.get(ref.refId) === ref.sequence,
    }))
    this.#listCache.set(domain, result)
    return result
  }

  async getLatestRef(domain, refId) {
    const refDir = `${await this.#mfs.getDomainRefsDir(domain)}/${encodeRefPathSegment(refId)}`
    const versionEntries = await this.#mfs.listDir(refDir)
    let latestRecord = null

    for (const versionEntry of versionEntries) {
      if (versionEntry.type === 'dir') {
        continue
      }

      const entry = await this.#readEntry(`${refDir}/${versionEntry.name}`)
      if (!entry || entry.record.refId !== refId) {
        continue
      }

      if (!latestRecord || entry.record.sequence > latestRecord.sequence) {
        latestRecord = entry.record
      }
    }

    return latestRecord
  }

  async storeVerifiedRef(record, envelopeCid, { publish = true } = {}) {
    const normalizedRecord = {
      schemaVersion: REF_SCHEMA_VERSION,
      ...record,
      contentCid: CID.parse(record.contentCid).toString(),
    }
    const normalizedEnvelopeCid = CID.parse(envelopeCid).toString()
    const latestRecord = await this.getLatestRef(normalizedRecord.domain, normalizedRecord.refId)
    if (latestRecord && latestRecord.didKey !== normalizedRecord.didKey) {
      throw new Error(`Ref ${normalizedRecord.refId} is claimed by a different did:key`)
    }
    if (latestRecord && normalizedRecord.sequence <= latestRecord.sequence) {
      throw new Error(`Ref ${normalizedRecord.refId} sequence must be higher than ${latestRecord.sequence}`)
    }

    const refDir = `${await this.#mfs.getDomainRefsDir(normalizedRecord.domain)}/${encodeRefPathSegment(normalizedRecord.refId)}`
    const refPath = `${refDir}/${normalizedRecord.sequence}`
    const nextContent = normalizedEnvelopeCid
    const existing = await this.#mfs.readFile(refPath)

    if (existing) {
      if (existing !== nextContent) {
        throw new Error('Ref version conflict')
      }
      return {
        record: normalizedRecord,
        stored: false
      }
    }

    await this.#pinRef(normalizedRecord, normalizedEnvelopeCid)
    await this.#mfs.ensureDir(refDir)
    await this.#mfs.writeFile(refPath, nextContent, { updateRootPin: true })
    this.#listCache.delete(normalizedRecord.domain)

    if (publish) {
      await this.publishRoot().catch(error => {
        this.#logger.warn('Failed to publish refs root after local update', {
          error: error.message,
          stack: error.stack
        })
      })
    }

    return {
      record: normalizedRecord,
      stored: true
    }
  }

  async publishRoot() {
    await this.#mfs.ensureRootDir()
    const stat = await this.#client.files.stat(this.#mfs.refsDir)
    const cid = stat?.cid
    if (!cid) {
      return null
    }

    if (this.#lastPublishedCid?.equals?.(cid)) {
      return cid
    }

    await this.#client.name.publish(`/ipfs/${cid.toString()}`, {
      key: 'self'
    })

    this.#lastPublishedCid = cid
    this.#logger.debug('Published refs root to IPNS', {
      cid: cid.toString()
    })
    return cid
  }

  async validateRecord(record, expectedDomain) {
    return this.#verifyRemoteRecord(record, expectedDomain)
  }

  async syncRemoteRef({ peerId, domain, refId, envelopeCid }) {
    try {
      const { record } = await this.#loadEntryFromEnvelopeCid(envelopeCid)
      const verified = await this.#verifyRemoteRecord(record, domain, { allowedExpiredMs: this.#refOcapGraceMs })
      const result = await this.storeVerifiedRef(verified, envelopeCid, { publish: false })
      return result.stored
    } catch (error) {
      this.#logger.warn('Skipping unverifiable remote ref', {
        peerId,
        domain,
        refId,
        error: error.message
      })
      return false
    }
  }

  async pruneExpiredRefs(now = Date.now()) {
    await this.#mfs.ensureRootDir()
    const domainDirs = await this.#mfs.listDir(this.#mfs.refsDir)
    let pruned = 0

    for (const domainDir of domainDirs) {
      const domain = domainDir.name ? decodeDomainPathSegment(domainDir.name) : null
      if (!domain) {
        continue
      }

      const domainRefsDir = await this.#mfs.getDomainRefsDir(domain)
      const refDirs = await this.#mfs.listDir(domainRefsDir)
      for (const refDir of refDirs) {
        if (isOcapsDir(refDir.name)) {
          continue
        }

        const versionsDir = `${domainRefsDir}/${refDir.name}`
        const versionEntries = await this.#mfs.listDir(versionsDir)
        for (const versionEntry of versionEntries) {
          if (versionEntry.type === 'dir') {
            continue
          }

          const path = `${versionsDir}/${versionEntry.name}`
          const content = await this.#mfs.readFile(path)
          if (!content || content.trim().startsWith('{')) {
            continue
          }

          try {
            const entry = await this.#loadEntryFromEnvelopeCid(content.trim())
            if (!this.#isOutsideOcapGrace(entry.record, now)) {
              continue
            }

            await this.#mfs.removePath(path)
            await this.#unpinRef(entry.record, entry.envelopeCid)
            this.#listCache.delete(entry.record.domain)
            pruned += 1
          } catch (error) {
            this.#logger.debug('Skipping ref during expiry prune', {
              path,
              error: error.message,
            })
          }
        }
      }
    }

    if (pruned > 0) {
      await this.publishRoot().catch(error => {
        this.#logger.warn('Failed to publish refs root after ref prune', {
          error: error.message,
          stack: error.stack
        })
      })
    }

    return pruned
  }

  async #verifyRemoteRecord(record, expectedDomain, { allowedExpiredMs = 0 } = {}) {
    if (typeof this.#verifyRecord === 'function') {
      return this.#verifyRecord(record, { expectedDomain, allowedExpiredMs })
    }

    if (!this.#viemClient || !this.#chainId) {
      throw new Error('Ref verification client is not configured')
    }

    return verifyRefRecord(record, {
      expectedDomain,
      expectedChainId: this.#chainId,
      viemClient: this.#viemClient,
      allowedExpiredMs,
    })
  }

  async #pinRef(record, envelopeCid) {
    const cid = CID.parse(envelopeCid)
    const pinName = `spg_${sanitizePinSegment(this.#chainId || 'refs')}_ref_${sanitizePinSegment(record.domain)}_${sanitizePinSegment(record.refId)}_${record.sequence}`
    await this.#client.pin.add(cid, {
      recursive: true,
      name: pinName
    })
  }

  async #unpinRef(record, envelopeCid) {
    if (!this.#client.pin || typeof this.#client.pin.rm !== 'function') {
      return
    }

    const cid = CID.parse(envelopeCid)
    const pinName = `spg_${sanitizePinSegment(this.#chainId || 'refs')}_ref_${sanitizePinSegment(record.domain)}_${sanitizePinSegment(record.refId)}_${record.sequence}`
    await this.#client.pin.rm(cid, { name: pinName }).catch(error => {
      this.#logger.debug('Failed to unpin expired ref', {
        domain: record.domain,
        refId: record.refId,
        sequence: record.sequence,
        error: error.message,
      })
    })
  }

  #isOutsideOcapGrace(record, now) {
    try {
      const expirationTime = parseSiweMessage(record.siweMessage).expirationTime
      if (!expirationTime) {
        return false
      }

      const expiresAtMs = new Date(expirationTime).getTime()
      if (!Number.isFinite(expiresAtMs)) {
        return false
      }

      return expiresAtMs + this.#refOcapGraceMs <= now
    } catch (_error) {
      return false
    }
  }

  async #readEntry(path, { verify = false, expectedDomain = null, allowedExpiredMs = 0 } = {}) {
    const content = await this.#mfs.readFile(path)
    if (!content) {
      return null
    }
    if (content.trim().startsWith('{')) {
      return null
    }

    try {
      return await this.#loadEntryFromEnvelopeCid(content.trim(), { verify, expectedDomain, allowedExpiredMs })
    } catch (error) {
      this.#logger.debug('Skipping unreadable ref entry', {
        path,
        error: error.message
      })
      return null
    }
  }

  async #loadEntryFromEnvelopeCid(envelopeCid, { verify = false, expectedDomain = null, allowedExpiredMs = 0 } = {}) {
    const normalizedEnvelopeCid = normalizeEnvelopeCid(envelopeCid)
    const envelope = dagCbor.decode(await toBlockBytes(await this.#client.block.get(normalizedEnvelopeCid)))

    if (!envelope || envelope.kind !== REF_ENVELOPE_KIND) {
      throw new Error('Invalid ref envelope')
    }
    if (Number(envelope.schemaVersion ?? REF_SCHEMA_VERSION) !== REF_SCHEMA_VERSION) {
      throw new Error('Unsupported ref envelope schema version')
    }

    const refCid = CID.asCID(envelope.ref)
    if (!refCid) {
      throw new Error('Ref envelope is missing payload link')
    }

    const payload = dagCbor.decode(await toBlockBytes(await this.#client.block.get(refCid)))
    if (!payload || payload.kind !== REF_PAYLOAD_KIND) {
      throw new Error('Invalid ref payload')
    }
    if (Number(payload.schemaVersion ?? REF_SCHEMA_VERSION) !== REF_SCHEMA_VERSION) {
      throw new Error('Unsupported ref payload schema version')
    }

    let record = normalizeRefRecord({
      domain: payload.domain,
      refId: payload.refId,
      sequence: payload.sequence,
      didKey: payload.didKey,
      contentCid: payload.contentCid,
      siweMessage: payload.siweMessage,
      siweSignature: payload.siweSignature,
      signature: envelope.signature,
    })
    if (verify) {
      record = await this.#verifyRemoteRecord(record, expectedDomain || record.domain, { allowedExpiredMs })
    }

    return {
      envelopeCid: normalizedEnvelopeCid,
      record,
    }
  }
}
