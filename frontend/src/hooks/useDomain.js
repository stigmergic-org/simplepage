import { useMemo } from 'react';

export const useDomain = () => {
  const domain = useMemo(() => {

    const domain = document.querySelector('meta[name="ens-domain"]').getAttribute('content');
    console.log('useDomain:', domain);

    return domain;
  }, []);

  return domain;
}; 