import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '../config/routes';
import { useChainId } from '../hooks/useChainId';
import { DOMAIN_SUFFIX } from '../config/domain';
import { getBlockExplorerTxUrl } from '../utils/networks';
import { Notice } from '@simplepg/react-components';

const TransactionStatus = ({ 
  status, 
  hash, 
  error,
  isConfirmed,
  reset,
  children,
  onSuccess,
  redirectPath = '/',
  publishedDomain
}) => {
  const chainId = useChainId();
  const [progress, setProgress] = useState(0);
  const [showModal, setShowModal] = useState(true);
  const navigate = useNavigate();

  if (error) {
    console.error(error);
  }

  useEffect(() => {
    let timer;
    if (status === 'success' && hash) {
      if (isConfirmed) {
        setProgress(100);
      } else {
        timer = setInterval(() => {
          setProgress((oldProgress) => {
            if (oldProgress === 100) {
              clearInterval(timer);
              return 100;
            }
            return Math.min(oldProgress + 100 / 120, 100);
          });
        }, 100);
      }
    }
    return () => clearInterval(timer);
  }, [status, hash, isConfirmed]);

  const getRedirectUrl = () => {
    if (publishedDomain) {
      return `https://${publishedDomain}${DOMAIN_SUFFIX}`;
    }
    return redirectPath || ROUTES.VIEW;
  };

  return (
    <div>
      {showModal && (status === 'pending' || status === 'success') && (
        <div className="absolute inset-0 bg-base-200 bg-opacity-75 dark:bg-base-300 dark:bg-opacity-75 flex flex-col items-center justify-center z-10">
          {status === 'pending' ? (
            <>
              <span className="loading loading-infinity loading-lg"></span>
              <p className="mt-4 text-lg font-semibold text-base-content">Confirm in wallet</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold mb-4 text-base-content">Transaction {isConfirmed ? 'confirmed' : 'pending'}</p>
              <progress className="progress progress-info w-56" value={progress} max="100"></progress>
              <a 
                href={getBlockExplorerTxUrl(chainId, hash)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-4 text-primary hover:text-primary-focus"
              >
                Track transaction
              </a>
              <button
                onClick={() => {
                  if (onSuccess) onSuccess();
                  const redirectUrl = getRedirectUrl();
                  if (redirectUrl.startsWith('http')) {
                    window.location.href = redirectUrl;
                  } else {
                    navigate(redirectUrl);
                  }
                  setShowModal(false);
                }}
                disabled={!isConfirmed}
                className="mt-4 btn btn-primary disabled:opacity-50"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}
      {status === 'error' && (
        <div className="mb-4">
          <Notice
            type="error"
            message={(error?.message || 'An error occurred during the transaction.').split('.')[0]}
            onClose={() => reset?.()}
          />
        </div>
      )}
      <div className={showModal && (status === 'pending' || status === 'success') ? 'blur-sm' : ''}>
        {children}
      </div>
    </div>
  );
};

export default TransactionStatus; 
