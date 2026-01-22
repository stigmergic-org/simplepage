/**
 * Minimal Web3 Form iframe Application
 * Just displays the URI for testing
 */

console.log('🔥 Minimal Web3Form iframe JavaScript loaded!');

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
console.log('✅ React imported successfully');

// Minimal Web3FormApp component
const Web3FormApp = () => {
  const [uri, setUri] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('🚀 Minimal Web3FormApp mounted!');

    // Parse URI from URL parameters or window global
    try {
      // First try URL parameters (for traditional iframe loading)
      const urlParams = new URLSearchParams(window.location.search);
      let uriParam = urlParams.get('uri');

      // Fallback to window global (for srcdoc embedded iframes)
      if (!uriParam && window.WEB3FORM_URI) {
        uriParam = window.WEB3FORM_URI;
      }

      console.log('🔗 Parsed URI:', {
        fromURL: !!urlParams.get('uri'),
        fromWindow: !!window.WEB3FORM_URI,
        uriParam: uriParam,
        fullURL: window.location.href
      });

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

  if (error) {
    return (
      <div style={{ padding: '20px', fontFamily: 'monospace', background: '#fee', border: '1px solid #fcc' }}>
        <h3>Error:</h3>
        <p>{error}</p>
        <p><strong>URL:</strong> {window.location.href}</p>
        <p><strong>Search:</strong> {window.location.search}</p>
      </div>
    );
  }

  if (!uri) {
    return (
      <div style={{ padding: '20px', fontFamily: 'monospace', background: '#efe', border: '1px solid #cfc' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', background: '#eef', border: '1px solid #ccf' }}>
      <h3>Web3 URI Loaded:</h3>
      <p><strong>URI:</strong> {uri}</p>
      <p><strong>URL:</strong> {window.location.href}</p>
      <p><strong>Search:</strong> {window.location.search}</p>
    </div>
  );
};

// Mount the app (works in iframe or direct load)
console.log('🎯 Mounting minimal Web3FormApp...');
const rootElement = document.getElementById('root');
if (rootElement) {
  console.log('✅ Found root element, creating React root...');
  const root = createRoot(rootElement);
  root.render(<Web3FormApp />);
  console.log('🎉 Minimal Web3FormApp mounted successfully!');
} else {
  console.error('❌ Could not find root element!');
}

export default Web3FormApp;