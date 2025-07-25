import { useReadContract } from 'wagmi';
import { normalize } from 'viem/ens';
import { keccak256, encodePacked } from 'viem';
import { contracts } from '@simplepg/common';
import { useChainId } from './useChainId';


const tokenIdForDomain = (domain) => {
  return BigInt(keccak256(encodePacked(['string'], [domain])));
};

export function useGetSubscription(domain) {
  const chainId = useChainId();
  const tokenId = tokenIdForDomain(domain);
  
  const { 
    data: pageData, 
    isLoading,
  } = useReadContract({
    address: contracts.deployments[chainId]?.SimplePage,
    abi: contracts.abis.SimplePage,
    functionName: 'getPageData',
    args: [tokenId],
  });

  return {
    pageData: pageData || null,
    isLoading,
    subscriptionValid: pageData?.units[0] > Math.floor(Date.now() / 1000),
  };
} 