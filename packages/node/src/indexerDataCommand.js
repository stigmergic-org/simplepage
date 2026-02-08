import { IpfsService } from './services/ipfs.js'

export async function handleIndexerDataCommand(action, ipfsApiUrl) {
  const logger = { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} };
  const ipfs = new IpfsService({ api: ipfsApiUrl, logger });
  const healthy = await ipfs.healthCheck();
  if (!healthy) {
    console.error('Cannot connect to IPFS node, exiting...');
    process.exit(1);
  }
  try {
    if (action === 'show') {
      const domains = await ipfs.listDomains();
      const resolvers = await ipfs.getList('resolvers');
      console.log('Domains:', domains);
      console.log('Resolvers:', resolvers);
      for (const domain of domains) {
        const finalizations = await ipfs.getFinalizations(domain);
        console.log(`finalized_${domain}:`, finalizations.map(entry => ({
          txHash: entry.txHash,
          blockNumber: entry.blockNumber,
          cid: entry.cid?.toString ? entry.cid.toString() : entry.cid
        })));
      }
    } else if (action === 'reset') {
      await ipfs.resetIndexerData();
      console.log('Indexing-related data reset.');
    } else {
      console.error('Unknown action:', action);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  process.exit(0);
} 
