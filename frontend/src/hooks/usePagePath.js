import { useLocation } from 'react-router';
import { useBasename } from './useBasename';

export const usePagePath = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const basename = useBasename();
  
  // Get edit path from query param or construct from pathname
  let path = searchParams.get('path');
  const isVirtual = Boolean(path);
  if (!isVirtual) {
    path = basename;
  }
  if (!path.endsWith('/')) {
    path = `${path}/`;
  }
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  return {
    path,
    isVirtual,
  };
};
