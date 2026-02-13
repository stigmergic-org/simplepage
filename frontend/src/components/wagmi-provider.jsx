import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { sepolia, mainnet, localhost } from 'wagmi/chains'
import { useChainId } from '../hooks/useChainId'
import { buildWagmiConfig } from '../wagmi/config'

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
const walletConnectProjectId = process.env.WALLETCONNECT_PROJECT_ID;

/**
 * Create RPC transport configuration
 * @param {Object} rpcOverrides - { [chainId: number]: string } mapping of chainId to custom RPC URL
 * @param {number} expectedChainId - The expected chainId from environment
 */
const createRpcMap = (rpcOverrides = {}, expectedChainId) => {
  const rpcMap = { ...rpcOverrides };

  if (!rpcMap[sepolia.id] && expectedChainId === 11155111 && process.env.SEPOLIA_RPC_URL) {
    rpcMap[sepolia.id] = process.env.SEPOLIA_RPC_URL;
  }

  if (!rpcMap[mainnet.id] && expectedChainId === 1 && process.env.MAINNET_RPC_URL) {
    rpcMap[mainnet.id] = process.env.MAINNET_RPC_URL;
  }

  if (!rpcMap[localhost.id] && expectedChainId === 1337 && process.env.LOCAL_RPC_URL) {
    rpcMap[localhost.id] = process.env.LOCAL_RPC_URL;
  }

  return rpcMap;
};

const getConfig = (rpcOverrides, expectedChainId) => buildWagmiConfig({
  chains: networks,
  rpcMap: createRpcMap(rpcOverrides, expectedChainId),
  walletConnectProjectId,
});

/**
 * WagmiConfigProvider
 * @param {Object} props
 * @param {Object} [props.rpcOverrides] - { [chainId: number]: string } mapping of chainId to custom RPC URL
 */
const WagmiConfigProvider = ({ children, rpcOverrides }) => {
  const expectedChainId = useChainId();
  const config = getConfig(rpcOverrides, expectedChainId);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

export { WagmiConfigProvider };
export default WagmiConfigProvider;
