/**
 * Web3 Form iframe Application
 * Generates interactive forms from web3:// URIs with custom parameter names
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { parseFormData } from './utils/web3UriParser';
import { getBlockExplorerAddressUrl, getBlockExplorerTxUrl } from './utils/networks';
import { buildMinimalAbi, encodeArguments, formatReturnValue, formatScaledValue, parseScaledInput, validateChainMatch } from './utils/web3FormUtils';
import Icon from './components/Icon';
import WalletInfo from './components/WalletInfo';
import Notice from './components/Notice';
import UnitToggle from './components/UnitToggle';
import { createConfig, WagmiProvider, unstable_connector, useAccount, useWriteContract, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia, linea, lineaSepolia } from 'wagmi/chains';
import { injected, safe } from 'wagmi/connectors';
import { normalize } from 'viem/ens';
import { useChainId } from './hooks/useChainId';
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
  const [parseError, setParseError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [returnValue, setReturnValue] = useState(null);
  const [returnRawValue, setReturnRawValue] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeRef, setIframeRef] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txFailure, setTxFailure] = useState(null);
  const [showTxFailureDetails, setShowTxFailureDetails] = useState(false);
  const [valueUnit, setValueUnit] = useState('ETH');
  const [argUnits, setArgUnits] = useState([]);
  const [returnUnit, setReturnUnit] = useState('scaled');
  const containerRef = useRef(null);

  const getHashParams = () => new URLSearchParams(window.location.hash.replace(/^#/, ''));

  // Wagmi hooks
  const { address, chainId: accountChainId } = useAccount();
  const publicClient = usePublicClient();
  const globalChainId = useChainId();
  const ensClient = usePublicClient({ chainId: globalChainId });

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
  const parseAndSetFormData = (uriParam, textParam) => {
    const result = parseFormData(uriParam, textParam);

    if (result.errors.length > 0) {
      setParseError(result.errors);
      setParsedData(null);
      setReturnRawValue(null);
    } else {
      setParseError(null);
      setParsedData(result);
      setFormError(null);
      
      // Initialize form inputs with placeholders from args
      const initialInputs = {};
      result.args.forEach((arg, index) => {
        const placeholder = arg.placeholder === '0x' ? '' : (arg.placeholder || '');
        const decimals = result.decimals?.[index];
        if (placeholder && decimals !== null && decimals !== undefined) {
          try {
            initialInputs[arg.label] = formatScaledValue(BigInt(placeholder), decimals);
          } catch (_error) {
            initialInputs[arg.label] = placeholder;
          }
        } else {
          initialInputs[arg.label] = placeholder;
        }
      });
      if (result.value !== null && result.value !== undefined) {
        const valueString = valueUnit === 'ETH'
          ? formatScaledValue(BigInt(result.value), 18)
          : String(result.value);
        initialInputs.value = valueString;
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

  // Initialize iframe context, hash params, and session storage
  useEffect(() => {
    let ourIframe = null;
    try {
      const iframes = window.parent.document.querySelectorAll('iframe');
      ourIframe = Array.from(iframes).find(iframe =>
        iframe.contentWindow === window
      );
    } catch (_error) {
      ourIframe = null;
    }

    if (ourIframe) {
      setIframeRef(ourIframe);
    }

    const hashParams = getHashParams();
    const uriParam = hashParams.get('w3uri');
    const textParam = hashParams.get('text');
    const keyParam = hashParams.get('key');

    if (keyParam) {
      const storageKey = `web3form_${keyParam}`;

      // Try to load from storage first
      const storedData = loadFromStorage(storageKey);
      if (storedData) {
        parseAndSetFormData(storedData.uri, storedData.text);
        return;
      }

      parseAndSetFormData(uriParam, textParam);

      // Save to storage for future recovery
      if (uriParam) {
        sessionStorage.setItem(storageKey, JSON.stringify({
          uri: uriParam,
          text: textParam || '',
          timestamp: Date.now()
        }));
      }
      return;
    }

    parseAndSetFormData(uriParam, textParam);
  }, []); // One-time setup

  // Sync default units when parsed data changes
  useEffect(() => {
    if (!parsedData?.args) {
      return;
    }

    const units = parsedData.args.map((_arg, index) =>
      parsedData.decimals?.[index] !== null && parsedData.decimals?.[index] !== undefined
        ? 'scaled'
        : 'raw'
    );
    setArgUnits(units);

    if (parsedData.returnDecimals !== null && parsedData.returnDecimals !== undefined) {
      setReturnUnit('scaled');
    } else {
      setReturnUnit('raw');
    }
  }, [parsedData]);

  // Reformat return value when unit or data changes
  useEffect(() => {
    if (returnRawValue === null || returnRawValue === undefined) {
      return;
    }

    setReturnValue(formatReturnValue(returnRawValue, parsedData?.returns, {
      decimals: parsedData?.returnDecimals,
      unit: returnUnit,
    }));
  }, [returnRawValue, parsedData, returnUnit]);

  // Adjust iframe height after render changes
  useEffect(() => {
    if (iframeRef && containerRef.current) {
      const height = containerRef.current.scrollHeight;
      iframeRef.style.height = `${height + 20}px`;
    }
  }, [parsedData, isLoading, parseError, formError, iframeRef, returnValue, txHash, txFailure, showTxFailureDetails]);

  const handleInputChange = (e) => {
    setFormInputs(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleArgUnitChange = (index, unit) => {
    setArgUnits((prev) => {
      const next = [...prev];
      next[index] = unit;
      return next;
    });
  };

  const handleValueUnitChange = (nextUnit) => {
    setValueUnit(nextUnit);
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

  const resolveEnsNames = async () => {
    if (!parsedData?.args?.length) {
      return { resolvedInputs: formInputs, errors: [] };
    }

    const resolvedInputs = { ...formInputs };
    const errors = [];

    for (const arg of parsedData.args) {
      if (arg.type?.toLowerCase() !== 'address') {
        continue;
      }

      const rawValue = formInputs[arg.label];
      if (!rawValue || typeof rawValue !== 'string') {
        continue;
      }

      const trimmed = rawValue.trim();
      if (trimmed === '' || trimmed.startsWith('0x') || !trimmed.includes('.')) {
        continue;
      }

      try {
        const normalized = normalize(trimmed);
        const resolved = await ensClient.getEnsAddress({
          name: normalized,
          chainId: globalChainId
        });

        if (!resolved) {
          errors.push(`${arg.label}: ENS name not found`);
          continue;
        }

        resolvedInputs[arg.label] = resolved;
      } catch (error) {
        console.error('ENS resolution failed:', error);
        errors.push(`${arg.label}: Failed to resolve ENS name`);
      }
    }

    return { resolvedInputs, errors };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setReturnValue(null);
    setReturnRawValue(null);
    setTxHash(null);
    setFormError(null);
    setTxFailure(null);
    setShowTxFailureDetails(false);
    
    // Validate inputs
    const { resolvedInputs, errors: ensErrors } = await resolveEnsNames();
    if (ensErrors.length > 0) {
      setFormError(ensErrors);
      return;
    }

    const { args, errors } = encodeArguments(parsedData, resolvedInputs, { argUnits });
    if (errors.length > 0) {
      setFormError(errors);
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
          account: address,
          chainId: parsedData.chainId
        });
        if (result !== undefined && result !== null) {
          setReturnRawValue(result);
        } else if (parsedData.returns) {
          setReturnValue('No data returned');
        }
      } else {
        // Write operation
        const abi = buildMinimalAbi(parsedData);
        
        const valueInput = formInputs.value?.toString().trim();
        const txValue = valueInput
          ? (valueUnit === 'ETH' ? BigInt(parseScaledInput(valueInput, 18)) : BigInt(valueInput))
          : 0n;
        let gasEstimate;

        try {
          gasEstimate = await publicClient.estimateContractGas({
            address: parsedData.contract,
            abi,
            functionName: parsedData.method,
            args,
            value: txValue,
            account: address,
            chainId: parsedData.chainId
          });
        } catch (gasError) {
          console.warn('Gas estimation failed, sending without override:', gasError);
        }

        const txHash = await writeContractAsync({
          address: parsedData.contract,
          abi,
          functionName: parsedData.method,
          args,
          value: txValue,
          ...(gasEstimate ? { gas: gasEstimate } : {}),
          chainId: parsedData.chainId
        });
        setTxHash(txHash);
      }
    } catch (err) {
      console.error('Submission error:', err);
      if (parsedData?.call) {
        setFormError([err.message || 'Transaction failed']);
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
            <label className="label mb-1">
              <div className="flex items-center justify-between w-full gap-3">
                <span className="label-text font-medium">{arg.label}</span>
                {parsedData?.decimals?.[index] !== null && parsedData?.decimals?.[index] !== undefined ? (
                  <UnitToggle
                    leftLabel={`Scaled (1e${parsedData.decimals[index]})`}
                    rightLabel="Raw"
                    value={argUnits[index] || 'scaled'}
                    inputValue={formInputs[arg.label] || ''}
                    onValueChange={(nextValue) => setFormInputs((prev) => ({
                      ...prev,
                      [arg.label]: nextValue
                    }))}
                    decimals={parsedData.decimals[index]}
                    onChange={(unit) => handleArgUnitChange(index, unit)}
                  />
                ) : null}
              </div>
            </label>
            <input
              type="text"
              name={arg.label}
              value={formInputs[arg.label] || ''}
              onChange={handleInputChange}
              placeholder={arg.type?.toLowerCase() === 'address' ? 'address (or ENS)' : arg.type}
              className="input input-bordered w-full"
            />
            {arg.placeholder && arg.placeholder !== '0x' && (
              <label className="label">
                <span className="label-text-alt text-xs text-gray-400">
                  Default: {(() => {
                    const decimals = parsedData?.decimals?.[index];
                    const unit = argUnits[index] || 'scaled';
                    if (decimals !== null && decimals !== undefined && unit === 'scaled') {
                      try {
                        return formatScaledValue(BigInt(arg.placeholder), decimals);
                      } catch (_error) {
                        return arg.placeholder;
                      }
                    }
                    return arg.placeholder;
                  })()}
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
              <UnitToggle
                leftLabel="ETH"
                rightLabel="WEI"
                value={valueUnit}
                inputValue={formInputs.value || ''}
                onValueChange={(nextValue) => setFormInputs((prev) => ({
                  ...prev,
                  value: nextValue
                }))}
                decimals={18}
                onChange={handleValueUnitChange}
                leftValue="ETH"
                rightValue="WEI"
              />
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
              Default: {parsedData.value !== null && parsedData.value !== undefined
                ? (valueUnit === 'ETH'
                  ? `${formatScaledValue(BigInt(parsedData.value), 18)} ETH`
                  : `${parsedData.value} WEI`)
                : ''}
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

  if (parseError) {
    return (
      <div ref={containerRef} className={cardClassName}>
        <div className="alert alert-error mb-4">
          <Icon name="error" size={8} className="shrink-0" />
          <div>
            <h3 className="font-bold">Unable to Load Form</h3>
            {Array.isArray(parseError) ? (
              <ul className="text-sm list-disc list-inside">
                {parseError.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm">{parseError}</div>
            )}
            <div className="mt-2 text-xs font-mono">
              <p><strong>URI:</strong> {getHashParams().get('w3uri')}</p>
              <p><strong>Text:</strong> {getHashParams().get('text')}</p>
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
            <div className="flex items-center gap-1">
              <a
                href={getBlockExplorerAddressUrl(parsedData.chainId || 1, parsedData.contract)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm p-1 tooltip tooltip-bottom"
                data-tip="View Contract"
              >
                <Icon name="external-link" size={4} />
              </a>
              <div
                className="tooltip tooltip-bottom"
                data-tip="Provided on an 'as is' basis. No warranties are provided, and SimplePage.eth is not liable for any loss, direct or indirect, arising from use of this feature."
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm p-1"
                  aria-label="Web3 forms notice"
                >
                  <Icon name="info" size={4} />
                </button>
              </div>
            </div>
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

      {formError && (
        <Notice
          type="error"
          onClose={() => setFormError(null)}
          className="mt-4"
        >
          <div>
            <strong>Fix the highlighted fields</strong>
            {Array.isArray(formError) ? (
              <ul className="text-sm list-disc list-inside">
                {formError.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">{formError}</p>
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <strong className="whitespace-nowrap">Result:</strong>
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <div className="flex items-start gap-2 min-w-0 flex-wrap">
                <code className="bg-base-300 px-2 py-1 rounded text-xs break-all max-w-full inline-block flex-1">
                  {returnValue}
                </code>
              </div>
              {parsedData?.returnDecimals !== null && parsedData?.returnDecimals !== undefined ? (
                <div className="flex">
                  <UnitToggle
                    leftLabel={`Scaled (1e${parsedData.returnDecimals})`}
                    rightLabel="Raw"
                    value={returnUnit}
                    inputValue={returnValue}
                    onValueChange={setReturnValue}
                    decimals={parsedData.returnDecimals}
                    onChange={setReturnUnit}
                  />
                </div>
              ) : null}
            </div>
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
