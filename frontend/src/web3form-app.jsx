/**
 * Web3 Form iframe Application
 * Generates interactive forms from web3:// URIs with custom parameter names
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { sendIframeReady } from './utils/web3FormProtocol';
import { parseWeb3Uri, parseWeb3Metadata, validateMetadataMatch } from './utils/web3UriParser';
import { getBlockExplorerAddressUrl } from './utils/networks';
import Icon from './components/Icon';
import './app.css';

// Web3FormApp component
const Web3FormApp = () => {
  // Normalize method names from camelCase/snake_case to Title Case
  const normalizeMethodName = (method) => {
    if (!method) return '';

    // Handle camelCase: insert space before capital letters
    const withSpaces = method.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Handle snake_case: replace underscores with spaces
    const normalized = withSpaces.replace(/_/g, ' ');

    // Capitalize first letter of each word
    return normalized.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };
  const [parsedUri, setParsedUri] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    // Notify parent that iframe is ready
    sendIframeReady();

    // Parse URI and metadata from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const uriParam = urlParams.get('uri');
    const metaParam = urlParams.get('meta');

    if (!uriParam) {
      setError('No web3 link found. Please check the markdown syntax.');
      setIsLoading(false);
      return;
    }

    try {
      // Parse the web3 URI
      const parsed = parseWeb3Uri(decodeURIComponent(uriParam));
      if (!parsed || parsed.error) {
        const errorMsg = parsed?.error || 'Unable to understand the web3 link format. Please check the URL.';
        setError(errorMsg);
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
      console.error('Error parsing web3 URI or metadata:', err);
      setError('Something went wrong while processing the web3 link. Please check the format.');
    }

    setIsLoading(false);
  }, []);

  // Set iframe height based on content
  const setIframeHeight = () => {
    try {
      const iframes = window.parent.document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        if (iframe.contentWindow === window) {
          const contentHeight = containerRef.current.scrollHeight;
          iframe.style.height = (contentHeight + 20) + 'px';
          break;
        }
      }
    } catch (e) {
      // Silently fail if parent access is blocked
    }
  };

  // Update iframe height when content changes
  useEffect(() => {
    if (!isLoading) {
      // Small delay to ensure DOM is updated
      setTimeout(setIframeHeight, 100);
    }
  }, [parsedUri, metadata, error, isLoading]);

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

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={true} // Disabled until transaction logic is implemented
            >
              {parsedUri ? normalizeMethodName(parsedUri.method) : 'Loading...'}
              <span className="text-xs opacity-75 ml-2"></span>
            </button>
          </form>
        </>
      )}
    </div>
  );
};

// Mount the app (works in iframe or direct load)
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<Web3FormApp />);
