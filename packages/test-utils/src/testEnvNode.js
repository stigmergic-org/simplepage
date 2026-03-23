import { TestEnvironmentMultiNode } from './testEnvMultiNode.js'

export class TestEnvironmentNode {
  constructor(options = {}) {
    this.options = options
    this.multi = null
    this.node = null

    this.addresses = null
    this.evm = null
    this.kubo = null
    this.kuboApi = null
    this.dservice = null
    this.dservicePort = null
    this.dserviceUrl = null
  }

  #syncPublicFields() {
    this.addresses = this.multi?.addresses || null
    this.evm = this.multi?.evm || null
    this.node = this.multi?.nodes?.[0] || null
    this.kubo = this.node?.kubo || null
    this.kuboApi = this.node?.kuboApi || null
    this.dservice = this.node?.dservice || null
    this.dservicePort = this.node?.dservicePort || null
    this.dserviceUrl = this.node?.dserviceUrl || null
  }

  async start({ evmOptions = {}, nodeOptions = {} } = {}) {
    this.multi = new TestEnvironmentMultiNode()

    const baseNodeOptions = {
      ...(this.options.nodeOptions || {}),
      ...(nodeOptions || {})
    }

    const mergedNodeOptions = {
      ...baseNodeOptions,
      kuboOptions: {
        offline: true,
        ...(this.options.kuboOptions || {}),
        ...(this.options.nodeOptions?.kuboOptions || {}),
        ...(nodeOptions.kuboOptions || {})
      },
      dserviceConfig: {
        ...(this.options.dserviceConfig || {}),
        ...(this.options.nodeOptions?.dserviceConfig || {}),
        ...(nodeOptions.dserviceConfig || {})
      }
    }

    await this.multi.start({
      nodeCount: 1,
      evmOptions: {
        ...(this.options.evmOptions || {}),
        ...evmOptions
      },
      nodeOptions: mergedNodeOptions
    })

    this.#syncPublicFields()
    return this.addresses
  }

  async waitUntilBlockIsIndexed(blockNumber, options = {}) {
    if (!this.node) {
      throw new Error('Node environment not started')
    }
    await this.node.waitUntilBlockIsIndexed(blockNumber, options)
  }

  async stop() {
    if (this.multi) {
      await this.multi.stop()
      this.multi = null
    }
    this.#syncPublicFields()
  }
}
