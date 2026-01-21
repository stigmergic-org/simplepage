/**
 * Web3 Form iframe Application
 * Standalone iframe app that renders web3 forms with auto-resize
 */

import React, { useState, useEffect, useRef } from 'react';
import { parseWeb3Uri, validateWeb3Uri } from './utils/web3UriParser';
import { getNetworkName } from './utils/networks';
import {
  useIframeMessageHandler,
  useAutoResize,
  sendTxRequest,
  sendIframeReady
} from './utils/web3FormProtocol';

// FormField component - reusable
const FormField = ({ arg, value, onChange }) => {
  const inputId = `web3-arg-${arg.label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="form-control w-full">
      <label className="label" htmlFor={inputId}>
        <span className="label-text font-medium">
          {arg.label}
          {arg.required && <span className="text-error ml-1">*</span>}
        </span>
        <span className="badge badge-outline badge-sm">{arg.type}</span>
      </label>
      <input
        id={inputId}
        name={inputId}
        type="text"
        className="input input-bordered w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={arg.placeholder || `Enter ${arg.type}`}
      />
    </div>
  );
};

// TransactionStatus component - reusable
const TransactionStatus = ({ success, error, hash, isConfirmed, reset }) => {
  if (!success && !error) {
    return (
      <div className="alert alert-info">
        <div className="loading loading-spinner"></div>
        <span>Transaction in progress...</span>
      </div>
    );
  }

  if (success) {
    return (
      <>
        <div className="alert alert-success">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 1.01L7 10l6-3 1.44l-4.56-1.01l-2.22-16 1.44-5.59l-7.75 4.02z" />
            </svg>
            <span>Transaction submitted successfully!</span>
          </div>
          {hash && (
            <div className="text-sm text-gray-600 mt-2 font-mono">
              Hash: {hash.slice(0, 10)}...{hash.slice(-8)}
              {isConfirmed && <span className="text-green-500"> ✓ Confirmed</span>}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Check on explorer for confirmation status.
        </div>
        <button
          onClick={reset}
          className="btn btn-sm btn-outline mt-4"
        >
          Clear
        </button>
      </>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6-9.64A1.64 1.64-9.64 1.28L12 8 2 2-2.83 2.83-6.77L16 6 1.69 2.81 2.81-2.83l-2.17-4.82l-2.83 2.83L6 14 3 0-3-7 7 7 3 0-3.43-8 8.44-2.83l-2.83-8.45-2.83l-2.83-2.83-6.77z" />
          </svg>
          <span>Transaction failed</span>
        </div>
        <div className="text-sm text-gray-600 mt-2">
          {error}
        </div>
      </div>
    );
  }
};

// FormRenderer component - renders forms based on parsed URI
const FormRenderer = ({ uri, walletState, onSubmit, onReset, txResult }) => {
  const [formData, setFormData] = useState({});
  const parsed = parseWeb3Uri(uri);

  // Handle validation errors internally
  if (!parsed || parsed.error || !parsed.contract) {
    const message = parsed?.error || `Invalid web3 URI: ${uri || ''}`;
    return <div className="alert alert-error">
      <div>
        <strong>Invalid Web3 URI</strong>
        <p className="text-sm mt-1">{message}</p>
        <p className="text-xs mt-2 opacity-75">URI: {uri}</p>
      </div>
    </div>;
  }

  // Additional validation for malformed URIs
  if (!parsed.method) {
    return <div className="alert alert-error">
      <div>
        <strong>Invalid Web3 URI</strong>
        <p className="text-sm mt-1">Missing method in web3 URI</p>
        <p className="text-xs mt-2 opacity-75">URI: {uri}</p>
      </div>
    </div>;
  }

  // Check for invalid type specifications (like "type!" without value)
  const hasInvalidTypeSpec = parsed.args.some(arg => arg.required && arg.placeholder === '0x');
  if (hasInvalidTypeSpec) {
    const invalidArgs = parsed.args.filter(arg => arg.required && arg.placeholder === '0x');
    const invalidSpecs = invalidArgs.map(arg => `${arg.type}!`).join(', ');
    return <div className="alert alert-error">
      <div>
        <strong>Invalid Web3 URI</strong>
        <p className="text-sm mt-1">
          Invalid type specification: {invalidSpecs}. According to ERC-6860, use format "type!value" with a value, or "type!0x" for no default input.
        </p>
        <p className="text-xs mt-2 opacity-75">URI: {uri}</p>
      </div>
    </div>;
  }

  // Check if network is supported (import getNetworkName)
  if (!getNetworkName(parsed.chainId || 1)) {
    return <div className="alert alert-error">
      <div>
        <strong>Network Not Supported</strong>
        <p className="text-sm mt-1">Chain ID {parsed.chainId || 1} is not supported.</p>
        <p className="text-xs mt-2 opacity-75">URI: {uri}</p>
      </div>
    </div>;
  }

  // Get human-readable method name
  const humanizeMethodName = (method) => {
    return method
      .split(/([A-Z])/g)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Handle form input changes
  const handleInputChange = (argLabel, value) => {
    setFormData(prev => ({
      ...prev,
      [argLabel]: value
    }));
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate required fields
    const missingRequired = parsed.args.filter(arg => arg.required && !formData[arg.label]);
    if (missingRequired.length > 0) {
      console.error('Missing required fields:', missingRequired.map(arg => arg.label));
      return;
    }

    // Prepare transaction data
    const txData = {
      contract: parsed.contract,
      method: parsed.method,
      chainId: parsed.chainId,
      args: parsed.args.map(arg => formData[arg.label] || arg.placeholder || ''),
      value: parsed.value,
      payable: parsed.payable
    };

    onSubmit(txData);
  };

  // Check if form can be submitted
  const canSubmit = walletState.isConnected && !txResult?.loading;

  return (
    <div className="card bg-base-100 shadow-md border border-base-200">
      <div className="card-body space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-lg">{humanizeMethodName(parsed.method)}</h3>
          <div className="badge badge-outline">Web3 Form</div>
        </div>

        <div className="text-xs text-gray-500 mb-2 font-mono bg-gray-50 p-2 rounded">
          Contract: {parsed.contract} ({getNetworkName(parsed.chainId || 1)})
        </div>

        {/* Wallet Status */}
        <div className="alert alert-info">
          <div>
            <strong>Wallet Status:</strong>
            {walletState.isConnected ? (
              <div className="text-sm">
                Connected: {walletState.address?.slice(0, 6)}...{walletState.address?.slice(-4)}
                {walletState.chainId && ` (Chain: ${walletState.chainId})`}
              </div>
            ) : (
              <div className="text-sm">Please connect your wallet to continue</div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {parsed.args.length > 0 ? (
            <div className="space-y-4">
              {parsed.args.map((arg, index) => (
                <FormField
                  key={index}
                  arg={arg}
                  value={formData[arg.label] || (arg.placeholder !== '0x' ? arg.placeholder : '')}
                  onChange={(value) => handleInputChange(arg.label, value)}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              No arguments required for this function call.
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={!canSubmit}
          >
            {txResult?.loading ? 'Submitting...' :
             !walletState.isConnected ? 'Connect Wallet First' :
             `Execute ${humanizeMethodName(parsed.method)}`}
          </button>
        </form>

        {/* Transaction Status */}
        {txResult && (
          <TransactionStatus
            success={txResult.success}
            error={txResult.error}
            hash={txResult.hash}
            isConfirmed={txResult.confirmed}
            reset={onReset}
          />
        )}
      </div>
    </div>
  );
};

// Main Web3FormApp component
const Web3FormApp = () => {
  const [web3Uri, setWeb3Uri] = useState(null);
  const [walletState, setWalletState] = useState({
    address: null,
    chainId: null,
    isConnected: false
  });
  const [txResult, setTxResult] = useState(null);
  const containerRef = useRef(null);

  // Auto-resize using shared protocol
  useAutoResize(containerRef);

  // Parse web3 URI from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const uriParam = urlParams.get('uri');

    if (uriParam) {
      try {
        const decodedUri = decodeURIComponent(uriParam);
        setWeb3Uri(decodedUri);

        // Notify parent that iframe is ready
        sendIframeReady();
      } catch (error) {
        console.error('Failed to decode web3 URI:', error);
        setWeb3Uri(null);
      }
    } else {
      // No URI provided - show error
      setWeb3Uri('');
    }
  }, []);

  // Handle messages from parent using shared protocol
  useIframeMessageHandler({
    onWalletState: (data) => {
      setWalletState(data);
    },
    onTxResult: (data) => {
      setTxResult(data);
    }
  });

  // Handle form submission
  const handleSubmit = (formData) => {
    console.log('🚀 Submitting transaction:', formData);
    sendTxRequest(formData);
  };

  // Handle form reset
  const handleReset = () => {
    setTxResult(null);
  };

  // Handle no URI case
  if (web3Uri === '') {
    return (
      <div ref={containerRef} style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <div className="alert alert-error">
          <strong>No Web3 URI Provided</strong>
          <p className="text-sm mt-1">
            Please provide a web3:// URL parameter to display a Web3 form.
          </p>
        </div>
      </div>
    );
  }

  if (!web3Uri) {
    return (
      <div ref={containerRef} style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h2>Loading Web3 Form...</h2>
        <p>Please provide a web3:// URL parameter.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ minHeight: '200px', padding: '16px' }}>
      <FormRenderer
        uri={web3Uri}
        walletState={walletState}
        onSubmit={handleSubmit}
        onReset={handleReset}
        txResult={txResult}
      />
    </div>
  );
};

export default Web3FormApp;