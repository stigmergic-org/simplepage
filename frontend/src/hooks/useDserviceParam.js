import { useMemo } from 'react';

/**
 * useDserviceParam - React hook to get custom dservice URL for a given ENS name from query params
 * @param {string} name - ENS name (e.g. 'new.simplepage.eth')
 * @returns {string|null} - The decoded custom dservice URL, or null if not present
 */
export function useDserviceParam(name) {
  const paramKey = `ds-${name}`;
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(paramKey);
    if (value) {
      try {
        const decoded = decodeURIComponent(value);
        return decoded.startsWith('http') ? decoded : `https://${decoded}`;
      } catch (_e) {
        return value;
      }
    }
    return null;
  }, [paramKey, window.location.search]);
} 