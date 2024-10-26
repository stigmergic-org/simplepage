import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '../config/routes';
import { useChainId } from 'wagmi';

function getExplorerUrl(hash, chainId) {
  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${hash}`;
  }
  return `https://etherscan.io/tx/${hash}`;
}

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
      return `https://${publishedDomain}.link`;
    }
    return redirectPath || ROUTES.VIEW;
  };

  return (
    <div>
      {showModal && (status === 'pending' || status === 'success') && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex flex-col items-center justify-center z-10">
          {status === 'pending' ? (
            <>
              <span className="loading loading-infinity loading-lg"></span>
              <p className="mt-4 text-lg font-semibold">Confirm in wallet</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold mb-4">Transaction {isConfirmed ? 'confirmed' : 'pending'}</p>
              <progress className="progress progress-info w-56" value={progress} max="100"></progress>
              <a 
                href={getExplorerUrl(hash, chainId)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-4 text-blue-600 hover:text-blue-800"
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
          <div role="alert" className="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{(error?.message || 'An error occurred during the transaction.').split('.')[0]}</span>
            <button
              className="btn btn-sm"
              onClick={() => reset?.()}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className={showModal && (status === 'pending' || status === 'success') ? 'blur-sm' : ''}>
        {children}
      </div>
    </div>
  );
};

export default TransactionStatus; 