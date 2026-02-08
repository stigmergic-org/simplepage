import { TestEnvironmentEvm } from '@simplepg/test-utils';
import { IndexerService } from '../../src/services/indexer.js';
import { namehash } from 'viem/ens';
import { jest } from '@jest/globals';
import { createPublicClient, http } from 'viem';
import { getBlockNumber } from 'viem/actions';


const TEST_DATA = [
  { name: 'test1.eth', cid: 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm', resolver: 'resolver1' },
  { name: 'test2.eth', cid: 'bafybeicijwrpp5exzlbqpyqcmkbcmnrqxdouyremgq3eod23qufugk5ina', resolver: 'resolver2' }
];

class MockIpfsService {
  constructor() {
    this.pages = new Map();
    this.lists = new Map();
    this.latestBlockNumber = 0;
    this.stagedEntries = new Map();
    this.domains = new Set();
  }

  async getList(name) {
    return this.lists.get(name) || [];
  }

  async addToList(name, value) {
    const list = this.lists.get(name) || [];
    if (!list.includes(value)) {
      list.push(value);
      this.lists.set(name, list);
    }
  }

  async removeFromList(name, value) {
    const list = this.lists.get(name) || [];
    const index = list.indexOf(value);
    if (index > -1) {
      list.splice(index, 1);
      this.lists.set(name, list);
    }
  }

  async ensureDomain(domain) {
    this.domains.add(domain);
  }

  async domainExists(domain) {
    return this.domains.has(domain);
  }

  async listDomains() {
    return Array.from(this.domains);
  }

  async listFinalizableDomains() {
    const blocked = await this.getList('block-list');
    const allow = await this.getList('allow-list');
    let domains = Array.from(this.domains).filter(domain => !blocked.includes(domain));
    if (allow.length > 0) {
      domains = domains.filter(domain => allow.includes(domain));
    }
    return domains;
  }

  async isDomainFinalizable(domain) {
    const blocked = await this.getList('block-list');
    if (blocked.includes(domain)) return false;
    const allow = await this.getList('allow-list');
    if (allow.length === 0) return true;
    return allow.includes(domain);
  }

  async getLatestBlockNumber() {
    return this.latestBlockNumber;
  }

  async setLatestBlockNumber(blockNumber) {
    this.latestBlockNumber = blockNumber;
  }

  async isPageFinalized(cid, domain, txHash) {
    const entries = this.pages.get(domain) || [];
    const cidString = cid?.toString ? cid.toString() : cid;
    return entries.some(entry => entry.txHash === txHash && entry.cid === cidString);
  }

  async listFinalizedPages() {
    return Array.from(this.pages.keys());
  }

  async getFinalizations(domain) {
    return this.pages.get(domain) || [];
  }

  async getLatestFinalization(domain) {
    const entries = this.pages.get(domain) || [];
    if (entries.length === 0) return null;
    return entries.reduce((max, entry) => entry.blockNumber > max.blockNumber ? entry : max);
  }

  async finalizePage(cid, domain, blockNumber, txHash) {
    const entries = this.pages.get(domain) || [];
    entries.push({ cid: cid.toString(), blockNumber, txHash });
    this.pages.set(domain, entries);
  }

  async nukePage(domain) {
    this.pages.delete(domain);
  }

  async pruneStaged() {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 60 * 60;
    for (const [key, data] of this.stagedEntries.entries()) {
      if (now - data.timestamp > maxAge) {
        this.stagedEntries.delete(key);
      }
    }
  }

  getStagedEntries() {
    return Array.from(this.stagedEntries.entries());
  }
}

describe('Pages Indexer', () => {
    let testEnv;
    let deployments;
    let indexer;
    let ipfsMock;

    beforeAll(async () => {
      testEnv = new TestEnvironmentEvm();
      deployments = await testEnv.start();
    });

    beforeEach(async () => {
      ipfsMock = new MockIpfsService();
      
      // Mock the key methods we want to track
      jest.spyOn(ipfsMock, 'isPageFinalized');
      jest.spyOn(ipfsMock, 'finalizePage');
      jest.spyOn(ipfsMock, 'nukePage');
      
      // Create a mock logger
      const mockLogger = {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      };
      
      // Initialize indexer with the deployed addresses and mock logger
      indexer = new IndexerService({
        rpcUrl: testEnv.url,
        simplePageAddress: deployments.simplepage,
        universalResolver: deployments.universalResolver,
        startBlock: 1,
        ipfsService: ipfsMock,
        logger: mockLogger
      })
    });

    afterEach(async () => {
      jest.clearAllMocks();
      await indexer.stop();
    });

    afterAll(async () => {
        await testEnv.stop();
    });

    it('should index new pages and their contenthash', async () => {
      await indexer.start()
      // mint a page
      for (const { name, cid, resolver } of TEST_DATA) {
        testEnv.setResolver(deployments.universalResolver, name, deployments[resolver])
        testEnv.mintPage(name, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
      }
      for (const { name, cid, resolver } of TEST_DATA) {
        testEnv.setContenthash(deployments[resolver], name, cid)
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop()

      // Verify domains list
      const domains = await ipfsMock.listDomains()
      expect(domains.length).toBe(TEST_DATA.length)
      for (const { name } of TEST_DATA) {
        expect(domains.find(d => d === name)).toBe(name)
      }

      // Verify resolvers list
      const resolvers = await ipfsMock.getList('resolvers')
      expect(resolvers.length).toBe(2) // Should have both resolvers
      expect(resolvers).toContain(deployments.resolver1)
      expect(resolvers).toContain(deployments.resolver2)

      // Verify finalizations for each domain
      for (const { name, cid } of TEST_DATA) {
        const finalizations = await ipfsMock.getFinalizations(name)
        expect(finalizations.length).toBe(1)
        expect(finalizations[0].cid).toBe(cid)
      }
    })

    it('should handle multiple contenthash updates for a single name', async () => {
      await indexer.start();
      
      // Setup initial page
      const domain = 'test3.eth';
      const resolver = 'resolver1';
      testEnv.setResolver(deployments.universalResolver, domain, deployments[resolver]);
      testEnv.mintPage(domain, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

      // Set multiple contenthash updates
      const updates = [
        { cid: 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm', blockNumber: 1000 },
        { cid: 'bafybeicijwrpp5exzlbqpyqcmkbcmnrqxdouyremgq3eod23qufugk5ina', blockNumber: 1001 },
        { cid: 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm', blockNumber: 1002 }
      ];

      for (const update of updates) {
        testEnv.setContenthash(deployments[resolver], domain, update.cid);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      const finalizations = await ipfsMock.getFinalizations(domain);
      expect(finalizations.length).toBe(updates.length);
      const latest = finalizations.reduce((max, entry) => entry.blockNumber > max.blockNumber ? entry : max);
      expect(latest.cid).toBe(updates[updates.length - 1].cid);
    });

    it('should handle empty contenthash updates', async () => {
      await indexer.start();
      
      // Setup page without contenthash
      const domain = 'test4.eth';
      const resolver = 'resolver1';
      testEnv.setResolver(deployments.universalResolver, domain, deployments[resolver]);
      testEnv.mintPage(domain, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify domain was tracked
      const domains = await ipfsMock.listDomains();
      expect(domains).toContain(domain);

      const finalizations = await ipfsMock.getFinalizations(domain);
      expect(finalizations.length).toBe(0);
    });

    it.skip('should handle resolver changes', async () => {
      // TODO: We don't support listening for resolver changes yet
      await indexer.start();
      
      // Setup initial page with first resolver
      const domain = 'test5.eth';
      const initialResolver = 'resolver1';
      const newResolver = 'resolver2';
      
      testEnv.setResolver(deployments.universalResolver, domain, deployments[initialResolver]);
      testEnv.mintPage(domain, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

      // Set contenthash with initial resolver
      const initialCid = 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm';
      testEnv.setContenthash(deployments[initialResolver], domain, initialCid);

      // Change resolver
      testEnv.setResolver(deployments.universalResolver, domain, deployments[newResolver]);

      // Set contenthash with new resolver
      const newCid = 'bafybeicijwrpp5exzlbqpyqcmkbcmnrqxdouyremgq3eod23qufugk5ina';
      testEnv.setContenthash(deployments[newResolver], domain, newCid);

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify both resolvers are tracked
      const resolvers = await ipfsMock.getList('resolvers');
      expect(resolvers).toContain(deployments[initialResolver]);
      expect(resolvers).toContain(deployments[newResolver]);

      // Verify contenthash updates from both resolvers
      const finalizations = await ipfsMock.getFinalizations(domain);
      expect(finalizations.length).toBe(2);
      expect(finalizations[1].cid).toBe(newCid);
    });

    it('should not store ipfs content of pages in the block-list', async () => {
      await indexer.start();
      
      // Setup block-list with a domain
      const blockedDomain = 'blocked.eth';
      await ipfsMock.addToList('block-list', blockedDomain);
      
      // Setup page that should be blocked
      const resolver = 'resolver1';
      testEnv.setResolver(deployments.universalResolver, blockedDomain, deployments[resolver]);
      testEnv.mintPage(blockedDomain, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      
      // Set contenthash for blocked domain
      const blockedCid = 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm';
      testEnv.setContenthash(deployments[resolver], blockedDomain, blockedCid);

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify that isPageFinalized and finalizePage were not called for the blocked domain
      expect(ipfsMock.isPageFinalized).not.toHaveBeenCalledWith(expect.anything(), blockedDomain, expect.anything());
      expect(ipfsMock.finalizePage).not.toHaveBeenCalledWith(expect.anything(), blockedDomain, expect.anything(), expect.anything());

      const finalizations = await ipfsMock.getFinalizations(blockedDomain);
      expect(finalizations.length).toBe(0);
    });

    it('should remove ipfs content of already pinned page if added to block-list', async () => {
      await indexer.start();
      
      // Setup a domain and pin it first
      const domain = 'test6.eth';
      const resolver = 'resolver1';
      testEnv.setResolver(deployments.universalResolver, domain, deployments[resolver]);
      testEnv.mintPage(domain, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      
      const cid = 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm';
      testEnv.setContenthash(deployments[resolver], domain, cid);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify domain was initially finalized
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), domain, expect.anything(), expect.anything());

      // Clear mock calls to track new calls after adding to block-list
      jest.clearAllMocks();

      // Add domain to block-list
      await ipfsMock.addToList('block-list', domain);

      // // Trigger another indexing cycle
      // await indexer.stop();
      // await indexer.start();

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify that nukePage was called for the domain
      expect(ipfsMock.nukePage).toHaveBeenCalledWith(domain);

      // Verify that isPageFinalized and finalizePage are not called for the blocked domain
      expect(ipfsMock.isPageFinalized).not.toHaveBeenCalledWith(expect.anything(), domain, expect.anything());
      expect(ipfsMock.finalizePage).not.toHaveBeenCalledWith(expect.anything(), domain, expect.anything(), expect.anything());
    });

    it('should only store ipfs content of pages in allow-list when allow-list is not empty', async () => {
      await indexer.start();
      
      // Setup allow-list with specific domains
      const allowedDomain1 = 'allowed1.eth';
      const allowedDomain2 = 'allowed2.eth';
      const notAllowedDomain = 'notallowed.eth';
      
      await ipfsMock.addToList('allow-list', allowedDomain1);
      await ipfsMock.addToList('allow-list', allowedDomain2);
      
      // Setup pages for all domains
      const resolver = 'resolver1';
      const domains = [allowedDomain1, allowedDomain2, notAllowedDomain];
      
      for (const domain of domains) {
        testEnv.setResolver(deployments.universalResolver, domain, deployments[resolver]);
        testEnv.mintPage(domain, 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

        const cid = 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm';
        testEnv.setContenthash(deployments[resolver], domain, cid);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify that isPageFinalized and finalizePage were not called for the not allowed domain
      expect(ipfsMock.isPageFinalized).not.toHaveBeenCalledWith(expect.anything(), notAllowedDomain, expect.anything());
      expect(ipfsMock.finalizePage).not.toHaveBeenCalledWith(expect.anything(), notAllowedDomain, expect.anything(), expect.anything());

      // Verify that isPageFinalized and finalizePage were called for allowed domains
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), allowedDomain1, expect.anything(), expect.anything());
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), allowedDomain2, expect.anything(), expect.anything());


      // verify that only allowed domains are finalized
      const finalizedPages = await ipfsMock.listFinalizedPages();
      expect(finalizedPages.length).toBe(2);
      expect(finalizedPages).toContain(allowedDomain1);
      expect(finalizedPages).toContain(allowedDomain2);
      expect(finalizedPages).not.toContain(notAllowedDomain);
    }, 10000);

    it.skip('should index and finalize pages on allow-list even if not registered via mintPage', async () => {
      // TODO: not implemented yet
      await indexer.start();
      
      // Setup allow-list with a domain that hasn't been minted
      const allowedDomain = 'allowed-unminted.eth';
      await ipfsMock.addToList('allow-list', allowedDomain);
      
      // Setup resolver for the domain (but don't mint the page)
      const resolver = 'resolver1';
      testEnv.setResolver(deployments.universalResolver, allowedDomain, deployments[resolver]);
      
      // Set contenthash for the domain
      const cid = 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm';
      testEnv.setContenthash(deployments[resolver], allowedDomain, cid);

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify that the domain was tracked in the domains list
      const domains = await ipfsMock.listDomains();
      expect(domains).toContain(allowedDomain);

      // Verify that the resolver was tracked
      const resolvers = await ipfsMock.getList('resolvers');
      expect(resolvers).toContain(deployments[resolver]);

      // Verify that contenthash updates were tracked
      const finalizations = await ipfsMock.getFinalizations(allowedDomain);
      expect(finalizations.length).toBe(1);
      expect(finalizations[0].cid).toBe(cid);

      // Verify that the page was finalized despite not being minted
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), allowedDomain, expect.anything(), expect.anything());

      // Verify that the page appears in finalized pages list
      const finalizedPages = await ipfsMock.listFinalizedPages();
      expect(finalizedPages).toContain(allowedDomain);
    }, 10000);

    it('should skip blocks below the stored block number and persist the new highest block', async () => {
      // Set a record for old.eth
      testEnv.setResolver(deployments.universalResolver, 'old.eth', deployments.resolver1);
      testEnv.mintPage('old.eth', 1000, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      testEnv.setContenthash(deployments.resolver1, 'old.eth', 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');

      // Get the actual current block number from the chain
      const client = createPublicClient({ transport: http(testEnv.url) });
      const currentBlock = Number(await getBlockNumber(client));

      // Mint and set record for new.eth at a higher block
      testEnv.setResolver(deployments.universalResolver, 'new.eth', deployments.resolver1);
      testEnv.mintPage('new.eth', currentBlock + 1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      testEnv.setContenthash(deployments.resolver1, 'new.eth', 'bafybeicijwrpp5exzlbqpyqcmkbcmnrqxdouyremgq3eod23qufugk5ina');

      // Set the block number on the ipfs mock to the current block
      await ipfsMock.setLatestBlockNumber(currentBlock);

      await indexer.start();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Should only finalize new.eth
      const finalizedPages = await ipfsMock.listFinalizedPages();
      console.log('finalizedPages', finalizedPages)
      expect(finalizedPages).toContain('new.eth');
      expect(finalizedPages).not.toContain('old.eth');
    });
}); 
