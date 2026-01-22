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


const sendMessage = (target, { type, data }) => {
  if (!target || !target.postMessage) {
    console.error('Could not find postMessage target')
  }
  console.log('posting msg', type, data)
  target.postMessage({ type, data }, window.location.origin);
};


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
  const iframeSrc = iframeElement.src;

  const handleMessage = (event) => {
    console.log(event)
    console.log(iframeElement)
    // Verify origin
    if (event.origin !== window.location.origin) return;

    // For now, accept all messages and log them
    console.log('Message received:', event.data.type, 'from iframe src:', iframeSrc);

    const { type, data } = event.data;

    switch (type) {
      case WEB3_RESIZE:
        console.log('Processing RESIZE, height:', data.height);
        onResize?.(data.height);
        break;
      default:
        console.log('Unknown message type:', type);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
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

export const sendResize = (height) => {
  sendMessage(window.parent, {
    type: WEB3_RESIZE,
    data: { height: Math.ceil(height) }
  })
};

export const sendIframeReady = () => {
  sendMessage(window.parent, {
    type: IFRAME_READY
  })
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
 * Hook for iframe auto-resize
 * @param {React.RefObject} containerRef - Reference to container element
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 100)
 */


/**
 * Connect web3 form protocol to an iframe element
 * Handles all message passing, event listeners, and cleanup
 * @param {HTMLIFrameElement} iframeElement - The iframe element
 * @returns {Function} cleanup function
 */
export const connectWeb3FormProtocol = (iframeElement) => {
  if (iframeElement.classList.contains('web3-protocol-connected')) {
    return () => {};
  }

  console.log('calling setup')
  const cleanup = setupIframeListener(iframeElement, {
    onTxRequest: (data) => {
      setTimeout(() => {
        sendTxResult(iframeElement.contentWindow, {
          success: true,
          hash: '0x' + Math.random().toString(16).substr(2, 64),
          isConfirmed: false
        });
      }, 1000);
    },

    onIframeReady: () => {
      // sendWalletState(iframeElement.contentWindow, {
      //   address: null,
      //   chainId: 1,
      //   isConnected: false
      // });
    },

    onResize: (height) => {
      console.log('frame resize')
      iframeElement.style.height = `${height}px`;
      console.log(iframeElement.style.height)
    }
  });

  iframeElement.classList.add('web3-protocol-connected');
  return cleanup;
};
