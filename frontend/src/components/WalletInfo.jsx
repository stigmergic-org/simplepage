import React from 'react';
import { useAccount, useDisconnect, useEnsName, useConnect } from 'wagmi';
import { useNavigation } from '../hooks/useNavigation';

const WalletInfo = () => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors } = useConnect();
  
  const { data: ensName } = useEnsName({
    address: address,
  });

  const handleConnect = () => {
    const connector = connectors[0]; // Use the first available connector (usually MetaMask)
    if (connector) {
      connect({ connector });
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex items-center justify-between p-4 border-base-300 border mb-8 rounded-md">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 ${isConnected ? 'bg-green-500' : 'bg-red-500'} rounded-full`}></div>
        <div>
          <p className="text-sm font-medium">
            {isConnected ? ensName || formatAddress(address) : 'Wallet not connected'}
          </p>
        </div>
      </div>
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
  );
};

export default WalletInfo; 