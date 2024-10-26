import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';

export const useDomainQueryParam = () => {
  const location = useLocation();
  const [domain, setDomain] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('domain');
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setDomain(params.get('domain'));
  }, [location.search]);

  return domain;
}; 