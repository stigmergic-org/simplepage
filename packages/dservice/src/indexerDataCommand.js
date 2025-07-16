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
      const domains = await ipfs.getList('domains', 'string');
      const resolvers = await ipfs.getList('resolvers', 'address');
      console.log('Domains:', domains);
      console.log('Resolvers:', resolvers);
      for (const domain of domains) {
        const chList = await ipfs.getList(`contenthash_${domain}`, 'string');
        console.log(`contenthash_${domain}:`, chList);
      }
    } else if (action === 'reset') {
      const domains = await ipfs.getList('domains', 'string');
      const resolvers = await ipfs.getList('resolvers', 'address');
      // Remove all contenthash_{domain} lists
      for (const domain of domains) {
        const chList = await ipfs.getList(`contenthash_${domain}`, 'string');
        for (const entry of chList) {
          await ipfs.removeFromList(`contenthash_${domain}`, 'string', entry);
        }
      }
      // Remove all domains
      for (const domain of domains) {
        await ipfs.removeFromList('domains', 'string', domain);
      }
      // Remove all resolvers
      for (const resolver of resolvers) {
        await ipfs.removeFromList('resolvers', 'address', resolver);
      }
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