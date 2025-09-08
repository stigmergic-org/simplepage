import React, { useState } from 'react';
import Icon from './Icon';
import { useChainId } from '../hooks/useChainId';
import { useBlockTimestamp } from '../hooks/useBlockTimestamp';

// Generate Etherscan URL based on chain ID
const getEtherscanUrl = (txHash, chainId) => {
  switch (chainId) {
    case 1: // Mainnet
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111: // Sepolia
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 1337: // Localhost
      return `#`; // No explorer for localhost
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
};

// Generate IPFS URL
const getIpfsUrl = (cid) => {
  return `https://explore.ipld.io/#/explore/${cid}`;
};

// Reusable content component to avoid duplication
const EntryContent = ({ entry, chainId }) => {
  const { timestamp, loading, error } = useBlockTimestamp(entry.blockNumber);
  
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Loading...';
    return new Date(timestamp).toISOString().replace('T', ' ').split('.')[0];
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">
            Notarized: {loading ? '???' : error ? 'Error loading timestamp' : formatTimestamp(timestamp)}
          </span>
        </div>
        <span className="text-sm text-base-content/60">
          Block #{entry.blockNumber || '???'}
        </span>
      </div>

    <div className="flex flex-row flex-wrap gap-4">
      {/* Domain */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-base-content/70">Domain:</span>
        <span className="badge badge-soft badge-accent badge-sm">{entry.domain}</span>
      </div>
      
      {/* Simple Page Version */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-base-content/70">Simple Page:</span>
        <span className="badge badge-soft badge-info badge-sm">v{entry.version}</span>
      </div>
    </div>
    
    {/* Transaction hash */}
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <a 
          href={getEtherscanUrl(entry.tx, chainId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-base-content/70 hover:text-base-content transition-colors"
          title="View on Etherscan"
        >
          <span>Transaction:</span>
          <Icon name="external-link" size={4} />
        </a>
      </div>
      <div className="font-mono text-xs bg-base-200 px-2 py-1 rounded break-all">
        {entry.tx}
      </div>
    </div>
    
    {/* CID */}
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <a 
          href={getIpfsUrl(entry.cid)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-base-content/70 hover:text-base-content transition-colors"
          title="Inspect IPFS data"
        >
          <span>Content Hash:</span>
          <Icon name="external-link" size={4} />
        </a>
      </div>
      <div className="font-mono text-xs bg-base-200 px-2 py-1 rounded break-all">
        {entry.cid}
      </div>
    </div>
    
    {/* Visit button */}
    <div className="flex mt-4">
       <a 
         href={`https://${entry.cid}.ipfs.inbrowser.link`}
         target="_blank"
         rel="noopener noreferrer"
         className="btn btn-primary btn-outline btn-sm"
       >
         Visit Snapshot
       </a>
    </div>
  </div>
  );
};

// Modal component defined outside of TimelineEntry
const EntryModal = ({ isOpen, onClose, entry, chainId }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop, not the modal content
    if (e.target === e.currentTarget) {
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
          {/* Modal header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Version Details</h3>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle"
            >
              <Icon name="close" size={4} />
            </button>
          </div>
          
          {/* Modal content using reusable component */}
          <EntryContent entry={entry} chainId={chainId} />
        </div>
      </div>
    </div>
  );
};

const TimelineEntry = ({ entry, index, columnsByCid, maxColumn }) => {
  const column = columnsByCid[entry.cid] || 0;
  const chainId = useChainId();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  return (
    <div key={entry.cid} className="relative flex items-center last:mb-0">
      {/* Timeline area with N columns */}
      <div className="flex items-center relative">
        {/* Create N columns and place check icon in correct column */}
        {Array.from({ length: maxColumn + 1 }, (_, colIndex) => (
          <div 
            key={colIndex}
            className="flex items-center justify-center w-12"
          >
            {column === colIndex && (
              <div 
                id={`icon-${entry.cid}`}
                data-column={column}
                data-index={index}
                className="relative flex items-center"
              >
                <Icon name="check" size={6} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile button - only visible on small screens */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="md:hidden mt-2 btn btn-primary btn-soft btn-sm"
        title="View details"
      >
        <Icon name="info" size={4} />
        <span className="ml-1">Details</span>
      </button>

      {/* Content card - hidden on mobile */}
      <div className="hidden md:block flex-1 rounded-lg ml-4 mb-8 p-6 border border-base-300">
        <EntryContent entry={entry} chainId={chainId} />
      </div>
      
      {/* Modal for mobile */}
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
