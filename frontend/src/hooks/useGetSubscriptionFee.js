import { useReadContract, useChainId, useEstimateGas } from 'wagmi';
import { contracts } from '@simplepg/common';

const SECONDS_PER_YEAR = 31536000; // 365 days * 24 hours * 60 minutes * 60 seconds
const MARGIN_MONTHS = 1; // Additional month for price fluctuations
const SECONDS_PER_MONTH = SECONDS_PER_YEAR / 12;

export function useGetSubscriptionFee(years = 1, domain) {
  const chainId = useChainId();
  
  // Calculate duration with margin
  const durationWithMargin = years * SECONDS_PER_YEAR + SECONDS_PER_MONTH;
  
  const { 
    data: fee,
    isLoading: isFeeLoading,
  } = useReadContract({
    address: contracts.deployments[chainId]?.SimplePageManager,
    abi: contracts.abis.SimplePageManager,
    functionName: 'fee',
    args: [years * SECONDS_PER_YEAR],
  });

  const {
    data: feeWithMargin,
    isLoading: isFeeWithMarginLoading,
  } = useReadContract({
    address: contracts.deployments[chainId]?.SimplePageManager,
    abi: contracts.abis.SimplePageManager,
    functionName: 'fee',
    args: [durationWithMargin],
  });

  const { 
    data: gasEstimate,
    isLoading: isGasLoading,
  } = useEstimateGas({
    address: contracts.deployments[chainId]?.SimplePageManager,
    abi: contracts.abis.SimplePageManager,
    functionName: 'subscribe',
    args: [domain, years * SECONDS_PER_YEAR],
    value: feeWithMargin || 0,
    query: {
      enabled: !!feeWithMargin && !!domain,
      structuralSharing: false
    }
  });

  return {
    fee: fee || null,
    feeWithMargin: feeWithMargin || null,
    gasEstimate: gasEstimate || null,
    isFeeLoading: isFeeLoading || isFeeWithMarginLoading,
    isGasLoading,
  };
} 