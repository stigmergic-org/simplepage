/**
 * Network utilities for Ethereum rollup networks and Sepolia-based test networks
 */

/**
 * Get network name from chain ID
 * @param {number} chainId - The chain ID
 * @returns {string} The network name
 */
export const getNetworkName = (chainId) => {
  const networks = {
    // Mainnets
    1: 'Ethereum',
    10: 'Optimism',
    8453: 'Base',
    42161: 'Arbitrum One',
    59144: 'Linea',
    57073: 'Ink',
    1301: 'Unichain',
    534352: 'Scroll',

    // Testnets (Sepolia-based)
    11155111: 'Sepolia',
    11155420: 'Optimism Sepolia',
    84532: 'Base Sepolia',
    421614: 'Arbitrum Sepolia',
    59141: 'Linea Sepolia',
    1302: 'Unichain Sepolia',
    534351: 'Scroll Sepolia',

    // Local development
    31337: 'Localhost',
    1337: 'Localhost',
  };
  return networks[chainId] || null;
};

/**
 * Get block explorer domain for a chain ID (without https://)
 * @param {number} chainId - The chain ID
 * @returns {string} The explorer domain
 */
export const getBlockExplorerDomain = (chainId) => {
  const domains = {
    // Mainnets
    1: 'etherscan.io',                    // Ethereum
    10: 'optimistic.etherscan.io',         // Optimism
    8453: 'basescan.org',                   // Base
    42161: 'arbiscan.io',                   // Arbitrum One
    59144: 'lineascan.build',               // Linea
    57073: 'explorer.inkonchain.com',      // Ink
    1301: 'unichain.blockscout.com',       // Unichain
    534352: 'scrollscan.com',               // Scroll

    // Testnets
    11155111: 'sepolia.etherscan.io',            // Sepolia
    11155420: 'sepolia-optimistic.etherscan.io',  // Optimism Sepolia
    84532: 'sepolia.basescan.org',               // Base Sepolia
    421614: 'sepolia.arbiscan.io',               // Arbitrum Sepolia
    59141: 'sepolia.lineascan.build',            // Linea Sepolia
    57073: 'explorer-sepolia.inkonchain.com',   // Ink Sepolia (same chain ID as mainnet?)
    1302: 'unichain-sepolia.blockscout.com',     // Unichain Sepolia
    534351: 'sepolia.scrollscan.com',            // Scroll Sepolia
  };

  return domains[chainId] || 'etherscan.io'; // Fallback to mainnet
};

/**
 * Get full block explorer URL for an address
 * @param {number} chainId - The chain ID
 * @param {string} address - The contract/address
 * @returns {string} Full explorer URL
 */
export const getBlockExplorerAddressUrl = (chainId, address) => {
  const domain = getBlockExplorerDomain(chainId);
  return `https://${domain}/address/${address}`;
};

/**
 * Get full block explorer URL for a transaction
 * @param {number} chainId - The chain ID
 * @param {string} txHash - The transaction hash
 * @returns {string} Full explorer URL
 */
export const getBlockExplorerTxUrl = (chainId, txHash) => {
  const domain = getBlockExplorerDomain(chainId);
  return `https://${domain}/tx/${txHash}`;
};