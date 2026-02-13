import React, { useState } from 'react';
import Icon from './Icon';
import { useChainId } from '../hooks/useChainId';
import { useBlockTimestamp } from '../hooks/useBlockTimestamp';

const getEtherscanUrl = (txHash, chainId) => {
  if (!txHash) return '#';
  switch (chainId) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 1337:
      return '#';
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
};

const getIpfsUrl = (cid) => {
  if (!cid) return '#';
  return `https://explore.ipld.io/#/explore/${cid}`;
};

const EntryContent = ({ entry, chainId, variant = 'full', onDetails, showTitle = true }) => {
  const { timestamp, loading, error } = useBlockTimestamp(entry.blockNumber);
  const versionLabel = entry.version ? `v${entry.version}` : 'unknown';
  const domainLabel = entry.domain || 'unknown';
  const txHash = entry.tx || '';
  const hasTx = Boolean(txHash);
  const hasCid = Boolean(entry.cid);
  const isCompact = variant === 'compact';
  const titleLabel = entry.title || domainLabel || 'Untitled';

  const formatDateBadge = (value) => {
    if (!value) return 'Date ???';
    return new Date(value).toISOString().replace('T', ' ').split('.')[0];
  };

  const dateBadge = loading
    ? 'Date ???'
    : error
      ? 'Date error'
      : formatDateBadge(timestamp);

  if (isCompact) {
    return (
      <div className="space-y-3">
        <div className="text-base font-semibold">
          {titleLabel}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="badge badge-soft badge-secondary badge-sm">{dateBadge}</span>
          <span className="badge badge-soft badge-accent badge-sm">{domainLabel}</span>
          <span className="badge badge-soft badge-info badge-sm">{versionLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          {onDetails && (
            <button
              onClick={onDetails}
              className="btn btn-outline btn-primary btn-xs"
            >
              More info
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
        <div className="flex items-center justify-between">
          {showTitle && (
            <div className="text-lg font-semibold">
              {titleLabel}
            </div>
          )}
          <span className="text-sm text-base-content/60">
            Notarized in block #{entry.blockNumber || '???'}
          </span>
        </div>

      <div className="flex flex-row flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-base-content/70">Date:</span>
          <span className="badge badge-soft badge-secondary badge-sm">{dateBadge}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-base-content/70">Domain:</span>
          <span className="badge badge-soft badge-accent badge-sm">{domainLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-base-content/70">Simple Page:</span>
          <span className="badge badge-soft badge-info badge-sm">{versionLabel}</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {hasTx ? (
            <a
              href={getEtherscanUrl(txHash, chainId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-base-content/70 hover:text-base-content transition-colors"
              title="View on Etherscan"
            >
              <span>Transaction</span>
              <Icon name="external-link" size={4} />
            </a>
          ) : (
            <span className="text-sm text-base-content/70">Transaction unavailable</span>
          )}
        </div>
        <div className="font-mono text-xs bg-base-200 px-2 py-1 rounded break-all">
          {txHash || '—'}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {hasCid ? (
            <a
              href={getIpfsUrl(entry.cid)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-base-content/70 hover:text-base-content transition-colors"
              title="Inspect IPFS data"
            >
              <span>Content Hash</span>
              <Icon name="external-link" size={4} />
            </a>
          ) : (
            <span className="text-sm text-base-content/70">Content hash unavailable</span>
          )}
        </div>
        <div className="font-mono text-xs bg-base-200 px-2 py-1 rounded break-all">
          {entry.cid || '—'}
        </div>
      </div>

      <div className="flex mt-4">
        {hasCid ? (
          <a
            href={`https://${entry.cid}.ipfs.inbrowser.link`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-outline btn-sm"
          >
            Visit Snapshot
          </a>
        ) : (
          <button className="btn btn-primary btn-outline btn-sm" disabled>
            Visit Snapshot
          </button>
        )}
      </div>
    </div>
  );
};

const EntryModal = ({ isOpen, onClose, entry, chainId }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={handleBackdropClick}
    >
      <div className="bg-base-100 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{entry.title || entry.domain || 'Untitled'}</h3>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle"
            >
              <Icon name="close" size={4} />
            </button>
          </div>
          <EntryContent entry={entry} chainId={chainId} showTitle={false} />
        </div>
      </div>
    </div>
  );
};

const TimelineEntry = ({ entry, columnsByKey, maxColumn }) => {
  const column = columnsByKey[entry.entryKey] || 0;
  const chainId = useChainId();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div key={entry.entryKey} className="relative flex items-center">
      <div className="flex items-center relative">
        {Array.from({ length: maxColumn + 1 }, (_value, colIndex) => (
          <div
            key={colIndex}
            className="flex items-center justify-center w-8 md:w-12"
          >
            {column === colIndex && (
              <div
                id={`icon-${entry.entryKey}`}
                data-column={column}
                className="relative flex items-center"
              >
                <Icon name="check" size={6} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="md:hidden flex-1 rounded-lg ml-3 p-4 border border-base-300 bg-base-100 shadow-sm">
        <EntryContent
          entry={entry}
          chainId={chainId}
          variant="compact"
          onDetails={() => setIsModalOpen(true)}
        />
      </div>

      <div className="hidden md:block flex-1 rounded-lg ml-4 p-6 border border-base-300 shadow-sm">
        <EntryContent entry={entry} chainId={chainId} />
      </div>

      <EntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entry={entry}
        chainId={chainId}
      />
    </div>
  );
};

export default TimelineEntry;
