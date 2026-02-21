import { CID } from 'multiformats/cid'
import { identity } from 'multiformats/hashes/identity'
import * as raw from 'multiformats/codecs/raw'
import all from 'it-all'

const DEFAULT_PEER_DISCOVERY_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_PEER_DISCOVERY_TIMEOUT_MS = 20 * 1000
const DEFAULT_PEER_DISCOVERY_PROVIDERS = 20

const getPeerDiscoveryTag = (namespace) => {
  if (namespace === '1') return 'spg-mainnet'
  if (namespace === '11155111') return 'spg-sepolia'
  return `spg-${namespace}`
}

const createIdentityCid = (tag) => {
  const bytes = new TextEncoder().encode(tag)
  return CID.createV1(raw.code, identity.digest(bytes))
}

export class PeerDiscovery {
  constructor({ client, logger, namespace, disable = false }) {
    this.client = client
    this.logger = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }
    this.namespace = String(namespace)
    this.disable = Boolean(disable)
    this.tag = getPeerDiscoveryTag(this.namespace)
    this.cid = createIdentityCid(this.tag)
    this.intervalMs = DEFAULT_PEER_DISCOVERY_INTERVAL_MS
    this.timeoutMs = DEFAULT_PEER_DISCOVERY_TIMEOUT_MS
    this.providersTarget = DEFAULT_PEER_DISCOVERY_PROVIDERS
    this.intervalId = null
    this.inFlight = false
    this.abort = null
    this.localPeerId = null
  }

  async start() {
    if (this.disable) {
      this.logger.info('Peer discovery disabled')
      return
    }
    if (this.intervalId) {
      return
    }
    try {
      const idInfo = await this.client.id()
      this.localPeerId = idInfo?.id?.toString?.() || idInfo?.id || null
    } catch (error) {
      this.logger.warn('Unable to read local peer id for discovery', { error: error.message })
    }
    this.logger.info('Starting peer discovery', {
      tag: this.tag,
      cid: this.cid.toString(),
      intervalMs: this.intervalMs
    })
    try {
      await this.#announceAndDiscover('startup')
    } catch (error) {
      this.logger.warn('Peer discovery startup failed', {
        error: error.message,
        stack: error.stack
      })
    }
    this.intervalId = setInterval(() => {
      this.#announceAndDiscover('interval').catch((error) => {
        this.logger.warn('Peer discovery tick failed', {
          error: error.message,
          stack: error.stack
        })
      })
    }, this.intervalMs)
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.abort) {
      this.abort.abort()
      this.abort = null
    }
  }

  async #announceAndDiscover(reason) {
    if (this.inFlight) {
      this.logger.debug('Peer discovery already running', { reason })
      return
    }
    this.inFlight = true
    try {
      await this.#providePeerDiscoveryCid(reason)
      await this.#connectToDiscoveryPeers(reason)
    } finally {
      this.inFlight = false
    }
  }

  async #providePeerDiscoveryCid(reason) {
    try {
      await all(await this.client.routing.provide(this.cid))
      this.logger.debug('Provided peer discovery CID', {
        reason,
        tag: this.tag,
        cid: this.cid.toString()
      })
    } catch (error) {
      this.logger.warn('Failed to provide peer discovery CID', {
        error: error.message,
        reason,
        tag: this.tag,
        cid: this.cid.toString()
      })
    }
  }

  async #connectToDiscoveryPeers(reason) {
    const seenPeers = new Set()
    const connectedPeers = new Set()
    const attemptedAddrs = new Set()
    let connected = 0
    let attempted = 0

    const abortController = new AbortController()
    this.abort = abortController
    const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs)
    try {
      for await (const event of this.client.routing.findProvs(this.cid, {
        numProviders: this.providersTarget,
        signal: abortController.signal
      })) {
        const eventProviders = event?.providers || []
        if (eventProviders.length === 0) continue
        for (const provider of eventProviders) {
          const peerId = provider?.id?.toString?.() || provider?.id
          if (!peerId) continue
          if (this.localPeerId && peerId === this.localPeerId) continue
          seenPeers.add(peerId)
          if (connectedPeers.has(peerId)) continue
          const addrs = (provider.multiaddrs || [])
            .map(addr => addr.toString())
            .filter(Boolean)
          if (addrs.length === 0) continue
          let connectedPeer = false
          for (const addr of addrs) {
            const addrWithPeer = addr.includes('/p2p/') ? addr : `${addr}/p2p/${peerId}`
            if (attemptedAddrs.has(addrWithPeer)) continue
            attemptedAddrs.add(addrWithPeer)
            attempted += 1
            try {
              await this.client.swarm.connect(addrWithPeer)
              connected += 1
              connectedPeer = true
              connectedPeers.add(peerId)
              this.logger.debug('Connected to peer discovery provider', {
                peerId,
                addr: addrWithPeer,
                reason,
                tag: this.tag
              })
              break
            } catch (error) {
              this.logger.debug('Failed to connect to peer discovery provider', {
                peerId,
                addr: addrWithPeer,
                error: error.message
              })
            }
          }
          if (!connectedPeer) {
            this.logger.debug('No reachable addresses for peer discovery provider', {
              peerId,
              reason,
              tag: this.tag
            })
          }
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        this.logger.debug('Peer discovery query timed out', {
          reason,
          timeoutMs: this.timeoutMs
        })
      } else {
        this.logger.warn('Peer discovery query failed', {
          error: error.message,
          reason,
          stack: error.stack
        })
      }
    } finally {
      clearTimeout(timeoutId)
      if (this.abort === abortController) {
        this.abort = null
      }
    }

    if (seenPeers.size === 0) {
      this.logger.debug('No peer discovery providers found', {
        reason,
        tag: this.tag
      })
      return
    }

    this.logger.info('Peer discovery connections complete', {
      reason,
      tag: this.tag,
      providers: seenPeers.size,
      attempted,
      connected
    })
  }
}
