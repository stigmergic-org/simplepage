/**
 * Web3 Form iframe Application
 * Generates interactive forms from web3:// URIs with custom parameter names
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { parseFormData } from './utils/web3UriParser';
import { getBlockExplorerAddressUrl } from './utils/networks';
import Icon from './components/Icon';
import WalletInfo from './components/WalletInfo';
import { createConfig, WagmiProvider, unstable_connector } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia, linea, lineaSepolia } from 'wagmi/chains';
import { injected, safe } from 'wagmi/connectors';
import './app.css';

// Create wagmi config for iframe
const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia, linea, lineaSepolia],
  connectors: [injected(), safe()],
  transports: {
    [mainnet.id]: unstable_connector(injected),
    [sepolia.id]: unstable_connector(injected),
    [base.id]: unstable_connector(injected),
    [baseSepolia.id]: unstable_connector(injected),
    [arbitrum.id]: unstable_connector(injected),
    [arbitrumSepolia.id]: unstable_connector(injected),
    [optimism.id]: unstable_connector(injected),
    [optimismSepolia.id]: unstable_connector(injected),
    [linea.id]: unstable_connector(injected),
    [lineaSepolia.id]: unstable_connector(injected),
  },
});

// Create query client
const queryClient = new QueryClient();

// Normalize method names from camelCase/snake_case to Title Case
const normalizeMethodName = (method) => {
  if (!method) return '';
  return method
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Web3FormApp component
const Web3FormApp = () => {

  const [parsedData, setParsedData] = useState(null);
  const [formInputs, setFormInputs] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeRef, setIframeRef] = useState(null);
  const containerRef = useRef(null);

  // Helper: Parse URI and set form state using consolidated parser
  const parseAndSetFormData = (uriParam, metaParam) => {
    const result = parseFormData(uriParam, metaParam);

    if (result.errors.length > 0) {
      setError(result.errors);
      setParsedData(null);
    } else {
      setError(null);
      setParsedData(result);
      
      // Initialize form inputs with placeholders from args
      const initialInputs = {};
      result.args.forEach((arg) => {
        initialInputs[arg.label] = arg.placeholder === '0x' ? '' : (arg.placeholder || '');
      });
      if (result.value !== null && result.value !== undefined) {
        initialInputs.value = result.value;
      }
      setFormInputs(initialInputs);
    }

    setIsLoading(false);
  };

  // Helper: Load from storage and set state
  const loadFromStorage = (storageKey) => {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        parseAndSetFormData(data.uri, data.meta);
        return true; // Successfully loaded from storage
      } catch (error) {
        console.error('Error loading from storage:', error);
      }
    }
    return false; // No storage data
  };

  // Single effect: Complete setup, storage, and parsing
  useEffect(() => {
    // Find our iframe
    const iframes = window.parent.document.querySelectorAll('iframe');
    const ourIframe = Array.from(iframes).find(iframe =>
      iframe.contentWindow === window
    );

    if (ourIframe) {
      setIframeRef(ourIframe);

      // Extract key
      const key = ourIframe.dataset.key || ourIframe.getAttribute('data-key');
      if (key) {
        const storageKey = `web3form_${key}`;

        // Try to load from storage first (handles corruptions)
        if (loadFromStorage(storageKey)) {
          return; // Skip URL parsing if loaded from storage
        }

        // No storage data, parse from URL
        const urlParams = new URLSearchParams(window.location.search);
        const uriParam = urlParams.get('uri');
        const metaParam = urlParams.get('meta');

        // Parse from URL and save to storage
        parseAndSetFormData(uriParam, metaParam);

        // Save to storage for future recovery
        if (uriParam) {
          sessionStorage.setItem(storageKey, JSON.stringify({
            uri: uriParam,
            meta: metaParam || '',
            timestamp: Date.now()
          }));
        }
      }
    }
  }, []); // One-time setup

  // Effect: Height management (waits for data and iframe)
  useEffect(() => {
    if (parsedData && !isLoading && iframeRef) {
      const height = containerRef.current.scrollHeight;
      iframeRef.style.height = `${height + 20}px`;
    }
  }, [parsedData, isLoading, iframeRef]);

  const handleInputChange = (e) => {
    setFormInputs(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const generateFormFields = () => {
    const fields = [];

    // Add method argument fields first
    if (parsedData?.args && parsedData.args.length > 0) {
      parsedData.args.forEach((arg, index) => {
        fields.push(
          <div key={index} className="form-control">
            <label className="label">
              <span className="label-text font-medium">{arg.label}</span>
            </label>
            <input
              type="text"
              name={arg.label}
              value={formInputs[arg.label] || ''}
              onChange={handleInputChange}
              placeholder={arg.type}
              className="input input-bordered w-full"
            />
            {arg.placeholder && arg.placeholder !== '0x' && (
              <label className="label">
                <span className="label-text-alt text-xs text-gray-400">
                  Default: {arg.placeholder}
                </span>
              </label>
            )}
          </div>
        );
      });
    }

    // Add value field if present (after method arguments)
    if (parsedData?.value !== null && parsedData?.value !== undefined) {
      fields.push(
        <div key="value" className="form-control">
          <label className="label">
            <span className="label-text font-medium">Value (ETH)</span>
          </label>
          <input
            type="text"
            name="value"
            value={formInputs.value || ''}
            onChange={handleInputChange}
            placeholder="Amount in ETH"
            className="input input-bordered w-full"
          />
          <label className="label">
            <span className="label-text-alt text-xs text-gray-400">
              Default: {parsedData.value}
            </span>
          </label>
        </div>
      );
    }

    // Return empty fragment if no fields
    if (fields.length === 0) {
      return (<></>);
    }

    return fields;
  };

  if (isLoading) {
    return <></>;
  }

  return (
    <div ref={containerRef} className="card border border-base-300 rounded-lg p-6 w-full bg-base-200">
      {error ? (
        <div className="alert alert-error mb-4">
          <Icon name="error" size={8} className="shrink-0" />
          <div>
            <h3 className="font-bold">Unable to Load Form</h3>
            {Array.isArray(error) ? (
              <ul className="text-sm list-disc list-inside">
                {error.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm">{error}</div>
            )}
            <div className="mt-2 text-xs font-mono">
              <p><strong>URI:</strong> {new URLSearchParams(window.location.search).get('uri')}</p>
              <p><strong>Meta:</strong> {new URLSearchParams(window.location.search).get('meta')}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-2xl font-bold text-base-content">
                {parsedData?.formTitle || 'Contract Interaction'}
              </h2>
              {parsedData?.contract && (
                <a
                  href={getBlockExplorerAddressUrl(parsedData.chainId || 1, parsedData.contract)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm p-1 tooltip tooltip-bottom"
                  data-tip="View Contract"
                >
                  <Icon name="external-link" size={4} />
                </a>
              )}
            </div>
          </div>

          <form className="space-y-4">
            {generateFormFields()}

            <div className="divider"></div>
            <WalletInfo expectedChainId={parsedData?.chainId} noBottomMargin={true} />

            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={true}
              >
                {parsedData ? normalizeMethodName(parsedData.method) : 'Loading...'}
              </button>
              {parsedData && parsedData.call && (
                <div className="badge badge-info badge-sm mx-auto">Read Only</div>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
};

// App wrapper with providers
const AppWithProviders = () => (
  <QueryClientProvider client={queryClient}>
    <WagmiProvider config={wagmiConfig}>
      <Web3FormApp />
    </WagmiProvider>
  </QueryClientProvider>
);

// Mount the app (works in iframe or direct load)
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<AppWithProviders />);
