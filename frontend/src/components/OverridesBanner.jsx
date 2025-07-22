import React, { useState } from 'react';

export default function OverridesBanner({ dserviceUrl, rpcOverrides }) {
  const [visible, setVisible] = useState(true);
  if (!visible || (!dserviceUrl && (!rpcOverrides || Object.keys(rpcOverrides).length === 0))) return null;

  return (
    <div className="alert alert-warning alert-outline z-50 flex items-center">
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>
          {dserviceUrl && (
            <>
              <strong>Custom DService URL in use:</strong> This page is using a custom DService endpoint for <code>new.simplepage.eth</code>: <code>{dserviceUrl}</code>
              <br />
            </>
          )}
          {rpcOverrides && Object.keys(rpcOverrides).length > 0 && (
            <>
              <strong>Custom RPC endpoint override{Object.keys(rpcOverrides).length > 1 ? 's' : ''}:</strong>
              <ul className="mt-1 ml-2 list-disc list-inside">
                {Object.entries(rpcOverrides).map(([chainId, url]) => (
                  <li key={chainId}>
                    <span className="font-mono">chainId {chainId}:</span> <code>{url}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </span>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="btn btn-xm btn-error btn-ghost text-xl ml-auto"
        aria-label="Dismiss custom dservice banner"
      >
        ×
      </button>
    </div>
  );
} 