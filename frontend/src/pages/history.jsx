import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cidToENSContentHash } from '@simplepg/common';
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { namehash } from 'viem/ens';
import LoadingSpinner from '../components/LoadingSpinner';
import Notice from '../components/Notice';
import Navbar from '../components/navbar';
import TimelineConnections from '../components/TimelineConnections';
import TimelineEntry from '../components/TimelineEntry';
import TransactionStatus from '../components/TransactionStatus';
import { useChainId } from '../hooks/useChainId';
import { useDomain } from '../hooks/useDomain';
import { useGetSubscription } from '../hooks/useGetSubscription';
import { useIsEnsOwner } from '../hooks/useIsEnsOwner';
import { useNavigation } from '../hooks/useNavigation';
import { useRepo } from '../hooks/useRepo';

const SET_CONTENTHASH_ABI = [
  {
    name: 'setContenthash',
    type: 'function',
    inputs: [{ name: 'node', type: 'bytes32' }, { name: 'hash', type: 'bytes' }],
    outputs: [],
  },
];

const normalizeEntry = (entry) => {
  const cid = entry.cid?.toString?.() || '';
  const parents = Array.isArray(entry.parents)
    ? entry.parents.map(parent => parent?.toString?.()).filter(Boolean)
    : [];

  return {
    ...entry,
    cid,
    parents,
  };
};

const getEntryKey = (entry, index) => {
  if (entry.tx) return `${entry.cid}-${entry.tx}`;
  if (entry.blockNumber) return `${entry.cid}-${entry.blockNumber}-${index}`;
  return `${entry.cid || 'unknown'}-${index}`;
};

const calculateColumnLayout = (historyData) => {
  const columnsByKey = {};
  const columnsByCid = new Map();
  const lanes = [];

  const reserveLane = (cid, preferredIndex = null) => {
    if (!cid) return null;
    const assignedIndex = columnsByCid.get(cid);
    if (assignedIndex !== undefined && lanes[assignedIndex] == null) {
      lanes[assignedIndex] = cid;
      return assignedIndex;
    }
    const existingIndex = lanes.findIndex(laneCid => laneCid === cid);
    if (existingIndex !== -1) return existingIndex;

    if (preferredIndex !== null && lanes[preferredIndex] == null) {
      lanes[preferredIndex] = cid;
      return preferredIndex;
    }

    const freeIndex = lanes.findIndex(laneCid => laneCid == null);
    if (freeIndex !== -1) {
      lanes[freeIndex] = cid;
      return freeIndex;
    }

    lanes.push(cid);
    return lanes.length - 1;
  };

  historyData.forEach((entry) => {
    const laneIndex = reserveLane(entry.cid);
    if (laneIndex === null) return;

    columnsByKey[entry.entryKey] = laneIndex;
    if (!columnsByCid.has(entry.cid)) {
      columnsByCid.set(entry.cid, laneIndex);
    }
    lanes[laneIndex] = null;

    const parents = entry.parents || [];
    if (parents.length > 0) {
      const primaryParent = parents[0];
      const primaryIndex = reserveLane(primaryParent, laneIndex);
      if (primaryIndex !== null && !columnsByCid.has(primaryParent)) {
        columnsByCid.set(primaryParent, primaryIndex);
      }

      for (const parentCid of parents.slice(1)) {
        const parentIndex = reserveLane(parentCid);
        if (parentIndex !== null && !columnsByCid.has(parentCid)) {
          columnsByCid.set(parentCid, parentIndex);
        }
      }
    }
  });

  const columnValues = Object.values(columnsByKey);
  const maxColumn = columnValues.length ? Math.max(...columnValues) : 0;
  return { columnsByKey, maxColumn };
};

const HistoryPage = () => {
  const { repo } = useRepo();
  const domain = useDomain();
  const chainId = useChainId();
  const viemClient = usePublicClient();
  const { goToSubscription } = useNavigation();
  const { address, chainId: accountChainId } = useAccount();
  const { subscriptionValid } = useGetSubscription(domain);
  const { isOwner } = useIsEnsOwner(domain);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restoreEntry, setRestoreEntry] = useState(null);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState(null);
  const entriesRef = useRef(null);
  const { data: hash, status, error: transactionError, reset, writeContract } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!repo) return;
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await repo.history.get();
        if (!isMounted) return;
        const withKeys = data.map((entry, index) => {
          const normalized = normalizeEntry(entry);
          return {
            ...normalized,
            entryKey: getEntryKey(normalized, index),
          };
        });
        setHistoryData(withKeys);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load history');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [repo]);

  const parentKeysByEntry = useMemo(() => {
    const map = new Map();
    const lastSeenByCid = new Map();

    for (let i = historyData.length - 1; i >= 0; i -= 1) {
      const entry = historyData[i];
      const parentKeys = (entry.parents || [])
        .map(parentCid => lastSeenByCid.get(parentCid))
        .filter(Boolean);
      map.set(entry.entryKey, parentKeys);
      lastSeenByCid.set(entry.cid, entry.entryKey);
    }

    return map;
  }, [historyData]);

  const { columnsByKey, maxColumn } = useMemo(() => {
    return calculateColumnLayout(historyData);
  }, [historyData]);

  const handleRestoreClick = (entry) => {
    setRestoreEntry(entry);
    setRestoreErrorMessage(null);
    reset();
  };

  const handleRestoreCancel = () => {
    setRestoreEntry(null);
    setRestoreErrorMessage(null);
    reset();
  };

  const handleRestorePublish = async () => {
    if (!restoreEntry?.cid) {
      return;
    }

    if (!subscriptionValid) {
      goToSubscription(domain, 'publish');
      return;
    }

    setRestoreErrorMessage(null);

    try {
      if (!viemClient) {
        throw new Error('Wallet client not ready yet. Please try again.');
      }

      const resolver = await viemClient.getEnsResolver({ name: domain });
      if (!resolver) {
        throw new Error(`No resolver found for ${domain}.`);
      }

      writeContract({
        address: resolver,
        abi: SET_CONTENTHASH_ABI,
        functionName: 'setContenthash',
        args: [namehash(domain), cidToENSContentHash(restoreEntry.cid)],
      });
    } catch (err) {
      console.error('Error restoring version:', err);
      setRestoreErrorMessage(err.message || 'Failed to prepare restore transaction.');
    }
  };

  if (loading) {
    return (
      <>
        <Navbar activePage="History" />
        <LoadingSpinner />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar activePage="History" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="alert alert-error max-w-md">
            <span>Error loading history: {error}</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar activePage="History" />
      <div className="container mx-auto max-w-5xl px-4 py-6">
        {restoreErrorMessage && <Notice type="error" message={restoreErrorMessage} />}

        <TransactionStatus
          status={status}
          hash={hash}
          error={transactionError}
          isConfirmed={isConfirmed}
          reset={reset}
          onSuccess={() => {
            setRestoreEntry(null);
            setRestoreErrorMessage(null);
          }}
        >
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Website History</h1>
              <p className="text-base-content/70">
                Timeline showing the evolution of this website
              </p>
            </div>

            <div className="bg-base-100 rounded-lg p-6 md:p-8">
              {historyData.length > 0 ? (
                <div className="relative">
                  <TimelineConnections historyData={historyData} parentKeysByEntry={parentKeysByEntry} entriesRef={entriesRef} />
                  <div ref={entriesRef} className="timeline-entries space-y-6">
                    {historyData.map((entry) => (
                      <TimelineEntry
                        key={entry.entryKey}
                        entry={entry}
                        columnsByKey={columnsByKey}
                        maxColumn={maxColumn}
                        restoreState={{
                          isOpen: restoreEntry?.entryKey === entry.entryKey,
                          targetDomain: domain,
                          address,
                          accountChainId,
                          expectedChainId: chainId,
                          isOwner,
                          subscriptionValid,
                          isPublishing: status === 'pending' || status === 'success',
                          onStart: () => handleRestoreClick(entry),
                          onPublish: handleRestorePublish,
                          onCancel: handleRestoreCancel,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-base-content/50 text-lg">No history available</div>
                </div>
              )}
            </div>
          </div>
        </TransactionStatus>
      </div>
    </>
  );
};

export default HistoryPage;
