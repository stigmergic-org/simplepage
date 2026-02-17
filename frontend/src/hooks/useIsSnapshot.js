import { useMemo } from 'react';

/**
 * Hook that detects if the current environment is an IPFS or IPNS gateway.
 * 
 * @returns {boolean} True if running on an IPFS/IPNS gateway.
 */
export const useIsSnapshot = () => {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    
    const { hostname, pathname } = window.location;
    // Hostname check (e.g. dweb.link, ipfs.io, or subdomains like bafy...ipfs.localhost)
    if (hostname.includes('.ipfs.') || hostname.includes('.ipns.')) return true;
    // Path check (e.g. gateway.ipfs.io/ipfs/...)
    if (pathname.startsWith('/ipfs/') || pathname.startsWith('/ipns/')) return true;
    return false;
  }, []);
};
