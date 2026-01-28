/**
 * Web3 Form iframe Application
 * Generates interactive forms from web3:// URIs with custom parameter names
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { parseFormData } from './utils/web3UriParser';
import { getBlockExplorerAddressUrl, getBlockExplorerTxUrl } from './utils/networks';
import { buildMinimalAbi, encodeArguments, formatReturnValue, validateChainMatch } from './utils/web3FormUtils';
import Icon from './components/Icon';
import WalletInfo from './components/WalletInfo';
import Notice from './components/Notice';
import { createConfig, WagmiProvider, unstable_connector, useAccount, useWriteContract, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
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

const cardClassName = 'card border border-base-300 rounded-lg p-6 w-full bg-base-200';

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
  const [txHash, setTxHash] = useState(null);
  const [returnValue, setReturnValue] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeRef, setIframeRef] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txFailure, setTxFailure] = useState(null);
  const [showTxFailureDetails, setShowTxFailureDetails] = useState(false);
  const [valueUnit, setValueUnit] = useState('ETH');
  const containerRef = useRef(null);

  // Wagmi hooks
  const { address, chainId: accountChainId } = useAccount();
  const publicClient = usePublicClient();

  // For write operations
  const { writeContractAsync } = useWriteContract();
  const { data: txReceipt, isError: isTxReceiptError, error: txReceiptError } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: Boolean(txHash),
      structuralSharing: false,
    },
  });

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
        return data;
      } catch (error) {
        console.error('Error loading from storage:', error);
      }
    }
    return null;
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

        // Try to load from storage first
        const storedData = loadFromStorage(storageKey);
        if (storedData) {
          parseAndSetFormData(storedData.uri, storedData.meta);
          return;
        }

        // No storage data, parse from URL
        const urlParams = new URLSearchParams(window.location.search);
        const uriParam = urlParams.get('w3uri');
        const metaParam = urlParams.get('meta');

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

  // Effect: Height management (triggers on any render change)
  useEffect(() => {
    if (iframeRef && containerRef.current) {
      const height = containerRef.current.scrollHeight;
      iframeRef.style.height = `${height + 20}px`;
    }
  }, [parsedData, isLoading, error, iframeRef, returnValue, txHash, txFailure, showTxFailureDetails]);

  const handleInputChange = (e) => {
    setFormInputs(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleCopyReturnValue = async () => {
    if (returnValue === null || returnValue === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(String(returnValue));
    } catch (copyError) {
      console.error('Failed to copy return value:', copyError);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setReturnValue(null);
    setTxHash(null);
    setError(null);
    setTxFailure(null);
    setShowTxFailureDetails(false);
    
    // Validate inputs
    const { args, errors } = encodeArguments(parsedData, formInputs);
    if (errors.length > 0) {
      console.log('handleSubmit', errors, args)
      setError(errors);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (parsedData.call) {
        // Read operation
        const result = await publicClient.readContract({
          address: parsedData.contract,
          abi: buildMinimalAbi(parsedData),
          functionName: parsedData.method,
          args,
          account: address
        });
        if (result !== undefined && result !== null) {
          const formatted = formatReturnValue(result, parsedData.returns);
          setReturnValue(formatted);
        } else if (parsedData.returns) {
          setReturnValue('No data returned');
        }
      } else {
        // Write operation
        const abi = buildMinimalAbi(parsedData);
        
        const valueInput = formInputs.value?.toString().trim();
        const txHash = await writeContractAsync({
          address: parsedData.contract,
          abi,
          functionName: parsedData.method,
          args,
          value: valueInput
            ? (valueUnit === 'ETH' ? parseEther(valueInput) : BigInt(valueInput))
            : 0n,
          chainId: parsedData.chainId
        });
        setTxHash(txHash);
      }
    } catch (err) {
      console.error('Submission error:', err);
      if (parsedData?.call) {
        setError([err.message || 'Transaction failed']);
      } else {
        setTxFailure(err.message || 'Transaction failed');
      }
    } finally {
      setIsSubmitting(false);
    }
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
          <label className="label mb-1">
            <div className="flex items-center justify-between w-full gap-3">
              <span className="label-text font-medium">Value ({valueUnit})</span>
              <div className="join">
                <button
                  type="button"
                  className={`btn btn-xs join-item ${valueUnit === 'ETH' ? 'btn-primary btn-soft' : 'btn-ghost'}`}
                  onClick={() => setValueUnit('ETH')}
                >
                  ETH
                </button>
                <button
                  type="button"
                  className={`btn btn-xs join-item ${valueUnit === 'WEI' ? 'btn-primary btn-soft' : 'btn-ghost'}`}
                  onClick={() => setValueUnit('WEI')}
                >
                  WEI
                </button>
              </div>
            </div>
          </label>
          <input
            type="text"
            name="value"
            value={formInputs.value || ''}
            onChange={handleInputChange}
            placeholder={valueUnit === 'ETH' ? 'Amount in ETH' : 'Amount in WEI'}
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
    return (
      <div ref={containerRef} className={cardClassName}>
        <div className="flex flex-col justify-center items-center py-12 gap-4">
          <span className="loading loading-infinity loading-lg"></span>
          <h3 className="text-base-content/70">Loading contract interaction...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className={cardClassName}>
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
              <p><strong>URI:</strong> {new URLSearchParams(window.location.search).get('w3uri')}</p>
              <p><strong>Meta:</strong> {new URLSearchParams(window.location.search).get('meta')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cardClassName}>
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

      {/* Display transaction hash for write operations */}
      {txHash && !parsedData?.call && !txFailure && !isTxReceiptError && txReceipt?.status !== 'reverted' && (
        <Notice 
          type={txReceipt?.status === 'success' ? 'success' : 'info'}
          onClose={() => setTxHash(null)}
          className="mt-4"
        >
          <div className="flex flex-col gap-2">
            <a 
              href={getBlockExplorerTxUrl(parsedData?.chainId || 1, txHash)}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 underline"
            >
              <strong>{txReceipt?.status === 'success' ? 'Transaction complete' : 'Transaction submitted'}</strong>
              <Icon name="external-link" size={4} className="shrink-0" />
            </a>
            {!txReceipt?.status && !isTxReceiptError && (
              <div className="flex items-center gap-2 text-sm text-base-content/70">
                <span className="loading loading-infinity loading-xs"></span>
                <span>Waiting for confirmation...</span>
              </div>
            )}
          </div>
        </Notice>
      )}

      {(txFailure || isTxReceiptError || txReceipt?.status === 'reverted') && (
        <Notice
          type="error"
          onClose={() => {
            setTxHash(null);
            setTxFailure(null);
            setShowTxFailureDetails(false);
          }}
          className="mt-4"
        >
          <div>
            <strong>Transaction failed</strong>
            <p className="text-sm">
              {(txFailure || txReceiptError?.message || 'The transaction reverted.').split('\n')[0]}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-xs mt-2"
              onClick={() => setShowTxFailureDetails((prev) => !prev)}
            >
              {showTxFailureDetails ? 'Hide details' : 'Show details'}
            </button>
            {showTxFailureDetails && (
              <pre className="mt-2 text-xs whitespace-pre-wrap break-words">
                {txFailure || txReceiptError?.message || 'The transaction reverted.'}
              </pre>
            )}
          </div>
        </Notice>
      )}

      {/* Display return value for read operations */}
      {returnValue !== null && returnValue !== undefined && parsedData?.call && (
        <Notice 
          type="success" 
          onClose={() => setReturnValue(null)}
          className="mt-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <strong className="whitespace-nowrap">Result:</strong>
            <div className="flex items-start gap-2 min-w-0 flex-wrap">
              <code className="bg-base-300 px-2 py-1 rounded text-xs break-all max-w-full inline-block flex-1">
                {returnValue}
              </code>
              <div className="tooltip" data-tip="Copy">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={handleCopyReturnValue}
                  aria-label="Copy return value"
                >
                  <Icon name="copy" size={4} />
                </button>
              </div>
            </div>
          </div>
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {generateFormFields()}

        <button
          type="submit"
          className="btn btn-primary w-full relative"
          disabled={
            !address ||
            (parsedData && accountChainId && !validateChainMatch(parsedData.chainId, accountChainId)) ||
            isSubmitting
          }
        >
          <span className="flex items-center justify-center w-full">
            {parsedData && parsedData.call ? (
              <div className="badge badge-info badge-sm badge-soft absolute right-2">Read Only</div>
            ) : null}
            <span>
              {isSubmitting ? 'Loading...' : (parsedData ? normalizeMethodName(parsedData.method) : 'Loading...')}
            </span>
          </span>
        </button>
      </form>

      <div className="divider"></div>
      <WalletInfo expectedChainId={parsedData?.chainId} noBottomMargin={true} />
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
