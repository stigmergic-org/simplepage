import React from 'react';
import { useAccount, useDisconnect, useEnsName, useConnect, useSwitchChain } from 'wagmi';
import { useChainId } from '../hooks/useChainId';

const WalletInfo = () => {
  const { address, isConnected, chainId: accountChainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors } = useConnect();
  const { data: ensName } = useEnsName({
    address: address,
  });
  const expectedChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  
  // Check if we need to switch networks
  const needsNetworkSwitch = isConnected && accountChainId !== expectedChainId;

  const handleConnect = () => {
    const connector = connectors[0]; // Use the first available connector (usually MetaMask)
    if (connector) {
      connect({ connector });
    }
  };

  const handleSwitchNetwork = () => {
    switchChain({ chainId: expectedChainId });
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getChainName = (chainId) => {
    switch (chainId) {
      case 1:
        return 'Ethereum Mainnet';
      case 11155111:
        return 'Sepolia Testnet';
      case 1337:
        return 'Localhost';
      default:
        return `Chain ${chainId}`;
    }
  };

  return (
    <div className={`flex items-center justify-between p-4 border mb-8 rounded-md ${
      needsNetworkSwitch ? 'border-warning bg-warning/10' : 'border-base-300'
    }`}>
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 ${
          isConnected 
            ? needsNetworkSwitch 
              ? 'bg-yellow-500' 
              : 'bg-green-500' 
            : 'bg-red-500'
        } rounded-full`}></div>
        <div>
          <p className="text-sm font-medium">
            {isConnected ? ensName || formatAddress(address) : 'Wallet not connected'}
          </p>
          {isConnected && accountChainId && (
            <p className={`text-xs ${needsNetworkSwitch ? 'text-warning' : 'text-gray-500'}`}>
              Connected to: {getChainName(accountChainId)}
              {needsNetworkSwitch && ` (Expected: ${getChainName(expectedChainId)})`}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {needsNetworkSwitch && (
          <button
            onClick={handleSwitchNetwork}
            disabled={isSwitching}
            className="btn btn-warning btn-sm"
          >
            {isSwitching ? 'Switching...' : `Switch to ${getChainName(expectedChainId)}`}
          </button>
        )}
        {isConnected ? (
          <button
            onClick={disconnect}
            className="btn btn-outline btn-sm"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="btn btn-primary btn-sm"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
};

export default WalletInfo; 