import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createConfig, http } from 'wagmi'
import { sepolia, mainnet, localhost } from 'wagmi/chains'
import { injected, safe } from 'wagmi/connectors'
import { WagmiProvider } from 'wagmi'

// 0. Setup queryClient
const queryClient = new QueryClient()

// 1. Set the networks based on chainId
const getNetwork = () => {
  const chainId = process.env.CHAIN_ID;
  if (!chainId) {
    console.warn('No chainId specified, defaulting to Sepolia');
    return [sepolia];
  }
  
  const chainIdNum = parseInt(chainId, 10);
  switch (chainIdNum) {
    case 11155111: // Sepolia
      return [sepolia];
    case 1: // Mainnet
      return [mainnet];
    case 1337: // localhost
      return [localhost];
    default:
      console.warn(`Unsupported chainId: ${chainId}, defaulting to Sepolia`);
      return [sepolia];
  }
};

const networks = getNetwork();

/**
 * Create RPC transport configuration
 * @param {Object} rpcOverrides - { [chainId: number]: string } mapping of chainId to custom RPC URL
 */
const createTransports = (rpcOverrides = {}) => {
  const transports = {};
  const chainId = process.env.CHAIN_ID;

  // Always check for override first
  if (rpcOverrides[sepolia.id]) {
    transports[sepolia.id] = http(rpcOverrides[sepolia.id]);
  } else if (chainId === '11155111') {
    transports[sepolia.id] = http(process.env.SEPOLIA_RPC_URL);
  }

  if (rpcOverrides[mainnet.id]) {
    transports[mainnet.id] = http(rpcOverrides[mainnet.id]);
  } else if (chainId === '1') {
    transports[mainnet.id] = http(process.env.MAINNET_RPC_URL);
  }

  if (rpcOverrides[localhost.id]) {
    transports[localhost.id] = http(rpcOverrides[localhost.id]);
  } else if (chainId === '1337') {
    transports[localhost.id] = http(process.env.LOCAL_RPC_URL);
  }

  // Fallback: if no env or override, warn and use Sepolia
  if (!transports[sepolia.id]) {
    transports[sepolia.id] = http(process.env.SEPOLIA_RPC_URL);
  }

  return transports;
};

// Create wagmi config with injected and safe connectors
const getConfig = (rpcOverrides) => createConfig({
  chains: networks,
  connectors: [
    injected(),
    safe(),
  ],
  transports: createTransports(rpcOverrides),
});

/**
 * WagmiConfigProvider
 * @param {Object} props
 * @param {Object} [props.rpcOverrides] - { [chainId: number]: string } mapping of chainId to custom RPC URL
 */
const WagmiConfigProvider = ({ children, rpcOverrides }) => {
  const config = getConfig(rpcOverrides);
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

export { WagmiConfigProvider };
export default WagmiConfigProvider;
