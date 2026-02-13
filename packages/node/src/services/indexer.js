import { createPublicClient, http } from 'viem'
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
    await this.ipfsService.ensureDomain(templateDomain)
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
      await this.ipfsService.ensureDomain(page.pageData.domain)
      await this.ipfsService.setDomainResolver(page.pageData.domain, page.resolver)
      if (page.resolver && page.resolver !== ZERO_ADDRESS) {
        resolverSet.add(page.resolver.toLowerCase())
      }
    }

    const domains = await this.ipfsService.listDomains()
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
    if (resolverAddresses.length > 0) {
      this.logger.debug('Tracking contenthash updates for known resolvers', { resolverCount: resolverAddresses.length })
    }
    let contenthashLogs = []
    if (resolverAddresses.length > 0) {
      contenthashLogs = await this.client.getLogs({
        address: resolverAddresses,
        event: resolverEvent,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock)
      })
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
    
    const domains = await this.ipfsService.listDomains()
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
