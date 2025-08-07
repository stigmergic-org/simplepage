import { useMemo } from 'react';

export const useDomain = () => {
  const domain = useMemo(() => {
    return document.querySelector('meta[name="ens-domain"]').getAttribute('content');
  }, []);

  return domain;
}; 