import net from 'net'

import { DService } from '@simplepg/node'

import { TestEnvironmentEvm } from './testEnvEvm.js'
import { TestEnvironmentKubo } from './testEnvKubo.js'

const TEMPLATE_DOMAIN = 'new.simplepage.eth'

const sleep = async (ms) => new Promise(resolve => setTimeout(resolve, ms))

const findAvailablePort = async () => {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export class TestEnvironmentDServiceNode {
  constructor({
    evm,
    addresses,
    chainId,
    kuboOptions = {},
    dserviceConfig = {},
  }) {
    this.evm = evm
    this.addresses = addresses
    this.chainId = String(chainId)
    this.kuboOptions = kuboOptions
    this.dserviceConfig = dserviceConfig

    this.kubo = null
    this.kuboApi = null
    this.dservice = null
    this.dservicePort = null
    this.dserviceUrl = null
  }

  async start() {
    this.kubo = new TestEnvironmentKubo({
      offline: false,
      localOnly: true,
      disableMdns: true,
      bootstrap: [],
      ...this.kuboOptions,
    })
    this.kuboApi = await this.kubo.start()

    this.dservicePort = await findAvailablePort()
    this.dserviceUrl = `http://localhost:${this.dservicePort}`

    const config = {
      ipfs: {
        ipfsClient: this.kuboApi,
        disablePeerDiscovery: true,
        disableProvide: true,
      },
      api: {
        port: this.dservicePort,
        host: 'localhost',
        rateLimits: {
          upload: {
            enabled: false,
          },
        },
      },
      blockchain: {
        rpcUrl: this.evm.url,
        startBlock: 1,
        chainId: this.chainId,
        universalResolver: this.addresses.universalResolver,
        simplePageAddress: this.addresses.simplepage,
      },
      silent: true,
      ...this.dserviceConfig,
    }

    this.dservice = new DService(config)
    await this.dservice.start()
  }

  async connectTo(node) {
    await this.kubo.connectTo(node.kubo)
  }

  async waitUntilBlockIsIndexed(blockNumber, {
    timeoutMs = 45_000,
    intervalMs = 250,
  } = {}) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const current = Number(this.dservice?.indexer?.currentBlock || 0)
      if (current >= Number(blockNumber)) return
      await sleep(intervalMs)
    }
    throw new Error(`Timed out waiting for node indexer to reach block ${blockNumber}`)
  }

  async waitUntilCidIsServed(cid, {
    timeoutMs = 45_000,
    intervalMs = 500,
  } = {}) {
    const cidString = cid.toString()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.dserviceUrl}/page?cid=${encodeURIComponent(cidString)}`)
        if (response.ok) {
          await response.arrayBuffer()
          return
        }
      } catch (_error) {
        // keep retrying
      }
      await sleep(intervalMs)
    }
    throw new Error(`Timed out waiting for node to serve page CID ${cidString}`)
  }

  async stop() {
    if (this.dservice) {
      await this.dservice.stop()
    }
    if (this.kubo) {
      await this.kubo.stop()
    }
  }
}

export class TestEnvironmentMultiNode {
  constructor(options = {}) {
    this.options = options
    this.evm = null
    this.addresses = null
    this.nodes = []
  }

  get dserviceUrls() {
    return this.nodes.map(node => node.dserviceUrl)
  }

  async start({
    nodeCount = 2,
    evmOptions = {},
    nodeOptions = {},
  } = {}) {
    this.evm = new TestEnvironmentEvm()
    this.addresses = await this.evm.start(evmOptions)

    for (let i = 0; i < nodeCount; i++) {
      await this.startNode(nodeOptions)
    }
    return this
  }

  async startNode(nodeOptions = {}) {
    if (!this.evm || !this.addresses) {
      throw new Error('Multi-node environment must start EVM before adding nodes')
    }

    const node = new TestEnvironmentDServiceNode({
      evm: this.evm,
      addresses: this.addresses,
      chainId: this.evm.chainId,
      ...nodeOptions,
    })
    await node.start()
    this.nodes.push(node)

    await this.connectAllNodes()
    return node
  }

  async connectAllNodes() {
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = 0; j < this.nodes.length; j++) {
        if (i === j) continue
        await this.nodes[i].connectTo(this.nodes[j])
      }
    }
  }

  setTemplateDserviceEndpoints({
    domain = TEMPLATE_DOMAIN,
    resolver = this.addresses?.resolver1,
  } = {}) {
    if (!this.addresses || !this.evm) {
      throw new Error('Multi-node environment is not started')
    }
    this.evm.setResolver(this.addresses.universalResolver, domain, resolver)
    this.evm.setTextRecord(resolver, domain, 'dservice', this.dserviceUrls.join('\n'))
  }

  async waitUntilBlockIsIndexed(blockNumber, options = {}) {
    await Promise.all(this.nodes.map(node => node.waitUntilBlockIsIndexed(blockNumber, options)))
  }

  async waitUntilCidIsServedByAll(cid, options = {}) {
    await Promise.all(this.nodes.map(node => node.waitUntilCidIsServed(cid, options)))
  }

  async stop() {
    for (const node of [...this.nodes].reverse()) {
      await node.stop()
    }
    this.nodes = []
    if (this.evm) {
      await this.evm.stop()
      this.evm = null
    }
    this.addresses = null
  }
}
