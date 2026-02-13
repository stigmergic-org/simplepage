import { createConfig, fallback, http, unstable_connector } from 'wagmi';
import { injected, safe, walletConnect } from 'wagmi/connectors';

const defaultAppMetadata = {
  name: 'SimplePage',
  description: 'SimplePage',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: [],
};

const buildMetadata = (appMetadata) => ({
  ...defaultAppMetadata,
  ...(appMetadata || {}),
});

export const buildConnectors = ({ walletConnectProjectId, appMetadata } = {}) => {
  const connectors = [injected({ shimDisconnect: true }), safe()];

  if (walletConnectProjectId) {
    connectors.splice(1, 0, walletConnect({
      projectId: walletConnectProjectId,
      metadata: buildMetadata(appMetadata),
    }));
  }

  return connectors;
};

export const buildTransports = ({ chains, rpcMap = {}, useConnectorFallback = false }) => {
  return Object.fromEntries(
    chains.map((chain) => {
      const rpcUrl = rpcMap[chain.id];
      const httpTransport = rpcUrl ? http(rpcUrl) : http();

      if (!useConnectorFallback) {
        return [chain.id, httpTransport];
      }

      return [
        chain.id,
        fallback([
          unstable_connector(injected),
          httpTransport,
        ]),
      ];
    })
  );
};

export const buildWagmiConfig = ({
  chains,
  rpcMap,
  walletConnectProjectId,
  appMetadata,
  useConnectorFallback = false,
} = {}) => {
  return createConfig({
    chains,
    connectors: buildConnectors({ walletConnectProjectId, appMetadata }),
    transports: buildTransports({ chains, rpcMap, useConnectorFallback }),
  });
};
