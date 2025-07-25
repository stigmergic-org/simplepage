const chainId = process.env.CHAIN_ID;

/**
 * useChainId - Custom hook that returns the expected chainId based on environment configuration
 * @returns {number} The expected chainId for the current environment
 */
export function useChainId() {
  if (!chainId) {
    console.warn('No chainId specified, defaulting to Sepolia (11155111)');
    return 11155111; // Sepolia
  }
  return parseInt(chainId, 10);
} 