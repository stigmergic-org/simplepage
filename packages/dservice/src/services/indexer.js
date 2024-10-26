import { createPublicClient, http } from 'viem'
import { ensContentHashToCID, contracts } from '@simplepg/common'
import { getBlockNumber } from 'viem/actions'
import { namehash } from 'viem/ens'

const START_BLOCKS = {
  1: 1,
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
    this.isRunning = false
    this.currentBlock = this.startBlock
    this.blockInterval = config.blockInterval || 100
  }

  async start() {
    if (this.isRunning) return
    this.isRunning = true
    
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
  }

  async poll() {
    try {
      const latestBlock = Number(await getBlockNumber(this.client))
      
      // Process any new blocks
      while (this.currentBlock <= latestBlock) {
        const toBlock = Math.min(this.currentBlock + this.blockInterval, latestBlock)
        await this.processBlockRange(this.currentBlock, toBlock)
        this.currentBlock = toBlock + 1
      }

      // We caught up so sync pages on IPFS
      await this.syncPages()

      // Check and nuke pages
      await this.checkAndNukePages()

      // Prune old staged pins
      await this.ipfsService.pruneStaged()

    } catch (error) {
      console.error('Error in poll loop:', error)
    }
  }

  async processBlockRange(fromBlock, toBlock) {
    console.log(`Processing block range ${fromBlock} to ${toBlock}`)
    const logs = await this.client.getLogs({
      address: this.simplePageContract,
      event: contracts.abis.SimplePage.find(abi => abi.name === 'Transfer'),
      args: { from: '0x0000000000000000000000000000000000000000' },
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock)
    })
    if (logs.length > 0) {
      console.log(`Processing ${logs.length} new SimplePage registrations`)
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
      console.log('Tracking contenthash updates for known resolvers')
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
      // persist both the contenthash and the blocknumber for the domain
      await this.ipfsService.addToList(
        `contenthash_${domainFromNode[log.args.node]}`,
        'string',
        `${log.blockNumber}-${cid}`
      )
    }
  }

  async fetchPageData(tokenId, blockNumber) {
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
    return { pageData, resolver }
  }

  async syncPages() {
    const domains = await this.ipfsService.getList('domains', 'string')
    // filter out blocked domains
    const blockedDomains = await this.ipfsService.getList('block', 'string')
    let domainsToSync = domains.filter(domain => !blockedDomains.includes(domain))

    // if there is an allow list, only sync the domains in the allow list
    const allowOnlyDomains = await this.ipfsService.getList('allow', 'string')
    if (allowOnlyDomains.length > 0) {
      domainsToSync = allowOnlyDomains
    }

    for (const domain of domainsToSync) {
      const hashUpdates = await this.ipfsService.getList(`contenthash_${domain}`, 'string')

      const sanitizedHashUpdates = hashUpdates.map(data => {
        const [blockNumberStr, cid] = data.split('-')
        const blockNumber = BigInt(blockNumberStr)
        return { blockNumber, cid }
      })

      const latestCid = sanitizedHashUpdates.reduce((max, update) => {
        return update.blockNumber > max.blockNumber ? update : max
      }, { blockNumber: 0, cid: null })

      if (latestCid.cid && !await this.ipfsService.isPageFinalized(latestCid.cid, domain, latestCid.blockNumber)) {
        console.log(`Finalizing ${domain} at block ${latestCid.blockNumber}, with CID ${latestCid.cid}`)
        this.ipfsService.finalizePage(latestCid.cid, domain, latestCid.blockNumber)
      }
    }
  }

  async checkAndNukePages() {
    const domains = await this.ipfsService.listFinalizedPages()
    const blockedDomains = await this.ipfsService.getList('block', 'string')
    const domainsToNuke = domains.filter(domain => blockedDomains.includes(domain))
    if (domainsToNuke.length > 0) {
      console.log(`Nuking ${domainsToNuke.length} domains`)
    }
    for (const domain of domainsToNuke) {
      await this.ipfsService.nukePage(domain)
    }
  }
}
