import React, { useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import { OverridesBanner, useRpcOverride } from '@simplepg/react-components';
import { WagmiProvider, createConfig } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import Home from './pages/Home.jsx';
import Tx from './pages/Tx.jsx';
import Address from './pages/Address.jsx';

const PUBLIC_RPCS = [
  'https://eth.drpc.org',
  'https://ethereum-rpc.publicnode.com',
];

const pickRandomRpc = () => PUBLIC_RPCS[Math.floor(Math.random() * PUBLIC_RPCS.length)];

const queryClient = new QueryClient();

export default function App() {
  const rpcOverrides = useRpcOverride();
  const [publicRpc] = useState(() => pickRandomRpc());

  const { transport } = useMemo(() => {
    if (rpcOverrides?.[1]) {
      return { transport: http(rpcOverrides[1]) };
    }
    return { transport: http(publicRpc) };
  }, [rpcOverrides, publicRpc]);

  const config = useMemo(
    () => createConfig({
      chains: [mainnet],
      transports: {
        [mainnet.id]: transport,
      },
    }),
    [transport]
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="bg-base-200 min-h-screen">
            <div className="px-4 pt-4 max-w-6xl mx-auto w-full space-y-4">
              {Object.keys(rpcOverrides).length > 0 && (
                <OverridesBanner rpcOverrides={rpcOverrides} />
              )}
            </div>
            <div className="px-4 py-6 max-w-6xl mx-auto w-full">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/tx/:txhash" element={<Tx />} />
                <Route path="/address/:address" element={<Address />} />
              </Routes>
            </div>
          </div>
        </Router>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
