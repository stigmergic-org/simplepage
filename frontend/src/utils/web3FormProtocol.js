/**
 * Web3 Form PostMessage Protocol
 * Shared protocol for parent ↔ iframe communication
 * Handles both sides of the communication consistently
 */

import React from 'react';

// Message types
export const WEB3_TX_REQUEST = 'WEB3_TX_REQUEST';
export const WEB3_TX_RESULT = 'WEB3_TX_RESULT';
export const WEB3_RESIZE = 'WEB3_RESIZE';
export const WALLET_STATE = 'WALLET_STATE';
export const IFRAME_READY = 'IFRAME_READY';

/**
 * PARENT WINDOW FUNCTIONS
 * Used by view.jsx to handle messages from iframes
 */

/**
 * Handle messages from iframes (parent side)
 * @param {MessageEvent} event - PostMessage event
 * @param {Object} handlers - Handler functions
 * @param {Function} handlers.onTxRequest - (data, source, origin) => Promise
 * @param {Function} handlers.onIframeReady - (source, origin, iframeId) => void
 * @param {Function} handlers.onResize - (height, iframeId) => void
 */
export const handleParentMessage = (event, { onTxRequest, onIframeReady, onResize }) => {
  // Only accept messages from same origin iframes
  if (event.origin !== window.location.origin) return;

  const { type, data } = event.data;

  switch (type) {
    case WEB3_TX_REQUEST:
      console.log('📨 Parent: Received tx request from iframe:', data);
      if (onTxRequest) {
        onTxRequest(data, event.source, event.origin);
      }
      break;

    case IFRAME_READY:
      console.log('📨 Parent: Iframe ready');
      if (onIframeReady) {
        onIframeReady(event.source, event.origin, data?.iframeId);
      }
      break;

    case WEB3_RESIZE:
      console.log('📨 Parent: Resize request:', data.height, 'for iframe:', data.iframeId);
      if (onResize) {
        onResize(data.height, data.iframeId);
      }
      break;

    default:
      console.log('📨 Parent: Unknown message type:', type);
  }
};

/**
 * Send wallet state to iframe (parent side)
 * @param {Window} iframeWindow - iframe.contentWindow
 * @param {Object} walletState - { address, chainId, isConnected }
 */
export const sendWalletState = (iframeWindow, walletState) => {
  if (iframeWindow && iframeWindow.postMessage) {
    iframeWindow.postMessage({
      type: WALLET_STATE,
      data: walletState
    }, window.location.origin);
  }
};

/**
 * Send transaction result to iframe (parent side)
 * @param {Window} iframeWindow - iframe.contentWindow
 * @param {Object} result - { success, hash, error, isConfirmed }
 */
export const sendTxResult = (iframeWindow, result) => {
  if (iframeWindow && iframeWindow.postMessage) {
    iframeWindow.postMessage({
      type: WEB3_TX_RESULT,
      data: result
    }, window.location.origin);
  }
};

/**
 * Set up message listener for a specific iframe element
 * @param {HTMLIFrameElement} iframeElement - The iframe element
 * @param {Object} handlers - Handler functions
 * @param {Function} handlers.onTxRequest - (data) => Promise
 * @param {Function} handlers.onIframeReady - () => void
 * @param {Function} handlers.onResize - (height) => void
 * @returns {Function} cleanup function
 */
export const setupIframeListener = (iframeElement, { onTxRequest, onIframeReady, onResize }) => {
  const handleMessage = (event) => {
    // Only process messages from this specific iframe
    if (event.source !== iframeElement.contentWindow) return;

    const { type, data } = event.data;

    switch (type) {
      case WEB3_TX_REQUEST:
        console.log('📨 Parent: Received tx request from iframe');
        if (onTxRequest) {
          onTxRequest(data);
        }
        break;

      case IFRAME_READY:
        console.log('📨 Parent: Iframe ready');
        if (onIframeReady) {
          onIframeReady();
        }
        break;

      case WEB3_RESIZE:
        console.log('📨 Parent: Resize request:', data.height);
        if (onResize) {
          onResize(data.height);
        }
        break;

      default:
        console.log('📨 Parent: Unknown message type:', type);
    }
  };

  window.addEventListener('message', handleMessage);

  return () => {
    window.removeEventListener('message', handleMessage);
  };
};

/**
 * Hook for parent window to handle iframe messages (legacy - kept for compatibility)
 * @param {Object} handlers - Handler functions
 * @returns {Function} cleanup function
 */
export const useParentMessageHandler = ({ onTxRequest, onIframeReady, onResize }) => {
  React.useEffect(() => {
    const handleMessage = (event) => {
      handleParentMessage(event, { onTxRequest, onIframeReady, onResize });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onTxRequest, onIframeReady, onResize]);
};

/**
 * IFRAME FUNCTIONS
 * Used by web3form-app.jsx to communicate with parent
 */

/**
 * Send transaction request to parent (iframe side)
 * @param {Object} txData - Transaction data
 */
export const sendTxRequest = (txData) => {
  if (window.parent && window.parent.postMessage) {
    window.parent.postMessage({
      type: WEB3_TX_REQUEST,
      data: txData
    }, window.location.origin);
  }
};

/**
 * Send resize notification to parent (iframe side)
 * @param {number} height - New height in pixels
 */
export const sendResize = (height) => {
  if (window.parent && window.parent.postMessage) {
    window.parent.postMessage({
      type: WEB3_RESIZE,
      data: { height: Math.ceil(height) }
    }, window.location.origin);
  }
};

/**
 * Send iframe ready notification to parent (iframe side)
 */
export const sendIframeReady = () => {
  if (window.parent && window.parent.postMessage) {
    window.parent.postMessage({
      type: IFRAME_READY
    }, window.location.origin);
  }
};

/**
 * Handle messages from parent (iframe side)
 * @param {MessageEvent} event - PostMessage event
 * @param {Object} handlers - Handler functions
 * @param {Function} handlers.onWalletState - (walletState) => void
 * @param {Function} handlers.onTxResult - (result) => void
 */
export const handleIframeMessage = (event, { onWalletState, onTxResult }) => {
  // Only accept messages from same origin parent
  if (event.origin !== window.location.origin) return;

  const { type, data } = event.data;

  switch (type) {
    case WALLET_STATE:
      console.log('📨 Iframe: Received wallet state:', data);
      if (onWalletState) {
        onWalletState(data);
      }
      break;

    case WEB3_TX_RESULT:
      console.log('📨 Iframe: Received tx result:', data);
      if (onTxResult) {
        onTxResult(data);
      }
      break;

    default:
      console.log('📨 Iframe: Unknown message type:', type);
  }
};

/**
 * Hook for iframe to handle parent messages
 * @param {Object} handlers - Handler functions
 * @returns {Function} cleanup function
 */
export const useIframeMessageHandler = ({ onWalletState, onTxResult }) => {
  React.useEffect(() => {
    const handleMessage = (event) => {
      handleIframeMessage(event, { onWalletState, onTxResult });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onWalletState, onTxResult]);
};

/**
 * Hook for iframe auto-resize
 * @param {React.RefObject} containerRef - Reference to container element
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 100)
 */
export const useAutoResize = (containerRef, debounceMs = 100) => {
  React.useEffect(() => {
    if (!containerRef.current) return;

    let timeoutId;
    const resizeObserver = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        for (let entry of entries) {
          const { height } = entry.contentRect;
          sendResize(height);
        }
      }, debounceMs);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, [containerRef, debounceMs]);
};