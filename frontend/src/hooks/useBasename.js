import { useMemo } from 'react';

export const useBasename = () => {
  return useMemo(() => {
    return window.location.pathname.replace(/spg-.*$/, '');
  }, []);
}; 