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