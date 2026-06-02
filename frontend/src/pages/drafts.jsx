import React, { useEffect, useMemo, useState } from 'react';
import { cidToENSContentHash } from '@simplepg/common';
import { namehash } from 'viem/ens';
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/navbar';
import Notice from '../components/Notice';
import TransactionStatus from '../components/TransactionStatus';
import WalletInfo from '../components/WalletInfo';
import { useChainId } from '../hooks/useChainId';
import { useDomain } from '../hooks/useDomain';
import { useDomainQueryParam } from '../hooks/useDomainQueryParam';
import { useGetSubscription } from '../hooks/useGetSubscription';
import { useIsEnsOwner } from '../hooks/useIsEnsOwner';
import { useNavigation } from '../hooks/useNavigation';
import { useRepo } from '../hooks/useRepo';
import { SET_CONTENTHASH_ABI } from '../utils/contenthash';

const getIpfsGatewayUrl = (cid) => `https://${cid}.ipfs.inbrowser.link`;

const formatTimestamp = (revision) => {
  const timestamp = revision.issuedAt || (Number.isFinite(Number(revision.sequence)) ? Number(revision.sequence) : null);
  if (!timestamp) {
    return 'Unknown';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString();
};

const Drafts = () => {
  const domain = useDomain();
  const queryDomain = useDomainQueryParam();
  const targetDomain = queryDomain || domain;
  const chainId = useChainId();
  const viemClient = usePublicClient();
  const { goToSubscription } = useNavigation();
  const { chainId: accountChainId } = useAccount();
  const { repo } = useRepo();
  const { subscriptionValid } = useGetSubscription(targetDomain);
  const { isOwner } = useIsEnsOwner(targetDomain);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [publishDraft, setPublishDraft] = useState(null);
  const [publishErrorMessage, setPublishErrorMessage] = useState(null);
  const { data: hash, status, error: transactionError, reset, writeContract } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0));
  }, [drafts]);

  useEffect(() => {
    document.title = targetDomain ? `Drafts - ${targetDomain}` : 'Drafts';
  }, [targetDomain]);

  useEffect(() => {
    let cancelled = false;

    const loadDrafts = async () => {
      if (!targetDomain) {
        setDrafts([]);
        setLoading(false);
        return;
      }
      if (!repo?.refs) {
        setDrafts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const nextDrafts = await repo.refs.list(targetDomain);
        if (!cancelled) {
          setDrafts(nextDrafts);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load drafts');
          setDrafts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDrafts();
    return () => {
      cancelled = true;
    };
  }, [targetDomain, repo]);

  const handlePublish = async (draft) => {
    if (!draft?.contentCid) {
      return;
    }

    if (!subscriptionValid) {
      goToSubscription(targetDomain, 'publish');
      return;
    }

    setPublishDraft(draft);
    setPublishErrorMessage(null);
    reset();

    try {
      if (!viemClient) {
        throw new Error('Wallet client not ready yet. Please try again.');
      }
      if (!isOwner) {
        throw new Error('Connected wallet is not the ENS owner for this name.');
      }
      if (accountChainId !== chainId) {
        throw new Error('Connected wallet is on the wrong network.');
      }

      const resolver = await viemClient.getEnsResolver({ name: targetDomain });
      if (!resolver) {
        throw new Error(`No resolver found for ${targetDomain}.`);
      }

      writeContract({
        address: resolver,
        abi: SET_CONTENTHASH_ABI,
        functionName: 'setContenthash',
        args: [namehash(targetDomain), cidToENSContentHash(draft.contentCid)],
      });
    } catch (err) {
      setPublishErrorMessage(err.message || 'Failed to prepare publish transaction.');
    }
  };

  if (loading) {
    return (
      <>
        <Navbar activePage="Drafts" />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <Navbar activePage="Drafts" />
      <div className="container mx-auto max-w-5xl px-4 py-6">
        {error ? <Notice type="error" message={error} /> : null}
        {publishErrorMessage ? <Notice type="error" message={publishErrorMessage} /> : null}

        <TransactionStatus
          status={status}
          hash={hash}
          error={transactionError}
          isConfirmed={isConfirmed}
          reset={reset}
          onSuccess={() => {
            setPublishDraft(null);
            setPublishErrorMessage(null);
          }}
        >
          <div className="mx-auto max-w-4xl px-4 py-6">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Drafts {targetDomain ? ' - ' + targetDomain : ''}</h1>
              <p className="text-base-content/70">
                Review agent-created drafts, preview their IPFS content, and publish one to {targetDomain}.
              </p>
            </div>

            <div className="mb-6">
              <WalletInfo expectedChainId={chainId} noBottomMargin />
            </div>

            {sortedDrafts.length === 0 ? (
              <div className="rounded-lg bg-base-100 p-10 text-center">
                <div className="text-base-content/50 text-lg">No drafts available</div>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedDrafts.map((revision) => {
                  const isPublishingThisRevision = publishDraft?.contentCid === revision.contentCid && (status === 'pending' || status === 'success');
                  return (
                    <article key={`${revision.refId}-${revision.sequence}-${revision.contentCid}`} className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold">{revision.refId}</h2>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-base-content/75 sm:grid-cols-2">
                            <div><strong>Agent:</strong> {revision.agentName || 'Unknown'}</div>
                            <div><strong>Timestamp:</strong> {formatTimestamp(revision)}</div>
                            <div><strong>Version:</strong> {revision.sequence}</div>
                            <div className="break-all"><strong>CID:</strong> {revision.contentCid}</div>
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-2 md:flex-col">
                          <a
                            className="btn btn-outline btn-sm"
                            href={getIpfsGatewayUrl(revision.contentCid)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview
                          </a>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={isPublishingThisRevision}
                            onClick={() => handlePublish(revision)}
                          >
                            {isPublishingThisRevision ? 'Publishing...' : 'Publish'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </TransactionStatus>
      </div>
    </>
  );
};

export default Drafts;
