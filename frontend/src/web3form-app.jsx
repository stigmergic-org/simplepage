/**
 * Web3 Form iframe Application
 * Generates interactive forms from web3:// URIs with custom parameter names
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { parseWeb3Uri, parseWeb3Metadata, validateMetadataMatch } from './utils/web3UriParser';
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

  const [parsedUri, setParsedUri] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState('');
  const [iframeRef, setIframeRef] = useState(null);
  const containerRef = useRef(null);

  // Helper: Parse URI and set form state
  const parseAndSetFormData = (uriParam, metaParam) => {
    if (!uriParam) {
      setError('No web3 link found. Please check the markdown syntax.');
      setParsedUri(null);
      setMetadata(null);
      setIsLoading(false);
      return;
    }

    setError(null);

    try {
      // Parse the web3 URI
      const parsed = parseWeb3Uri(decodeURIComponent(uriParam));
      if (!parsed) {
        setError('Unable to understand the web3 link format. Please check the URL.');
        setIsLoading(false);
        return;
      }

      // Parse the metadata (form title and parameter names)
      const parsedMeta = parseWeb3Metadata(metaParam);

      // Validate that metadata matches URI arguments
      const validation = validateMetadataMatch(parsed, parsedMeta.params);
      if (!validation.valid) {
        setError(validation.errors.join(' '));
        setIsLoading(false);
        return;
      }

      // Set parsed data
      setParsedUri(parsed);
      setMetadata(parsedMeta);

      // Initialize form data with placeholders
      const initialData = {};
      if (parsed.args && parsed.args.length > 0) {
        parsed.args.forEach((arg, index) => {
          const paramName = parsedMeta.params?.[index] || arg.type;
          initialData[paramName] = arg.placeholder === '0x' ? '' : (arg.placeholder || '');
        });
      }
      // Add value parameter if present
      if (parsed.value) {
        initialData.value = parsed.value;
      }
      setFormData(initialData);

    } catch (err) {
      console.error('Error parsing URI or metadata:', err);
      setError('Something went wrong while processing the web3 link. Please check the format.');
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
        setIframeKey(key);

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
    if (parsedUri && !isLoading && iframeRef) {
      const height = containerRef.current.scrollHeight;
      iframeRef.style.height = `${height + 20}px`;
    }
  }, [parsedUri, isLoading, iframeRef]);

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const generateFormFields = () => {
    const fields = [];

    // Add method argument fields first
    if (parsedUri?.args && parsedUri.args.length > 0) {
      parsedUri.args.forEach((arg, index) => {
        const paramName = metadata?.params?.[index] || arg.type;
        const fieldName = paramName;

        fields.push(
          <div key={index} className="form-control">
            <label className="label">
              <span className="label-text font-medium">{paramName}</span>
            </label>
            <input
              type="text"
              name={fieldName}
              value={formData[fieldName] || ''}
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
    if (parsedUri?.value) {
      fields.push(
        <div key="value" className="form-control">
          <label className="label">
            <span className="label-text font-medium">Value (ETH)</span>
          </label>
          <input
            type="text"
            name="value"
            value={formData.value || ''}
            onChange={handleInputChange}
            placeholder="Amount in ETH"
            className="input input-bordered w-full"
          />
          <label className="label">
            <span className="label-text-alt text-xs text-gray-400">
              Default: {parsedUri.value}
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
            <div className="text-sm">{error}</div>
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
                {metadata?.formTitle || 'Contract Interaction'}
              </h2>
              {parsedUri?.contract && (
                <a
                  href={getBlockExplorerAddressUrl(parsedUri.chainId || 1, parsedUri.contract)}
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
            <WalletInfo expectedChainId={parsedUri?.chainId} noBottomMargin={true} />

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={true}
            >
              {parsedUri ? normalizeMethodName(parsedUri.method) : 'Loading...'}
            </button>
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
