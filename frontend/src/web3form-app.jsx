/**
 * Minimal Web3 Form iframe Application
 * Just displays the URI for testing
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { sendIframeReady } from './utils/web3FormProtocol';

// Minimal Web3FormApp component
const Web3FormApp = () => {
  const [uri, setUri] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    // Notify parent that iframe is ready
    sendIframeReady();

    // Parse URI from URL parameters or window global
    try {
      // First try URL parameters (for traditional iframe loading)
      const urlParams = new URLSearchParams(window.location.search);
      let uriParam = urlParams.get('uri');

      if (uriParam) {
        setUri(uriParam);
      } else {
        setError('No Web3 URI provided');
      }
    } catch (err) {
      console.error('Error parsing URI:', err);
      setError('Error parsing Web3 URI');
    }
  }, []);

  // Set iframe height based on content
  const setIframeHeight = () => {
    try {
      const iframes = window.parent.document.querySelectorAll('iframe');

      // Find the iframe that contains our window
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

  // Set iframe height once on mount
  useEffect(() => {
    setIframeHeight();
  }, [uri]);

  if (error) {
    return (
      <div ref={containerRef} style={{ padding: '20px', fontFamily: 'monospace', background: '#fee', border: '1px solid #fcc' }}>
        <h3>Error:</h3>
        <p>{error}</p>
        <p><strong>URL:</strong> {window.location.href}</p>
        <p><strong>Search:</strong> {window.location.search}</p>
      </div>
    );
  }

  if (!uri) {
    return (
      <div ref={containerRef} style={{ padding: '20px', fontFamily: 'monospace', background: '#efe', border: '1px solid #cfc' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{
      padding: '20px',
      fontFamily: 'monospace',
      background: '#eef',
      border: '1px solid #ccf',
      minHeight: '100px'
    }}>
      <h3>Web3 URI Loaded:</h3>
      <p><strong>URI:</strong> {uri}</p>
      <p><strong>URL:</strong> {window.location.href}</p>
      <p><em>This content should trigger iframe resize</em></p>
    </div>
  );
};

// Mount the app (works in iframe or direct load)
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<Web3FormApp />);
