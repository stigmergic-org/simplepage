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
    this.blockInterval = config.blockInterval || 1000
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
    const mintLogs = await this.client.getLogs({
      address: this.simplePageContract,
      event: contracts.abis.SimplePage.find(abi => abi.name === 'Transfer'),
      args: { from: '0x0000000000000000000000000000000000000000' },
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock)
    })
    if (mintLogs.length > 0) {
      this.logger.info('Processing new SimplePage registrations', { count: mintLogs.length })
    }
    const pagesData = await Promise.all(mintLogs.map(log => {
      return this.fetchPageData(log.args.tokenId, log.blockNumber)
    }))

    // Persist pages and resolvers to IPFS
    for (const page of pagesData) {
      await this.ipfsService.ensureDomain(page.pageData.domain)
      await this.ipfsService.setDomainResolver(page.pageData.domain, page.resolver)
    }

    const domains = await this.ipfsService.listDomains()
    const domainFromNode = domains.reduce((acc, domain) => {
      acc[namehash(domain)] = domain
      return acc
    }, {})

    // Track contenthash updates
    const resolvers = await this.ipfsService.getList('resolvers')
    if (resolvers.length > 0) {
      this.logger.debug('Tracking contenthash updates for known resolvers', { resolverCount: resolvers.length })
    }
    const logAddresses = [...resolvers, contracts.ensRegistry[this.chainId]]

    const logs = await this.client.getLogs({
      address: logAddresses,
      events: [
        contracts.abis.EnsRegistry.find(abi => abi.name === 'NewResolver'),
        contracts.abis.EnsResolver.find(abi => abi.name === 'ContenthashChanged')
      ],
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock)
    })

    const sortedLogs = logs.sort((a, b) => {
      const blockDiff = Number(a.blockNumber) - Number(b.blockNumber)
      if (blockDiff !== 0) return blockDiff
      return (a.logIndex ?? 0) - (b.logIndex ?? 0)
    })

    for (const log of sortedLogs) {
      switch (log.eventName) {
        case 'NewResolver': {
          const domain = domainFromNode[log.args.node]
          if (!domain) break
          await this.ipfsService.setDomainResolver(domain, log.args.resolver)
          break
        }
        case 'ContenthashChanged': {
          const domain = domainFromNode[log.args.node]
          if (!domain) break
          try {
            if (!await this.ipfsService.isDomainFinalizable(domain)) {
              break
            }
            const currentResolver = await this.ipfsService.getDomainResolver(domain)
            if (!currentResolver || currentResolver === ZERO_ADDRESS) {
              break
            }
            if (currentResolver !== log.address.toLowerCase()) {
              break
            }
            const cid = ensContentHashToCID(log.args.hash)
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
