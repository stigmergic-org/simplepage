import React from 'react';
import { Link } from 'react-router';
import { useEnsName } from 'wagmi';

export default function AddressBadge({ address, name }) {
  if (!address) return null;

  const { data: ensName } = useEnsName({ address, chainId: 1 });
  const primaryLabel = ensName || name;

  return (
    <Link className="link link-primary no-underline" to={`/address/${address}`}>
      <div className="flex flex-col rounded-box border border-base-200 bg-base-200/70 px-3 py-2 underline decoration-dotted underline-offset-4">
        {primaryLabel && <span className="font-semibold text-base-content">{primaryLabel}</span>}
        {ensName && name && ensName !== name && (
          <span className="text-xs text-base-content/60">{name}</span>
        )}
        <span className="font-mono break-all text-sm text-base-content/70">{address}</span>
      </div>
    </Link>
  );
}
