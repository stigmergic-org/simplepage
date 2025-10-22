import { useMemo } from 'react';

// Supported chain IDs
const SUPPORTED_CHAIN_IDS = [1, 11155111, 1337];

/**
 * useRpcOverride - React hook to get custom RPC URLs for supported chain IDs from query params
 * @returns {Object} - { [chainId: number]: string } mapping of chainId to custom RPC URL
 */
export function useRpcOverride() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const overrides = {};
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      const paramKey = `ds-rpc-${chainId}`;
      const value = params.get(paramKey);
      if (value) {
        try {
          const decoded = decodeURIComponent(value);
          overrides[chainId] = decoded.startsWith('http') ? decoded : `https://${decoded}`;
        } catch (_e) {
          overrides[chainId] = value;
        }
      }
    }
    return overrides;
  }, [window.location.search]);
} 