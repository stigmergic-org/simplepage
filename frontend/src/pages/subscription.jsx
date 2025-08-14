import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useLocation } from 'react-router';
import { useGetSubscription } from '../hooks/useGetSubscription';
import { useGetSubscriptionFee } from '../hooks/useGetSubscriptionFee';
import { formatEther } from 'viem';
import { normalize } from 'viem/ens';
import TransactionStatus from '../components/TransactionStatus';
import { contracts } from '@simplepg/common';
import { useDomainQueryParam } from '../hooks/useDomainQueryParam';
import { useDomain } from '../hooks/useDomain';
import Navbar from '../components/navbar';
import WalletInfo from '../components/WalletInfo';
import { useChainId } from '../hooks/useChainId';

const Subscribe = () => {
  const [duration, setDuration] = useState(1);
  const [progress, setProgress] = useState(0);
  const chainId = useChainId();
  const { chainId: accountChainId } = useAccount();
  const { data: hash, status, error, reset, writeContract } = useWriteContract();
  const { isLoading: isWaiting, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ 
    hash,
    query: {
      structuralSharing: false
    }
  });
  
  const location = useLocation();
  const queryDomain = useDomainQueryParam();
  const propDomain = useDomain();
  const domain = queryDomain || propDomain;

  document.title = `Subscribe - ${domain}`;

  const [redirectFrom, setRedirectFrom] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('from');
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setRedirectFrom(params.get('from'));
  }, [location.search]);

  const { pageData, isLoading: isLoadingPageData } = useGetSubscription(domain);
  const { 
    fee, 
    feeWithMargin, 
    gasEstimate, 
    isFeeLoading, 
    isGasLoading,
  } = useGetSubscriptionFee(duration, domain);


  const formatETH = (value) => {
    if (!value) return '0.0000';
    return Number(formatEther(value)).toFixed(4);
  };

  useEffect(() => {
    let timer;
    if (status === 'success' && hash) {
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
    return () => clearInterval(timer);
  }, [status, hash]);

  const handleDurationChange = (years) => {
    setDuration(years);
  };

  const handleSubscribe = async () => {
    try {
      const durationInSeconds = duration * 365 * 24 * 60 * 60;

      const subscribeCall = {
        address: contracts.deployments[chainId]?.SimplePageManager,
        abi: contracts.abis.SimplePageManager,
        functionName: 'subscribe',
        args: [normalize(domain), durationInSeconds],
        value: feeWithMargin,
        chainId
      };

      console.log('Full contract call:', subscribeCall);
      
      writeContract(subscribeCall);
    } catch (error) {
      console.error('Error during subscription:', error);
    }
  };

  const feeIneth = formatETH(fee);
  const networkFee = formatETH(gasEstimate);
  const totalCost = formatETH(fee && gasEstimate ? fee + gasEstimate : BigInt(0));

  return (
    <>
      <Navbar 
        activePage="Subscription"
      />
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <WalletInfo />
        <TransactionStatus
          status={status}
          hash={hash}
          error={error}
          isConfirmed={isConfirmed}
          reset={reset}
          redirectPath={redirectFrom === 'publish' ? `/spg-publish?domain=${domain}` : null}
        >
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6 text-center">Subscription for {domain}</h1>
            {pageData && (
              <p className="text-center text-gray-600 mb-16 italic">
                Currently valid until {new Date(Number(pageData.units[0]) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}

            <div className="flex justify-center">
              <div className="card bg-base-100 w-96 shadow-xl">
                <div className="card-body items-center">
                  <h2 className="card-title">$1 monthly</h2>
                  <p className="text-sm text-center">SimplePage is an open source and decentralized protocol, powered by a small fee. <br />You will always be in control.</p>
                  <ul className="list-disc list-inside text-gray-600">
                    <li>Accessible via <a href={`https://${domain}.link`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">{domain}.link</a></li>
                    <li>Unlimited edits</li>
                    <li>Edit history</li>
                    <li>Early adopter status</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Duration Selection */}
            <div className="mt-16 mb-16">
              <div className="flex justify-between items-center w-full mb-6">
                <button 
                  onClick={() => handleDurationChange(Math.max(1, duration - 1))}
                  className="btn btn-circle btn-lg"
                  disabled={duration <= 1}
                >
                  -
                </button>
                <span className="text-4xl font-medium">{duration} year{duration > 1 ? 's' : ''}</span>
                <button 
                  onClick={() => handleDurationChange(duration + 1)}
                  className="btn btn-circle btn-lg"
                >
                  +
                </button>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-base-200 rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span>{duration} year subscription</span>
                  <span>{feeIneth} ETH</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Est. network fee</span>
                  <span>{networkFee} ETH</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Estimated total</span>
                  <span>{totalCost} ETH</span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleSubscribe}
              className="btn btn-primary w-full"
              disabled={status === 'pending' || 
                       accountChainId !== chainId ||
                       isWaiting || 
                       isFeeLoading}
            >
              {status === 'pending' ? 'Confirming...' : (pageData?.until > 0 ? 'Extend' : 'Subscribe')}
            </button>
          </div>
        </TransactionStatus>
      </div>
    </>
  );
};

export default Subscribe;