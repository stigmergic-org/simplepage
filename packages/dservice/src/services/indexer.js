import { createPublicClient, http } from 'viem'
import { ensContentHashToCID, contracts } from '@simplepg/common'
import { getBlockNumber } from 'viem/actions'
import { namehash } from 'viem/ens'
import { CID } from 'multiformats/cid'

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
      this.logger.debug('Polling started')
      this.currentPoll = this.poll()
      await this.currentPoll
      this.logger.debug('Polling completed')
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
      await this.ipfsService.addToList('domains', 'string', page.pageData.domain)
      await this.ipfsService.addToList('resolvers', 'address', page.resolver)
    }

    // Track contenthash updates
    const resolvers = await this.ipfsService.getList('resolvers', 'address')
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
    const domains = await this.ipfsService.getList('domains', 'string')
    // create a map from node to domain
    const domainFromNode = domains.reduce((acc, domain) => {
      acc[namehash(domain)] = domain
      return acc
    }, {})
    // filter logs for domains we care about
    const chLogsForDomains = chLogs.filter(log => domainFromNode[log.args.node])
    for (const log of chLogsForDomains) {
      // Convert contenthash to CID before storing
      const cid = ensContentHashToCID(log.args.hash)
      // persist both the contenthash and the blocknumber for the domain, as well as txhash
      await this.ipfsService.addToList(
        `contenthash_${domainFromNode[log.args.node]}`,
        'string',
        `${log.blockNumber}-${cid}-${log.transactionHash}`
      )
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
    
    const domains = await this.ipfsService.getList('domains', 'string')
    // filter out blocked domains
    const blockedDomains = await this.ipfsService.getList('block', 'string')
    let domainsToSync = domains.filter(domain => !blockedDomains.includes(domain))

    // if there is an allow list, only sync the domains in the allow list
    const allowOnlyDomains = await this.ipfsService.getList('allow', 'string')
    if (allowOnlyDomains.length > 0) {
      domainsToSync = allowOnlyDomains
    }

    this.logger.debug('Page sync configuration', {
      totalDomains: domains.length,
      blockedDomains: blockedDomains.length,
      allowOnlyDomains: allowOnlyDomains.length,
      domainsToSync: domainsToSync.length
    })

    for (const domain of domainsToSync) {
      const hashUpdates = await this.ipfsService.getList(`contenthash_${domain}`, 'string')

      const sanitizedHashUpdates = hashUpdates.map(data => {
        const [blockNumberStr, cid] = data.split('-')
        const blockNumber = parseInt(blockNumberStr)
        return { blockNumber, cid: CID.parse(cid) }
      })

      const latestCid = sanitizedHashUpdates.reduce((max, update) => {
        return update.blockNumber > max.blockNumber ? update : max
      }, { blockNumber: 0, cid: null })

      if (latestCid.cid && !await this.ipfsService.isPageFinalized(latestCid.cid, domain, latestCid.blockNumber)) {
        this.logger.info('Finalizing page', {
          domain,
          blockNumber: latestCid.blockNumber.toString(),
          cid: latestCid.cid
        })
        this.ipfsService.finalizePage(latestCid.cid, domain, latestCid.blockNumber)
      } else if (latestCid.cid) {
        this.logger.debug('Page already finalized', {
          domain,
          blockNumber: latestCid.blockNumber.toString(),
          cid: latestCid.cid
        })
      }
    }
    
    this.logger.debug('Page synchronization completed')
  }

  async checkAndNukePages() {
    const domains = await this.ipfsService.listFinalizedPages()
    const blockedDomains = await this.ipfsService.getList('block', 'string')
    const domainsToNuke = domains.filter(domain => blockedDomains.includes(domain))
    if (domainsToNuke.length > 0) {
      this.logger.info('Nuking blocked domains', { count: domainsToNuke.length, domains: domainsToNuke })
    }
    for (const domain of domainsToNuke) {
      await this.ipfsService.nukePage(domain)
    }
  }
}
