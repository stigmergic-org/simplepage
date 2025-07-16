import { TestEnvironmentEvm } from '@simplepg/test-utils';
import { IndexerService } from '../../src/services/indexer.js';
import { namehash } from 'viem/ens';
import { jest } from '@jest/globals';


const TEST_DATA = [
  { name: 'test1.eth', cid: 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm', resolver: 'resolver1' },
  { name: 'test2.eth', cid: 'bafybeicijwrpp5exzlbqpyqcmkbcmnrqxdouyremgq3eod23qufugk5ina', resolver: 'resolver2' }
];

class MockIpfsService {
  constructor() {
    this.pages = new Map();
    this.lists = new Map();
    this.latestBlockNumber = 0;
    this.stagedPins = new Map(); // Track staged pins with timestamps
  }

  async getList(name, dataType) {
    const listName = `spg_list_${name}`;
    return this.lists.get(listName) || [];
  }

  async addToList(name, dataType, value) {
    const listName = `spg_list_${name}`;
    const list = this.lists.get(listName) || [];
    if (!list.includes(value)) {
      list.push(value);
      this.lists.set(listName, list);
    }
  }

  async removeFromList(name, dataType, value) {
    const listName = `spg_list_${name}`;
    const list = this.lists.get(listName) || [];
    const index = list.indexOf(value);
    if (index > -1) {
      list.splice(index, 1);
      this.lists.set(listName, list);
    }
  }

  async getLatestBlockNumber() {
    return this.latestBlockNumber;
  }

  async setLatestBlockNumber(blockNumber) {
    this.latestBlockNumber = blockNumber;
  }

  async isPageFinalized(cid, domain, blockNumber) {
    const page = this.pages.get(domain);
    return page?.pinned || false;
  }

  async listFinalizedPages() {
    return Array.from(this.pages.keys());
  }


  async finalizePage(cid, domain, blockNumber) {
    this.pages.set(domain, { cid, pinned: true });
  }

  async nukePage(domain) {
    this.pages.delete(domain);
  }

  async writeCar(fileBuffer, stageDomain) {
    const timestamp = Math.floor(Date.now() / 1000);
    const label = `spg_staged_${stageDomain}_${timestamp}`;
    this.stagedPins.set(label, { timestamp, domain: stageDomain });
    return 'mock-cid';
  }

  async pruneStagedPins() {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 60 * 60; // 1 hour in seconds

    for (const [label, data] of this.stagedPins.entries()) {
      if (now - data.timestamp > maxAge) {
        this.stagedPins.delete(label);
      }
    }
  }

  getStagedPins() {
    return Array.from(this.stagedPins.entries());
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
      const domains = await ipfsMock.getList('domains', 'string')
      expect(domains.length).toBe(TEST_DATA.length)
      for (const { name } of TEST_DATA) {
        expect(domains.find(d => d === name)).toBe(name)
      }

      // Verify resolvers list
      const resolvers = await ipfsMock.getList('resolvers', 'address')
      expect(resolvers.length).toBe(2) // Should have both resolvers
      expect(resolvers).toContain(deployments.resolver1)
      expect(resolvers).toContain(deployments.resolver2)

      // Verify contenthash lists for each domain
      for (const { name, cid } of TEST_DATA) {
        const contenthashUpdates = await ipfsMock.getList(`contenthash_${name}`, 'string')
        expect(contenthashUpdates.length).toBe(1)
        const [blockNumber, contenthash] = contenthashUpdates[0].split('-')
        expect(contenthash).toBe(cid)
      }
    })

    it('should prune old staged pins', async () => {
      // Create staged pins with different timestamps
      const now = Math.floor(Date.now() / 1000);
      
      // Add a recent staged pin (30 minutes old)
      const recentTimestamp = now - (30 * 60);
      ipfsMock.stagedPins.set(`spg_staged_test1.eth_${recentTimestamp}`, {
        timestamp: recentTimestamp,
        domain: 'test1.eth'
      });

      // Add an old staged pin (2 hours old)
      const oldTimestamp = now - (2 * 60 * 60);
      ipfsMock.stagedPins.set(`spg_staged_test2.eth_${oldTimestamp}`, {
        timestamp: oldTimestamp,
        domain: 'test2.eth'
      });

      // Verify initial state
      expect(ipfsMock.getStagedPins().length).toBe(2);

      // Run pruning
      await ipfsMock.pruneStagedPins();

      // Verify only the old pin was pruned
      const remainingPins = ipfsMock.getStagedPins();
      expect(remainingPins.length).toBe(1);
      expect(remainingPins[0][0]).toContain('test1.eth');
    });

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

      // Verify contenthash updates were tracked
      const contenthashUpdates = await ipfsMock.getList(`contenthash_${domain}`, 'string');
      expect(contenthashUpdates.length).toBe(updates.length);

      // Verify the latest contenthash is the one that was finalized
      const latestUpdate = contenthashUpdates[contenthashUpdates.length - 1];
      const [blockNumber, cid] = latestUpdate.split('-');
      expect(cid).toBe(updates[updates.length - 1].cid);
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
      const domains = await ipfsMock.getList('domains', 'string');
      expect(domains).toContain(domain);

      // Verify no contenthash updates were tracked
      const contenthashUpdates = await ipfsMock.getList(`contenthash_${domain}`, 'string');
      expect(contenthashUpdates.length).toBe(0);
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
      const resolvers = await ipfsMock.getList('resolvers', 'address');
      expect(resolvers).toContain(deployments[initialResolver]);
      expect(resolvers).toContain(deployments[newResolver]);

      // Verify contenthash updates from both resolvers
      const contenthashUpdates = await ipfsMock.getList(`contenthash_${domain}`, 'string');
      expect(contenthashUpdates.length).toBe(2);
      expect(contenthashUpdates[1].split('-')[1]).toBe(newCid);
    });

    it('should not store ipfs content of pages in the block-list', async () => {
      await indexer.start();
      
      // Setup block-list with a domain
      const blockedDomain = 'blocked.eth';
      await ipfsMock.addToList('block', 'string', blockedDomain);
      
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
      expect(ipfsMock.finalizePage).not.toHaveBeenCalledWith(expect.anything(), blockedDomain, expect.anything());

      // Verify no staged pins were created for the blocked domain
      const stagedPins = ipfsMock.getStagedPins();
      const blockedPins = stagedPins.filter(([label]) => label.includes(blockedDomain));
      expect(blockedPins.length).toBe(0);
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
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), domain, expect.anything());

      // Clear mock calls to track new calls after adding to block-list
      jest.clearAllMocks();

      // Add domain to block-list
      await ipfsMock.addToList('block', 'string', domain);

      // // Trigger another indexing cycle
      // await indexer.stop();
      // await indexer.start();

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify that nukePage was called for the domain
      expect(ipfsMock.nukePage).toHaveBeenCalledWith(domain);

      // Verify that isPageFinalized and finalizePage are not called for the blocked domain
      expect(ipfsMock.isPageFinalized).not.toHaveBeenCalledWith(expect.anything(), domain, expect.anything());
      expect(ipfsMock.finalizePage).not.toHaveBeenCalledWith(expect.anything(), domain, expect.anything());
    });

    it('should only store ipfs content of pages in allow-list when allow-list is not empty', async () => {
      await indexer.start();
      
      // Setup allow-list with specific domains
      const allowedDomain1 = 'allowed1.eth';
      const allowedDomain2 = 'allowed2.eth';
      const notAllowedDomain = 'notallowed.eth';
      
      await ipfsMock.addToList('allow', 'string', allowedDomain1);
      await ipfsMock.addToList('allow', 'string', allowedDomain2);
      
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
      expect(ipfsMock.finalizePage).not.toHaveBeenCalledWith(expect.anything(), notAllowedDomain, expect.anything());

      // Verify that isPageFinalized and finalizePage were called for allowed domains
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), allowedDomain1, expect.anything());
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), allowedDomain2, expect.anything());


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
      await ipfsMock.addToList('allow', 'string', allowedDomain);
      
      // Setup resolver for the domain (but don't mint the page)
      const resolver = 'resolver1';
      testEnv.setResolver(deployments.universalResolver, allowedDomain, deployments[resolver]);
      
      // Set contenthash for the domain
      const cid = 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm';
      testEnv.setContenthash(deployments[resolver], allowedDomain, cid);

      await new Promise(resolve => setTimeout(resolve, 1000));
      await indexer.stop();

      // Verify that the domain was tracked in the domains list
      const domains = await ipfsMock.getList('domains', 'string');
      expect(domains).toContain(allowedDomain);

      // Verify that the resolver was tracked
      const resolvers = await ipfsMock.getList('resolvers', 'address');
      expect(resolvers).toContain(deployments[resolver]);

      // Verify that contenthash updates were tracked
      const contenthashUpdates = await ipfsMock.getList(`contenthash_${allowedDomain}`, 'string');
      expect(contenthashUpdates.length).toBe(1);
      const [blockNumber, contenthash] = contenthashUpdates[0].split('-');
      expect(contenthash).toBe(cid);

      // Verify that the page was finalized despite not being minted
      expect(ipfsMock.finalizePage).toHaveBeenCalledWith(expect.anything(), allowedDomain, expect.anything());

      // Verify that the page appears in finalized pages list
      const finalizedPages = await ipfsMock.listFinalizedPages();
      expect(finalizedPages).toContain(allowedDomain);
    }, 10000);
}); 