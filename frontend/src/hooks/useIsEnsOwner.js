import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useChainId } from 'wagmi';
import { resolveEnsOwner } from '@simplepg/common';

export const useIsEnsOwner = (domain) => {
  const [isOwner, setIsOwner] = useState(false);
  const [owner, setOwner] = useState(null);
  const { address } = useAccount();
  const viemClient = usePublicClient();
  const chainId = useChainId();

  useEffect(() => {
    let cancelled = false;
    async function checkOwner() {
      if (!domain || !viemClient || !chainId) {
        setIsOwner(false);
        setOwner(null);
        return;
      }
      try {
        const resolvedOwner = await resolveEnsOwner(viemClient, domain, chainId);
        if (!cancelled) {
          setOwner(resolvedOwner);
          setIsOwner(address && resolvedOwner && address.toLowerCase() === resolvedOwner.toLowerCase());
        }
      } catch {
        if (!cancelled) {
          setOwner(null);
          setIsOwner(false);
        }
      }
    }
    checkOwner();
    return () => { cancelled = true; };
  }, [domain, address, viemClient, chainId]);

  return { isOwner, owner };
}; 