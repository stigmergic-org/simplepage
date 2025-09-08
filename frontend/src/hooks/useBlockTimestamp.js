import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';

export const useBlockTimestamp = (blockNumber) => {
  const [timestamp, setTimestamp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const viemClient = usePublicClient();

  useEffect(() => {
    if (!blockNumber || !viemClient) {
      setTimestamp(null);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchBlockTimestamp = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const block = await viemClient.getBlock({
          blockNumber: BigInt(blockNumber)
        });
        
        // Convert timestamp to milliseconds for Date constructor
        setTimestamp(Number(block.timestamp) * 1000);
      } catch (err) {
        console.error('Error fetching block timestamp:', err);
        setError(err.message || 'Failed to fetch block timestamp');
        setTimestamp(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBlockTimestamp();
  }, [blockNumber, viemClient]);

  return { timestamp, loading, error };
};
