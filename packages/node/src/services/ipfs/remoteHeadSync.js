const DOMAIN_OCAPS_DIR_NAME = '_ocaps'
const isDirEntry = (entry) => entry?.type === 'dir' || entry?.type === 1
const isFileEntry = (entry) => entry?.type === 'file' || entry?.type === 0
const decodeRefPathSegment = (value) => decodeURIComponent(value)

const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000

export class RemoteHeadSync {
  constructor({ client, peerDiscovery, logger, refIndex, capabilityStore, subscriptionIndex, publishRoot, syncIntervalMs = DEFAULT_SYNC_INTERVAL_MS }) {
    this.client = client
    this.peerDiscovery = peerDiscovery
    this.logger = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }
    this.refIndex = refIndex
    this.capabilityStore = capabilityStore
    this.subscriptionIndex = subscriptionIndex
    this.publishRoot = publishRoot
    this.syncIntervalMs = syncIntervalMs
    this.intervalId = null
    this.startPromise = null
    this.stopped = true
    this.syncInFlight = false
    this.lastPeerRoots = new Map()
  }

  async start() {
    if (this.intervalId) {
      return
    }
    if (this.startPromise) {
      this.stopped = false
      return this.startPromise
    }

    this.stopped = false
    this.startPromise = (async () => {
      await this.sync().catch(error => {
        this.logger.warn('Initial refs root sync failed', {
          error: error.message,
          stack: error.stack,
        })
      })

      if (this.stopped) {
        return
      }

      this.intervalId = setInterval(() => {
        this.sync().catch(error => {
          this.logger.warn('Periodic refs root sync failed', {
            error: error.message,
            stack: error.stack,
          })
        })
      }, this.syncIntervalMs)
    })().finally(() => {
      this.startPromise = null
    })

    return this.startPromise
  }

  stop() {
    this.stopped = true
    if (!this.intervalId) {
      return
    }
    clearInterval(this.intervalId)
    this.intervalId = null
  }

  async sync(discoveredPeers = null) {
    if (this.syncInFlight) {
      this.logger.debug('Refs root sync already running')
      return false
    }

    this.syncInFlight = true
    try {
      const peersToSync = discoveredPeers?.length > 0
        ? discoveredPeers
        : await this.#discoverPeers()

      if (!peersToSync || peersToSync.length === 0) {
        return false
      }

      let changed = false
      for (const peerId of peersToSync) {
        if (!peerId) {
          continue
        }

        const rootCid = await this.#resolvePeerRoot(peerId)
        if (!rootCid) {
          continue
        }

        const rootCidString = rootCid.toString()
        if (this.lastPeerRoots.get(peerId) === rootCidString) {
          continue
        }

        try {
          changed ||= await this.#syncPeerRoot(peerId, rootCid)
        } catch (error) {
          this.logger.debug('Skipping unreachable peer refs root', {
            peerId,
            rootCid: rootCidString,
            error: error.message,
          })
          continue
        }

        this.lastPeerRoots.set(peerId, rootCidString)
      }

      if (changed && typeof this.publishRoot === 'function') {
        await this.publishRoot().catch(error => {
          this.logger.warn('Failed to publish refs root after sync', {
            error: error.message,
            stack: error.stack,
          })
        })
      }

      return changed
    } finally {
      this.syncInFlight = false
    }
  }

  async #discoverPeers() {
    if (this.peerDiscovery && typeof this.peerDiscovery.getPeers === 'function') {
      const discovered = this.peerDiscovery.getPeers()
      if (discovered?.length > 0) {
        return discovered
      }
    }

    return []
  }

  async #resolvePeerRoot(peerId) {
    try {
      const results = []
      for await (const result of await this.client.name.resolve(`/ipns/${peerId}`, { nocache: true })) {
        results.push(result)
      }
      const resolvedPath = results.at(-1)
      if (!resolvedPath?.startsWith('/ipfs/')) {
        return null
      }

      return resolvedPath.slice('/ipfs/'.length)
    } catch (error) {
      this.logger.debug('Could not resolve peer refs root', {
        peerId,
        error: error.message,
      })
      return null
    }
  }

  async #readRemoteFile(path, maxBytes, description) {
    const chunks = []
    let bytesRead = 0
    for await (const chunk of this.client.cat(path)) {
      bytesRead += chunk.length
      if (bytesRead > maxBytes) {
        throw new Error(`${description} exceeds ${maxBytes} byte size limit`)
      }
      chunks.push(chunk)
    }

    return Buffer.concat(chunks)
  }

  async #syncPeerRoot(peerId, rootCid) {
    let changed = false

    for await (const domainEntry of this.client.ls(rootCid)) {
      if (!isDirEntry(domainEntry)) {
        continue
      }

      const domainPathSegment = domainEntry.name
      const domain = decodeRefPathSegment(domainPathSegment)
      if (!await this.#hasActiveLocalSubscription(domain)) {
        this.logger.debug('Skipping remote refs for unsubscribed domain', { peerId, domain })
        continue
      }

      for await (const childEntry of this.client.ls(domainEntry.cid)) {
        if (!isDirEntry(childEntry)) {
          continue
        }

        if (decodeRefPathSegment(childEntry.name) === DOMAIN_OCAPS_DIR_NAME) {
          changed ||= await this.#syncCapabilitiesDir(peerId, rootCid, domain, domainPathSegment, childEntry)
          continue
        }

        changed ||= await this.#syncRefDir(peerId, rootCid, domain, domainPathSegment, childEntry)
      }
    }

    return changed
  }

  async #hasActiveLocalSubscription(domain) {
    if (!this.subscriptionIndex || typeof this.subscriptionIndex.getStatus !== 'function') {
      return false
    }

    try {
      const status = await this.subscriptionIndex.getStatus(domain)
      return status.status === 'active'
    } catch (error) {
      this.logger.warn('Error reading local subscription status for remote refs sync', {
        domain,
        error: error.message,
      })
      return false
    }
  }

  async #syncCapabilitiesDir(peerId, rootCid, domain, domainPathSegment, dirEntry) {
    if (!this.capabilityStore) {
      return false
    }

    let changed = false
    for await (const capabilityEntry of this.client.ls(dirEntry.cid)) {
      if (!isFileEntry(capabilityEntry) || !capabilityEntry.name.endsWith('.json')) {
        continue
      }
      if (capabilityEntry.size !== undefined && capabilityEntry.size > 100_000) {
        this.logger.debug('Skipping oversized remote capability payload', { peerId, domain, file: capabilityEntry.name, size: capabilityEntry.size })
        continue
      }

      const capabilityPath = `${rootCid}/${domainPathSegment}/${dirEntry.name}/${capabilityEntry.name}`
      try {
        const rawContent = await this.#readRemoteFile(capabilityPath, 100_000, 'Capability payload')
        changed ||= await this.capabilityStore.syncRemoteCapability({
          peerId,
          domain,
          fileName: capabilityEntry.name,
          rawContent,
        })
      } catch (error) {
        this.logger.warn('Skipping unreadable remote capability payload', {
          peerId,
          domain,
          file: capabilityEntry.name,
          error: error.message,
        })
      }
    }

    return changed
  }

  async #syncRefDir(peerId, rootCid, domain, domainPathSegment, refDirEntry) {
    if (!this.refIndex) {
      return false
    }

    let changed = false
    const refId = decodeRefPathSegment(refDirEntry.name)
    for await (const versionEntry of this.client.ls(refDirEntry.cid)) {
      if (!isFileEntry(versionEntry)) {
        continue
      }
      if (versionEntry.size !== undefined && versionEntry.size > 1024) {
        this.logger.debug('Skipping oversized remote ref pointer', { peerId, domain, refId, size: versionEntry.size })
        continue
      }

      const refPath = `${rootCid}/${domainPathSegment}/${refDirEntry.name}/${versionEntry.name}`
      try {
        const rawContent = await this.#readRemoteFile(refPath, 1024, 'Ref pointer')
        const envelopeCid = new TextDecoder().decode(rawContent).trim()
        changed ||= await this.refIndex.syncRemoteRef({ peerId, domain, refId, envelopeCid })
      } catch (error) {
        this.logger.warn('Skipping unreadable remote ref pointer', {
          peerId,
          domain,
          refId,
          error: error.message,
        })
      }
    }

    return changed
  }
}
