import React from 'react';
import { useConnect } from 'wagmi';

const ConnectModal = ({ children }) => {
  const { isConnected, connectors, connect } = useConnect();
  console.log('connectors', connectors);
  return (
    <div>
      {!isConnected && (
        <div className="fixed inset-0 z-[20]">
          <div className="absolute inset-0 bg-white bg-opacity-75 flex flex-col items-center justify-center">
            <div className="card w-96 bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title justify-center mb-4">Connect Wallet</h2>
                
                <div className="flex flex-col gap-2">
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      onClick={() => {
                        connect({ connector });
                      }}
                      className="btn btn-outline"
                    >
                      {connector.name}
                    </button>
                  ))}
                </div>

                <div className="divider">OR</div>
                
                <a 
                  href="https://ethereum.org/en/wallets/find-wallet/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary text-center"
                >
                  I don't have a wallet
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={!isConnected ? 'blur-sm' : ''}>
        {children}
      </div>
    </div>
  );
};

export default ConnectModal; 