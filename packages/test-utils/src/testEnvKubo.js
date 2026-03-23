import { createNode } from 'ipfsd-ctl'
import { path } from 'kubo'
import { create } from 'kubo-rpc-client'
import Path from 'path'
import os from 'os'
import fs from 'fs'
import net from 'net'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

const sleep = async (ms) => new Promise(resolve => setTimeout(resolve, ms))

const isLoopbackAddr = (addr) => {
  return addr.includes('/ip4/127.0.0.1/') || addr.includes('/ip6/::1/')
}

export class TestEnvironmentKubo {
  constructor(options = {}) {
    this.options = {
      offline: options.offline ?? true,
      localOnly: options.localOnly ?? true,
      disableMdns: options.disableMdns ?? true,
      bootstrap: options.bootstrap ?? [],
      apiPort: options.apiPort ?? null,
      gatewayPort: options.gatewayPort ?? null,
      swarmPort: options.swarmPort ?? null,
    }
    this.node = null;
    this.kuboApi = null
    this.apiPort = null
    this.gatewayPort = null
    this.swarmPort = null
    this.url = null
    this.testRepoPath = Path.join(os.tmpdir(), `ipfs-test-${Date.now()}-${randomSuffix()}`)
  }

  async findAvailablePort() {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        server.close(() => resolve(port))
      })
    })
  }

  async #configureLocalOnlyNetworking() {
    if (this.options.offline || !this.options.localOnly) return

    const bootstrap = Array.isArray(this.options.bootstrap)
      ? this.options.bootstrap
      : []

    try {
      await this.kuboApi.bootstrap.rm.all()
    } catch (_error) {
      // Ignore bootstrap cleanup errors in tests
    }

    for (const addr of bootstrap) {
      try {
        await this.kuboApi.bootstrap.add(addr)
      } catch (_error) {
        // Ignore malformed or unsupported bootstrap add errors in tests
      }
    }

    if (this.options.disableMdns) {
      try {
        await this.kuboApi.config.set('Discovery.MDNS.Enabled', false)
      } catch (_error) {
        // Not all Kubo versions expose the same config APIs
      }
    }

    try {
      await this.kuboApi.config.set('Swarm.DisableNatPortMap', true)
    } catch (_error) {
      // Ignore if unsupported
    }

    await sleep(100)
  }

  async start() {
    this.apiPort = this.options.apiPort || await this.findAvailablePort()
    this.gatewayPort = this.options.gatewayPort || await this.findAvailablePort()
    this.swarmPort = this.options.swarmPort || await this.findAvailablePort()

    this.node = await createNode({
      type: 'kubo',
      test: true,
      disposable: true,
      bin: path(),
      rpc: create,
      args: [
        '--api', `/ip4/127.0.0.1/tcp/${this.apiPort}`,
        '--gateway', `/ip4/127.0.0.1/tcp/${this.gatewayPort}`,
        '--swarm', `/ip4/127.0.0.1/tcp/${this.swarmPort}`,
        ...(this.options.offline ? ['--offline'] : []),
        '--repo', this.testRepoPath
      ]
    })
    this.url = `http://localhost:${this.apiPort}`
    this.kuboApi = this.node.api
    await this.#configureLocalOnlyNetworking()
    return this.kuboApi
  }

  async getPeerInfo() {
    if (!this.kuboApi) throw new Error('Kubo is not started')
    const id = await this.kuboApi.id()
    const peerId = id?.id?.toString?.() || id?.id
    const addresses = (id?.addresses || [])
      .map(addr => addr?.toString?.() || addr)
      .filter(Boolean)
    return { peerId, addresses }
  }

  async connectTo(otherNode) {
    if (!this.kuboApi) throw new Error('Kubo is not started')
    if (!otherNode?.kuboApi) throw new Error('Target Kubo node is not started')

    const { peerId, addresses } = await otherNode.getPeerInfo()
    if (!peerId) {
      throw new Error('Target Kubo peer id not found')
    }

    const loopbackAddrs = addresses.filter(isLoopbackAddr)
    let lastError = null
    for (const addr of loopbackAddrs) {
      const addrWithPeer = addr.includes('/p2p/') ? addr : `${addr}/p2p/${peerId}`
      try {
        await this.kuboApi.swarm.connect(addrWithPeer)
        return addrWithPeer
      } catch (error) {
        const message = error?.message || ''
        if (message.includes('already connected')) {
          return addrWithPeer
        }
        lastError = error
      }
    }

    throw new Error(`Failed to connect to peer ${peerId}${lastError ? `: ${lastError.message}` : ''}`)
  }

  async stop() {
    if (this.node) {
      await this.node.stop()
    }
    // clean up test repo
    if (fs.existsSync(this.testRepoPath)) {
      fs.rmSync(this.testRepoPath, { recursive: true, force: true });
    }
  }
}
