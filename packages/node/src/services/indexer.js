import { createPublicClient, encodePacked, http, keccak256 } from 'viem'
import { ensContentHashToCID, contracts } from '@simplepg/common'
import { getBlockNumber } from 'viem/actions'
import { namehash } from 'viem/ens'

const START_BLOCKS = {
  1: 22939230,
  11155111: 8720518,
}
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export class IndexerService {
  constructor(config) {
    this.client = createPublicClient({
      transport: http(config.rpcUrl)
    })
    this.chainId = config.chainId
    this.startBlock = config.startBlock || START_BLOCKS[config.chainId] || 1
    this.simplePageContract = config.simplePageAddress || contracts.deployments[config.chainId].SimplePage
    this.universalResolver = config.universalResolver || contracts.universalResolver[config.chainId]
    this.ipfsService = config.ipfsService
    this.logger = config.logger
    this.isRunning = false
    this.currentBlock = null // will be set in start()
    this.blockInterval = config.blockInterval || 500
    this.progressEveryBlocks = this.blockInterval * 10
    this._lastCheckpointBlock = null
    this.subscriptionRefreshIntervalMs = config.subscriptionRefreshIntervalMs || 60 * 60 * 1000
    this.subscriptionRefreshThresholdSeconds = config.subscriptionRefreshThresholdSeconds || 24 * 60 * 60
    this._lastSubscriptionRefresh = 0
  }

  async start() {
    if (this.isRunning) return
    this.isRunning = true

    // On startup, get the highest block number we've already indexed
    const storedBlock = await this.ipfsService.getLatestBlockNumber()
    this.currentBlock = Math.max(this.startBlock, storedBlock)
    this._lastCheckpointBlock = this.currentBlock - this.progressEveryBlocks

    this.logger.info('Indexer service started', {
      startBlock: this.startBlock,
      usedBlock: this.currentBlock,
      chainId: this.chainId
    })

    await this.#ensureTemplateDomain()
    await this.ipfsService.rebuildResolverIndex()
    await this.#ensureSubscriptionFiles()

    // Start polling loop
    this.pollLoop()
  }

  async pollLoop() {
    while (this.isRunning) {
      this.currentPoll = this.poll()
      await this.currentPoll
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  async #ensureTemplateDomain() {
    const templateDomain = 'new.simplepage.eth'
    await this.ipfsService.mfs.ensureDomain(templateDomain)
    const storedResolver = await this.ipfsService.getDomainResolver(templateDomain)
    if (!storedResolver) {
      try {
        const startupResolver = await this.client.getEnsResolver({
          name: templateDomain,
          universalResolverAddress: this.universalResolver,
          blockNumber: BigInt(this.currentBlock)
        })
        if (startupResolver && startupResolver !== ZERO_ADDRESS) {
          await this.ipfsService.setDomainResolver(templateDomain, startupResolver)
        }
      } catch (_error) {
        // ignore resolver lookup failures
      }
    }
  }

  async #ensureSubscriptionFiles() {
    try {
      const domains = await this.ipfsService.mfs.listDomains()
      for (const domain of domains) {
        const existing = await this.ipfsService.subscriptionIndex.readSubscription(domain)
        if (existing.exists) continue
        await this.#updateSubscriptionForDomain(domain, 'startup')
      }
    } catch (error) {
      this.logger.warn('Error ensuring subscription index', {
        error: error.message,
        stack: error.stack
      })
    }
  }

  async #maybeRefreshSubscriptions() {
    const now = Date.now()
    if (this._lastSubscriptionRefresh && now - this._lastSubscriptionRefresh < this.subscriptionRefreshIntervalMs) {
      return
    }
    this._lastSubscriptionRefresh = now
    try {
      const expiringDomains = await this.ipfsService.subscriptionIndex.listExpiringDomains({
        withinSeconds: this.subscriptionRefreshThresholdSeconds
      })
      for (const domain of expiringDomains) {
        await this.#updateSubscriptionForDomain(domain, 'expiring')
      }
    } catch (error) {
      this.logger.warn('Error refreshing subscriptions', {
        error: error.message,
        stack: error.stack
      })
    }
  }

  async #updateSubscriptionForDomain(domain, reason, { units } = {}) {
    units = units || await this.#fetchSubscriptionUnits(domain)
    const normalizedUnits = await this.ipfsService.subscriptionIndex.writeSubscription(domain, units)
    const expiresAt = normalizedUnits?.[0] ?? null
    this.logger.debug('Subscription index updated', {
      domain,
      reason,
      expiresAt
    })
  }

  #tokenIdForDomain(domain) {
    return BigInt(keccak256(encodePacked(['string'], [domain])))
  }

  async refreshDomainRegistration(domain, reason = 'manual') {
    try {
      const latestBlock = Number(await getBlockNumber(this.client))
      const tokenId = this.#tokenIdForDomain(domain)
      const { pageData, resolver } = await this.fetchPageData(tokenId, latestBlock)
      await this.ipfsService.mfs.ensureDomain(pageData.domain)
      await this.ipfsService.setDomainResolver(pageData.domain, resolver)
      await this.#updateSubscriptionForDomain(pageData.domain, reason, { units: pageData.units })
      return { domain: pageData.domain, resolver }
    } catch (error) {
      this.logger.debug('Unable to refresh domain registration', {
        domain,
        reason,
        error: error.message
      })
      return null
    }
  }

  async #fetchSubscriptionUnits(domain) {
    try {
      const tokenId = this.#tokenIdForDomain(domain)
      const pageData = await this.client.readContract({
        address: this.simplePageContract,
        abi: contracts.abis.SimplePage,
        functionName: 'getPageData',
        args: [tokenId]
      })
      return Array.isArray(pageData?.units) ? pageData.units : []
    } catch (error) {
      this.logger.debug('Unable to fetch subscription data', {
        domain,
        error: error.message
      })
      return []
    }
  }

  async stop() {
    this.isRunning = false
    await this.currentPoll
    this.logger.info('Indexer service stopped')
  }

  async poll() {
    try {
      const latestBlock = Number(await getBlockNumber(this.client))
      const startingBlock = this.currentBlock
      // Process any new blocks
      while (this.currentBlock <= latestBlock) {
        if (!this.isRunning) return
        const toBlock = Math.min(this.currentBlock + this.blockInterval - 1, latestBlock)
        await this.processBlockRange(this.currentBlock, toBlock)
        this.currentBlock = toBlock + 1
        const lastProcessedBlock = this.currentBlock - 1
        if (lastProcessedBlock - this._lastCheckpointBlock >= this.progressEveryBlocks) {
          await this.ipfsService.setLatestBlockNumber(lastProcessedBlock)
          const remainingBlocks = latestBlock - this.currentBlock + 1
          this.logger.info('Indexer catch-up progress', { remainingBlocks })
          this._lastCheckpointBlock = lastProcessedBlock
        }
      }
      // Persist the highest block number we've processed
      if (this.currentBlock !== startingBlock) {
        await this.ipfsService.setLatestBlockNumber(this.currentBlock - 1)
      }
      // We caught up so sync pages on IPFS
      await this.syncPages()
      // Check and nuke pages
      await this.checkAndNukePages()
      // Prune old staged pins
      await this.ipfsService.pruneStaged()
      await this.ipfsService.retryFailedPins()
      await this.#maybeRefreshSubscriptions()
    } catch (error) {
      this.logger.error('Error in poll loop', {
        error: error.message,
        stack: error.stack
      })
    }
  }

  async processBlockRange(fromBlock, toBlock) {
    this.logger.debug('Processing block range', { fromBlock, toBlock })
    const baseResolvers = await this.ipfsService.listActiveResolvers()
    const resolverSet = new Set(baseResolvers.map(resolver => resolver.toLowerCase()))
    const mintLogs = await this.client.getLogs({
      address: this.simplePageContract,
      event: contracts.abis.SimplePage.find(abi => abi.name === 'Transfer'),
      args: { from: '0x0000000000000000000000000000000000000000' },
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock)
    })
    this.logger.debug('Mint logs fetched', { count: mintLogs.length, fromBlock, toBlock })
    if (mintLogs.length > 0) {
      this.logger.info('Processing new SimplePage registrations', { count: mintLogs.length })
    }
    const pagesData = await Promise.all(mintLogs.map(log => {
      this.logger.debug('Mint log', {
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
        tokenId: log.args?.tokenId?.toString?.()
      })
      return this.fetchPageData(log.args.tokenId, log.blockNumber)
    }))

    // Persist pages and resolvers to IPFS
    for (const page of pagesData) {
      await this.ipfsService.mfs.ensureDomain(page.pageData.domain)
      await this.ipfsService.setDomainResolver(page.pageData.domain, page.resolver)
      await this.#updateSubscriptionForDomain(page.pageData.domain, 'subscribed', { units: page.pageData.units })
      if (page.resolver && page.resolver !== ZERO_ADDRESS) {
        resolverSet.add(page.resolver.toLowerCase())
      }
    }

    const domains = await this.ipfsService.mfs.listDomains()
    const domainFromNode = domains.reduce((acc, domain) => {
      acc[namehash(domain)] = domain
      return acc
    }, {})

    const ensRegistryEvent = contracts.abis.EnsRegistry.find(abi => abi.name === 'NewResolver')
    const resolverEvent = contracts.abis.EnsResolver.find(abi => abi.name === 'ContenthashChanged')

    const newResolverLogs = await this.client.getLogs({
      address: contracts.ensRegistry[this.chainId],
      event: ensRegistryEvent,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock)
    })

    for (const log of newResolverLogs) {
      const domain = domainFromNode[log.args.node]
      if (!domain) continue
      const currentResolver = await this.ipfsService.getDomainResolver(domain)
      if (currentResolver && currentResolver !== ZERO_ADDRESS) {
        resolverSet.add(currentResolver.toLowerCase())
      }
      if (log.args?.resolver && log.args.resolver !== ZERO_ADDRESS) {
        resolverSet.add(log.args.resolver.toLowerCase())
      }
    }

    const resolverAddresses = [...resolverSet]
    const resolverBatchSize = 5
    const resolverBatches = []
    for (let i = 0; i < resolverAddresses.length; i += resolverBatchSize) {
      resolverBatches.push(resolverAddresses.slice(i, i + resolverBatchSize))
    }
    if (resolverAddresses.length > 0) {
      this.logger.debug('Tracking contenthash updates for known resolvers', {
        resolverCount: resolverAddresses.length,
        resolverBatchCount: resolverBatches.length,
        resolverBatchSize
      })
    }
    let contenthashLogs = []
    if (resolverAddresses.length > 0) {
      const contenthashLogBatches = await Promise.all(resolverBatches.map(addresses => this.client.getLogs({
        address: addresses,
        event: resolverEvent,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock)
      })))
      contenthashLogs = contenthashLogBatches.flat()
    }

    this.logger.debug('NewResolver logs fetched', { count: newResolverLogs.length, fromBlock, toBlock })
    this.logger.debug('Contenthash logs fetched', {
      count: contenthashLogs.length,
      resolverCount: resolverAddresses.length,
      fromBlock,
      toBlock
    })

    const logDedupKey = (log) => `${log.transactionHash}-${log.logIndex ?? 'na'}-${log.address}`
    const seenLogs = new Set()
    const combinedLogs = [...newResolverLogs, ...contenthashLogs].filter(log => {
      const key = logDedupKey(log)
      if (seenLogs.has(key)) return false
      seenLogs.add(key)
      return true
    })

    const sortedLogs = combinedLogs.sort((a, b) => {
      const blockDiff = Number(a.blockNumber) - Number(b.blockNumber)
      if (blockDiff !== 0) return blockDiff
      return (a.logIndex ?? 0) - (b.logIndex ?? 0)
    })

    for (const log of sortedLogs) {
      this.logger.debug('Indexer log', {
        eventName: log.eventName,
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
        address: log.address,
        node: log.args?.node
      })
      switch (log.eventName) {
        case 'NewResolver': {
          const domain = domainFromNode[log.args.node]
          if (!domain) {
            this.logger.debug('Skipping NewResolver (domain unknown)', { node: log.args.node })
            break
          }
          await this.ipfsService.setDomainResolver(domain, log.args.resolver)
          this.logger.debug('Resolver updated', { domain, resolver: log.args.resolver })
          break
        }
        case 'ContenthashChanged': {
          const domain = domainFromNode[log.args.node]
          if (!domain) {
            this.logger.debug('Skipping ContenthashChanged (domain unknown)', { node: log.args.node })
            break
          }
          try {
            if (!await this.ipfsService.isDomainFinalizable(domain)) {
              this.logger.debug('Skipping ContenthashChanged (not finalizable)', { domain })
              break
            }
            const currentResolver = await this.ipfsService.getDomainResolver(domain)
            if (!currentResolver || currentResolver === ZERO_ADDRESS) {
              this.logger.debug('Skipping ContenthashChanged (missing resolver)', { domain, resolver: currentResolver })
              break
            }
            if (currentResolver !== log.address.toLowerCase()) {
              this.logger.debug('Skipping ContenthashChanged (resolver mismatch)', {
                domain,
                resolver: currentResolver,
                logAddress: log.address
              })
              break
            }
            const cid = ensContentHashToCID(log.args.hash)
            this.logger.debug('Finalizing contenthash', {
              domain,
              cid: cid.toString(),
              blockNumber: Number(log.blockNumber),
              txHash: log.transactionHash
            })
            await this.ipfsService.finalizePage(cid, domain, Number(log.blockNumber), log.transactionHash)
          } catch (err) {
            this.logger.warn('Error persisting contenthash', { hash: log.args.hash, blockNumber: log.blockNumber, error: err.message })
          }
          break
        }
        default:
          break
      }
    }
  }

  async fetchPageData(tokenId, blockNumber) {
    this.logger.debug('Fetching page data', { tokenId: tokenId.toString(), blockNumber })
    
    const pageData = await this.client.readContract({
      address: this.simplePageContract,
      abi: contracts.abis.SimplePage,
      functionName: 'getPageData',
      args: ['0x' + tokenId.toString(16)],
      blockNumber: BigInt(blockNumber)
    })

    const resolver = await this.client.getEnsResolver({
      name: pageData.domain,
      universalResolverAddress: this.universalResolver,
      blockNumber: BigInt(blockNumber)
    })

    this.logger.debug('Page data fetched', {
      domain: pageData.domain,
      resolver: resolver,
      blockNumber
    })
    
    return { pageData, resolver }
  }

  async syncPages() {
    this.logger.debug('Starting page synchronization')
    
    const domains = await this.ipfsService.mfs.listDomains()
    const domainsToSync = await this.ipfsService.listFinalizableDomains()

    this.logger.debug('Page sync configuration', {
      totalDomains: domains.length,
      domainsToSync: domainsToSync.length
    })

    for (const domain of domainsToSync) {
      const latest = await this.ipfsService.getLatestFinalization(domain)
      if (!latest) {
        continue
      }
      if (!await this.ipfsService.isPageFinalized(latest.cid, domain, latest.txHash)) {
        this.logger.info('Finalizing page', {
          domain,
          blockNumber: latest.blockNumber.toString(),
          cid: latest.cid
        })
        await this.ipfsService.finalizePage(latest.cid, domain, latest.blockNumber, latest.txHash)
      }
    }
    
    this.logger.debug('Page synchronization completed')
  }

  async checkAndNukePages() {
    const domains = await this.ipfsService.listFinalizedPages()
    const blockedDomains = await this.ipfsService.getList('block-list')
    const domainsToNuke = domains.filter(domain => blockedDomains.includes(domain))
    if (domainsToNuke.length > 0) {
      this.logger.info('Nuking blocked domains', { count: domainsToNuke.length, domains: domainsToNuke })
    }
    for (const domain of domainsToNuke) {
      await this.ipfsService.nukePage(domain)
    }
  }
}
