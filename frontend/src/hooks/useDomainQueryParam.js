import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';

const getDomainParam = (location, includeHash) => {
  const searchParams = new URLSearchParams(location.search);
  const domain = searchParams.get('domain');
  if (searchParams.has('domain') || !includeHash) {
    return domain;
  }

  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  return hashParams.get('domain');
};

export const useDomainQueryParam = ({ includeHash = false } = {}) => {
  const location = useLocation();
  const [domain, setDomain] = useState(() => {
    return getDomainParam(location, includeHash);
  });

  useEffect(() => {
    setDomain(getDomainParam(location, includeHash));
  }, [location, includeHash]);

  return domain;
}; 
