import { createPublicClient, http } from 'viem'
import { ensContentHashToCID, contracts } from '@simplepg/common'
import { getBlockNumber } from 'viem/actions'
import { namehash } from 'viem/ens'

const START_BLOCKS = {
  1: 22939230,
  11155111: 8720518,
}

export class IndexerService {
  constructor(config) {
    this.client = createPublicClient({
      transport: http(config.rpcUrl)
    })
    this.startBlock = config.startBlock || START_BLOCKS[config.chainId] || 1
    this.simplePageContract = config.simplePageAddress || contracts.deployments[config.chainId].SimplePage
    this.universalResolver = config.universalResolver || contracts.universalResolver[config.chainId]
    this.ipfsService = config.ipfsService
    this.logger = config.logger
    this.isRunning = false
    this.currentBlock = null // will be set in start()
    this.blockInterval = config.blockInterval || 1000
  }

  async start() {
    if (this.isRunning) return
    this.isRunning = true

    // On startup, get the highest block number we've already indexed
    const storedBlock = await this.ipfsService.getLatestBlockNumber()
    this.currentBlock = Math.max(this.startBlock, storedBlock)

    this.logger.info('Indexer service started', {
      startBlock: this.startBlock,
      usedBlock: this.currentBlock,
      chainId: this.chainId
    })

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

  async stop() {
    this.isRunning = false
    await this.currentPoll
    this.logger.info('Indexer service stopped')
  }

  async poll() {
    try {
      const latestBlock = Number(await getBlockNumber(this.client))
      let processedAny = false;
      // Process any new blocks
      while (this.currentBlock <= latestBlock) {
        if (!this.isRunning) return
        const toBlock = Math.min(this.currentBlock + this.blockInterval - 1, latestBlock)
        await this.processBlockRange(this.currentBlock, toBlock)
        this.currentBlock = toBlock + 1
        processedAny = true;
      }
      // Persist the highest block number we've processed
      if (processedAny) {
        await this.ipfsService.setLatestBlockNumber(this.currentBlock - 1)
      }
      // We caught up so sync pages on IPFS
      await this.syncPages()
      // Check and nuke pages
      await this.checkAndNukePages()
      // Prune old staged pins
      await this.ipfsService.pruneStaged()
    } catch (error) {
      this.logger.error('Error in poll loop', {
        error: error.message,
        stack: error.stack
      })
    }
  }

  async processBlockRange(fromBlock, toBlock) {
    this.logger.debug('Processing block range', { fromBlock, toBlock })
    const logs = await this.client.getLogs({
      address: this.simplePageContract,
      event: contracts.abis.SimplePage.find(abi => abi.name === 'Transfer'),
      args: { from: '0x0000000000000000000000000000000000000000' },
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock)
    })
    if (logs.length > 0) {
      this.logger.info('Processing new SimplePage registrations', { count: logs.length })
    }
    const pagesData = await Promise.all(logs.map(log => {
      return this.fetchPageData(log.args.tokenId, log.blockNumber)
    }))

    // Persist pages and resolvers to IPFS
    for (const page of pagesData) {
      await this.ipfsService.ensureDomain(page.pageData.domain)
      await this.ipfsService.addToList('resolvers', page.resolver)
    }

    // Track contenthash updates
    const resolvers = await this.ipfsService.getList('resolvers')
    if (resolvers.length > 0) {
      this.logger.debug('Tracking contenthash updates for known resolvers', { resolverCount: resolvers.length })
    }
    const chLogs = []
    for (const resolver of resolvers) {
      const logs = await this.client.getLogs({
        address: resolver,
        event: contracts.abis.EnsResolver.find(abi => abi.name === 'ContenthashChanged'),
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock)
      })
      chLogs.push(...logs)
    }
    // persist contenthash updates for names we care about
    const domains = await this.ipfsService.listDomains()
    // create a map from node to domain
    const domainFromNode = domains.reduce((acc, domain) => {
      acc[namehash(domain)] = domain
      return acc
    }, {})
    // filter logs for domains we care about
    const chLogsForDomains = chLogs.filter(log => domainFromNode[log.args.node])
    for (const log of chLogsForDomains) {
      const domain = domainFromNode[log.args.node]
      try {
        if (!await this.ipfsService.isDomainFinalizable(domain)) {
          continue
        }
        // Convert contenthash to CID before storing
        const cid = ensContentHashToCID(log.args.hash)
        await this.ipfsService.finalizePage(cid, domain, Number(log.blockNumber), log.transactionHash)
      } catch (err) {
        this.logger.warn('Error persisting contenthash', { hash: log.args.hash, blockNumber: log.blockNumber, error: err.message })
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
