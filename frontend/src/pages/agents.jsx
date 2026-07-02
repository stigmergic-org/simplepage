import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useAccount, usePublicClient, useSignMessage } from 'wagmi';

import {
  buildCapabilitySiweMessage,
  resolveEnsOwner,
} from '@simplepg/common';

import Navbar from '../components/navbar';
import Notice from '../components/Notice';
import WalletInfo from '../components/WalletInfo';
import { useChainId } from '../hooks/useChainId';
import { useDomain } from '../hooks/useDomain';
import { useRepo } from '../hooks/useRepo';

const DEFAULT_CAPABILITY_TTL_SECONDS = 7 * 24 * 60 * 60;
const CAPABILITY_EXPIRY_OPTIONS = [
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '1 week', seconds: 7 * 24 * 60 * 60 },
  { label: '30 days', seconds: 30 * 24 * 60 * 60 },
];

const isDidKey = (value) => typeof value === 'string' && value.startsWith('did:key:');

const trimString = (value, fallback = '') => {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim();
};

const parseAgentsQuery = ({ locationSearch, locationHash, currentDomain, currentChainId }) => {
  const searchParams = new URLSearchParams(locationSearch);
  const hashParams = new URLSearchParams(locationHash.replace(/^#/, ''));
  const getParam = (key) => searchParams.get(key) ?? hashParams.get(key);

  const query = {
    domain: trimString(getParam('domain'), currentDomain || ''),
    didKey: trimString(getParam('key')),
    agentName: trimString(getParam('agent')),
    chainId: Number(currentChainId ?? 1),
  };

  if (!Number.isFinite(query.chainId) || query.chainId <= 0) {
    query.chainId = currentChainId || 1;
  }

  return query;
};

const getCurrentServiceDomain = () => window.location.host;

const CapabilityRow = ({ capability }) => (
  <div className="rounded-md border border-base-300 bg-base-100/80 p-4">
    <div className="grid gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] opacity-60">Authorized Agent</div>
        <div className="mt-2 text-sm font-medium">{capability.agentName || 'Unnamed'}</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.2em] opacity-60">Public Key</div>
        <code className="mt-2 block break-all text-xs leading-5">{capability.didKey}</code>
      </div>
    </div>
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      <div><strong>Issued:</strong> {capability.issuedAt}</div>
      <div><strong>Expires:</strong> {capability.expiresAt}</div>
    </div>
  </div>
);

const Agents = () => {
  const location = useLocation();
  const currentDomain = useDomain();
  const currentChainId = useChainId();
  const publicClient = usePublicClient();
  const { repo } = useRepo();
  const query = useMemo(() => parseAgentsQuery({
    locationSearch: location.search,
    locationHash: location.hash,
    currentDomain,
    currentChainId,
  }), [location.search, location.hash, currentDomain, currentChainId]);
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  const [capabilities, setCapabilities] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capabilityTtlSeconds, setCapabilityTtlSeconds] = useState(DEFAULT_CAPABILITY_TTL_SECONDS);

  const invalidDidKey = Boolean(query.didKey) && !isDidKey(query.didKey);
  const hasAuthorizationTarget = Boolean(query.domain) && Boolean(query.didKey) && !invalidDidKey;

  useEffect(() => {
    document.title = query.domain ? `Agents - ${query.domain}` : 'Agents';
  }, [query.domain]);

  useEffect(() => {
    let cancelled = false;

    const loadOwner = async () => {
      if (!query.domain) {
        setOwnerAddress(null);
        return;
      }

      try {
        if (!publicClient) {
          return;
        }

        const owner = await resolveEnsOwner(publicClient, query.domain, query.chainId);
        if (!cancelled) {
          setOwnerAddress(owner || null);
        }
      } catch (error) {
        if (!cancelled) {
          setOwnerAddress(null);
          setStatus({ kind: 'error', message: error.message });
        }
      }
    };

    loadOwner();
    return () => {
      cancelled = true;
    };
  }, [query.domain, query.chainId, publicClient]);

  useEffect(() => {
    let cancelled = false;

    const loadCapabilities = async () => {
      if (!query.domain) {
        setCapabilities([]);
        return;
      }
      if (!repo?.refs) {
        setCapabilities([]);
        return;
      }

      try {
        const nextCapabilities = await repo.refs.listCapabilities(query.domain);
        if (!cancelled) {
          setCapabilities(nextCapabilities);
        }
      } catch (_error) {
        if (!cancelled) {
          setCapabilities([]);
        }
      }
    };

    loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [query.domain, repo]);

  const wrongOwner = isConnected && ownerAddress && address && ownerAddress.toLowerCase() !== address.toLowerCase();
  const canAuthorize = hasAuthorizationTarget && isConnected && ownerAddress && !wrongOwner && !isSubmitting && !isSigning;

  const handleAuthorize = async () => {
    setStatus({ kind: 'idle', message: '' });
    setIsSubmitting(true);

    try {
      if (!publicClient) {
        throw new Error('Wallet client not ready yet. Please try again.');
      }
      if (!repo?.refs) {
        throw new Error('DService is not ready yet. Please try again.');
      }

      const owner = await resolveEnsOwner(publicClient, query.domain, query.chainId);
      if (!owner) {
        throw new Error(`Could not resolve the ENS owner for ${query.domain}.`);
      }
      if (!address || owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error('Connected wallet is not the ENS owner for this name.');
      }

      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + capabilityTtlSeconds * 1000).toISOString();
      const siweMessage = buildCapabilitySiweMessage({
        ownerAddress: address,
        didKey: query.didKey,
        domain: query.domain,
        agentName: query.agentName || undefined,
        chainId: query.chainId,
        serviceDomain: getCurrentServiceDomain(),
        nonce: `${Date.now()}`,
        issuedAt,
        expirationTime: expiresAt,
      });
      console.log('Agent capability SIWE message:', siweMessage);
      const siweSignature = await signMessageAsync({ message: siweMessage });

      const results = await repo.refs.storeCapability(query.domain, {
        key: query.didKey,
        didKey: query.didKey,
        agentName: query.agentName || undefined,
        siweMessage,
        siweSignature,
      });

      const successfulResults = results.filter((result) => result.response?.ok);
      if (successfulResults.length === 0) {
        throw new Error('No DService endpoint accepted the capability.');
      }

      const storedPayload = await successfulResults[0].response.json().catch(() => null);
      const nextCapability = storedPayload?.capability || {
        domain: query.domain,
        key: query.didKey,
        didKey: query.didKey,
        siweMessage,
        siweSignature,
        ownerAddress: address,
        issuedAt,
        expiresAt,
        agentName: query.agentName || null,
      };

      setCapabilities((previous) => {
        const filtered = previous.filter((entry) => !(entry.domain === nextCapability.domain && entry.didKey === nextCapability.didKey));
        return [nextCapability, ...filtered];
      });
      setStatus({
        kind: 'success',
        message: `Capability stored on ${successfulResults.length} DService endpoint${successfulResults.length === 1 ? '' : 's'}. You can return to the CLI.`,
      });
    } catch (error) {
      setStatus({ kind: 'error', message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Navbar activePage="Agents" />

      <div className="container mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">Agents - {query.domain ? `${query.domain}` : ''}</h1>
          <p className="mt-3 text-sm leading-6 opacity-80">
            Authorize generated signing keys for off-chain refs without exposing the ENS owner key to the CLI.
          </p>
        </div>

        {status.message ? (
          <Notice type={status.kind === 'success' ? 'success' : 'error'} message={status.message} />
        ) : null}

        {invalidDidKey ? (
          <Notice type="error" message="The provided did:key is invalid." />
        ) : null}

        <div className="mx-auto max-w-3xl space-y-4">
          {hasAuthorizationTarget ? (
            <>
              {wrongOwner ? (
                <Notice type="warning" message="The connected wallet does not own this ENS name. Switch accounts before authorizing." />
              ) : null}

              <div className="rounded-md border border-base-300 bg-base-100 p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Authorize Agent</h2>
                <p className="mt-3 text-sm leading-6 opacity-80">
                  Sign a SIWE message as the ENS owner. The signed capability is stored by the node and synced across peers until the SIWE expiry.
                </p>

                <div className="mt-5 space-y-3 rounded-md border border-base-300 bg-base-200/60 p-4 text-sm">
                  <div><strong>Target domain:</strong> {query.domain || 'Missing'}</div>
                  <div><strong>Name:</strong> {query.agentName || 'None'}</div>
                  <div><strong>Public key:</strong> <code className="break-all text-xs">{query.didKey || 'Missing'}</code></div>
                  <label className="block">
                    <strong>Expires in:</strong>
                    <select
                      className="select select-bordered select-sm mt-2 w-full"
                      value={capabilityTtlSeconds}
                      onChange={(event) => setCapabilityTtlSeconds(Number(event.target.value))}
                    >
                      {CAPABILITY_EXPIRY_OPTIONS.map((option) => (
                        <option key={option.seconds} value={option.seconds}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5">
                  <WalletInfo expectedChainId={query.chainId} noBottomMargin />
                </div>

                <button
                  type="button"
                  className="btn btn-primary mt-6 w-full"
                  onClick={handleAuthorize}
                  disabled={!canAuthorize}
                >
                  {isSubmitting || isSigning ? 'Signing...' : 'Authorize Agent'}
                </button>

                {!isConnected ? (
                  <p className="mt-3 text-xs opacity-70">Connect the wallet that owns the ENS name to continue.</p>
                ) : null}

                {!query.didKey && query.domain ? (
                  <p className="mt-3 text-xs opacity-70">A `did:key` query parameter is required to create a new capability.</p>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="rounded-md border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Active Agents{query.domain ? ` for ${query.domain}` : ''}
                </h2>
                <p className="mt-1 text-sm opacity-75">
                  These short-lived SIWE capabilities can be reused by nodes until they expire.
                </p>
              </div>
              <span className="badge badge-outline">{capabilities.length}</span>
            </div>

            {capabilities.length === 0 ? (
              <p className="mt-5 text-sm opacity-75">
                No active agents are currently stored{query.domain ? ` for ${query.domain}` : ' for this ENS name'}.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {capabilities.map((entry) => (
                  <CapabilityRow key={`${entry.domain}-${entry.didKey}`} capability={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Agents;
