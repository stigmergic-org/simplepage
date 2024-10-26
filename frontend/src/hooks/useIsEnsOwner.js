import { useEffect, useState } from 'react';
import { useAccount, useEnsAddress } from 'wagmi';

export const useIsEnsOwner = (domain) => {
  const [isOwner, setIsOwner] = useState(false);
  const { address } = useAccount();
  const result  = useEnsAddress({
    name: domain,
  });

  useEffect(() => {
    setIsOwner(address === result.data);
  }, [result, address]);

  return { isOwner, owner: result.data };
}; 