import React, { useState } from 'react';
import Notice from './Notice';

export default function OverridesBanner({ dserviceUrl, rpcOverrides }) {
  const [visible, setVisible] = useState(true);
  if (!visible || (!dserviceUrl && (!rpcOverrides || Object.keys(rpcOverrides).length === 0))) return null;

  return (
    <Notice
      type="warning"
      className="z-50"
      onClose={() => setVisible(false)}
    >
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
    </Notice>
  );
} 