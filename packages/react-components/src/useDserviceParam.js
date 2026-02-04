import { useMemo } from 'react';

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
