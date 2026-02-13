import React, { useMemo } from 'react';
import { useConnect } from 'wagmi';
import Icon from './Icon';

const CONNECTOR_LABELS = {
  injected: 'Browser wallet',
  walletConnect: 'WalletConnect',
};

const ALLOWED_CONNECTOR_IDS = new Set(['injected', 'walletConnect']);

const ConnectPanel = ({ onClose, className = '', title = 'Connect Wallet', variant = 'card' }) => {
  const { connect, connectors, error, isPending, pendingConnector } = useConnect();
  const isEmbedded = variant === 'embedded';

  const visibleConnectors = useMemo(() => {
    const seen = new Set();
    return connectors.filter((connector) => {
      if (!ALLOWED_CONNECTOR_IDS.has(connector.id) || seen.has(connector.id)) {
        return false;
      }
      seen.add(connector.id);
      return true;
    });
  }, [connectors]);

  const errorMessage = error?.message ? error.message.split('\n')[0] : null;

  return (
    <div className={isEmbedded ? `w-full ${className}` : `card w-full border border-base-300 bg-base-100 ${className}`}>
      <div className={isEmbedded ? 'flex flex-col gap-4' : 'card-body'}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={isEmbedded ? 'text-base font-semibold' : 'card-title'}>{title}</h2>
          {onClose ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle"
              onClick={onClose}
              aria-label="Close"
            >
              <Icon name="close" size={4} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {visibleConnectors.map((connector) => {
            const isConnecting = isPending && pendingConnector?.id === connector.id;
            const isUnavailable = connector.id === 'injected' && connector.ready === false;
            const isDisabled = isUnavailable || isConnecting;
            const displayName = CONNECTOR_LABELS[connector.id] || connector.name;

            return (
              <button
                key={connector.id}
                type="button"
                onClick={() => connect({ connector })}
                disabled={isDisabled}
                className={`btn btn-soft btn-primary justify-between ${isUnavailable ? 'opacity-60' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span>{displayName}</span>
                  {isUnavailable ? (
                    <span className="badge badge-ghost badge-sm">Unavailable</span>
                  ) : null}
                </span>
                {isConnecting ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : null}
              </button>
            );
          })}
        </div>

        {errorMessage ? (
          <div className="text-error text-sm">{errorMessage}</div>
        ) : null}

        <div className="divider my-2">OR</div>

        <a
          href="https://ethereum.org/en/wallets/find-wallet/"
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary text-center pb-2"
        >
          I don&apos;t have a wallet
        </a>
      </div>
    </div>
  );
};

export default ConnectPanel;
