import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useEnsName, useSwitchChain } from 'wagmi';
import { useChainId } from '../hooks/useChainId';
import { getNetworkName } from '../utils/networks';
import ConnectPanel from './ConnectPanel';

const WalletInfo = ({ expectedChainId: propExpectedChainId, noBottomMargin = false, onConnectUiChange }) => {
  const { address, isConnected, chainId: accountChainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors, isPending, pendingConnector } = useConnect();
  const { data: ensName } = useEnsName({
    address: address,
  });
  const globalExpectedChainId = useChainId();
  const expectedChainId = propExpectedChainId ?? globalExpectedChainId;
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [isConnectOpen, setIsConnectOpen] = useState(false);

  const safeConnector = useMemo(() => connectors.find((connector) => connector.id === 'safe'), [connectors]);
  const isSafeEnvironment = safeConnector?.ready === true;
  const isSafeConnecting = isPending && pendingConnector?.id === 'safe';
  const isAutoConnectingSafe = isSafeEnvironment && !isConnected;
  
  // Check if we need to switch networks
  const needsNetworkSwitch = isConnected && accountChainId !== expectedChainId;

  const handleConnect = () => {
    if (isSafeEnvironment) {
      return;
    }
    setIsConnectOpen((prev) => !prev);
  };

  useEffect(() => {
    if (isConnected) {
      setIsConnectOpen(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (typeof onConnectUiChange !== 'function') {
      return;
    }
    onConnectUiChange(isConnectOpen);
  }, [isConnectOpen, onConnectUiChange]);

  useEffect(() => {
    if (!isSafeEnvironment || isConnected || isPending || !safeConnector) {
      return;
    }
    connect({ connector: safeConnector });
  }, [connect, isConnected, isPending, isSafeEnvironment, safeConnector]);

  const handleSwitchNetwork = () => {
    switchChain({ chainId: expectedChainId });
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };



  return (
    <div className={noBottomMargin ? '' : 'mb-8'}>
      <div className={`border rounded-md ${
        needsNetworkSwitch ? 'border-warning bg-warning/10' : 'border-base-300'
      }`}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 ${
              isConnected
                ? needsNetworkSwitch
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
                : 'bg-red-500'
            } rounded-full`}></div>
            <div>
              <p className="text-sm font-medium !mb-0">
                {isConnected ? ensName || formatAddress(address) : 'Wallet not connected'}
              </p>
              {isConnected && accountChainId && (
                <p className={`text-xs ${needsNetworkSwitch ? 'text-warning' : 'text-gray-500'} !mb-0`}>
                  Connected to: {getNetworkName(accountChainId) || `Unsupported chain ${accountChainId}`}
                  {needsNetworkSwitch && ` (Expected: ${getNetworkName(expectedChainId) || `Unsupported chain ${expectedChainId}`})`}
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
                {isSwitching ? 'Switching...' : `Switch to ${getNetworkName(expectedChainId) || `Unsupported chain ${expectedChainId}`}`}
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
                disabled={isAutoConnectingSafe}
              >
                {isAutoConnectingSafe || isSafeConnecting ? 'Connecting to Safe...' : 'Connect'}
              </button>
            )}
          </div>
        </div>
        {!isConnected && isConnectOpen && !isSafeEnvironment ? (
          <div className="border-t border-base-300 p-4">
            <ConnectPanel onClose={() => setIsConnectOpen(false)} variant="embedded" />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WalletInfo; 
