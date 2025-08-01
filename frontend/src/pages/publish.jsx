import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAccount, useEnsName, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import TransactionStatus from '../components/TransactionStatus';
import { useGetSubscription } from '../hooks/useGetSubscription';
import { resolveEnsDomain, contracts, resolveEnsOwner } from '@simplepg/common';
import { useNavigation } from '../hooks/useNavigation';
import { useRepo } from '../hooks/useRepo';
import { useDomain } from '../hooks/useDomain';
import { useDomainQueryParam } from '../hooks/useDomainQueryParam';
import Navbar from '../components/navbar';
import WalletInfo from '../components/WalletInfo';
import { useIsEnsOwner } from '../hooks/useIsEnsOwner';
import { useChainId } from '../hooks/useChainId';

const Publish = () => {
  const viemClient = usePublicClient();
  const chainId = useChainId();
  const domain = useDomain();
  const queryDomain = useDomainQueryParam();
  const { repo } = useRepo();
  const [unstagedEdits, setUnstagedEdits] = useState([]);
  const [updateTemplate, setUpdateTemplate] = useState(true);
  const [ownedDomains, setOwnedDomains] = useState(() => {
    const domains = [domain];
    if (queryDomain && queryDomain !== domain) {
      domains.push(queryDomain);
    }
    return domains;
  });
  const [selectedDomain, setSelectedDomain] = useState(queryDomain || domain);
  const [newDomain, setNewDomain] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isValidDomain, setIsValidDomain] = useState(false);
  const { goToSubscription } = useNavigation();
  const { address, chainId: accountChainId } = useAccount();
  const [errorMessage, setErrorMessage] = useState(null);
  const [versionInfo, setVersionInfo] = useState({});
  const [stagedRoot, setStagedRoot] = useState(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [hasExistingContent, setHasExistingContent] = useState(false);

  const { data: hash, status, error, reset, writeContract } = useWriteContract()

  const { isLoading: isWaiting, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })
  const [progress, setProgress] = useState(0);

  const { subscriptionValid } = useGetSubscription(selectedDomain);
  const { isOwner } = useIsEnsOwner(selectedDomain);

  useEffect(() => {
    if (isConfirmed && stagedRoot) {
      console.log('finalized commit:', stagedRoot.toString());
      repo.finalizeCommit(stagedRoot).catch(console.error);
    }
  }, [isConfirmed, stagedRoot]);

  useEffect(() => {
    let timer;
    if (status === 'success' && hash) {
      timer = setInterval(() => {
        setProgress((oldProgress) => {
          if (oldProgress === 100) {
            clearInterval(timer);
            return 100;
          }
          return Math.min(oldProgress + 100 / 120, 100); // 100% in 12 seconds
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [status, hash]);

  const { data: userEnsName } = useEnsName({ address });

  useEffect(() => {
    if (userEnsName && !ownedDomains.includes(userEnsName)) {
      setOwnedDomains(prevDomains => [...prevDomains, userEnsName]);
    }
  }, [userEnsName, ownedDomains]);

  useEffect(() => {
    if (queryDomain && queryDomain !== domain && !ownedDomains.includes(queryDomain)) {
      setOwnedDomains(prevDomains => [...prevDomains, queryDomain]);
    }
  }, [queryDomain, domain, ownedDomains]);

  useEffect(() => {
    const getChanges = async () => {
      const changes = await repo.getChanges();
      setUnstagedEdits(changes);
    }
    getChanges();
  }, [repo]);


  const handlePublish = async () => {
    if (!subscriptionValid) {
      goToSubscription(selectedDomain, 'publish');
      return;
    }

    try {
      const { prepTx, cid } = await repo.stage(selectedDomain, updateTemplate);
      setStagedRoot(cid);
      writeContract(prepTx);
    } catch (error) {
      console.error('Error publishing content:', error);
      setErrorMessage(error.message || 'An error occurred while publishing content.');
    }
  };

  const handleNewDomainChange = (e) => {
    const value = e.target.value;
    if (value.endsWith('.eth')) {
      setNewDomain(value);
      setIsValidDomain(true);
    } else {
      setIsValidDomain(false);
    }
  };

  const handleAddDomain = async () => { 
    const owner = await resolveEnsOwner(viemClient, newDomain, chainId);
    if (newDomain && isValidDomain && owner === address) {
      setOwnedDomains(prevDomains => [...prevDomains, newDomain]);
      setSelectedDomain(newDomain);
      setNewDomain('');
      setShowAddForm(false);
    } else {
      alert(`You are not the owner of ${newDomain} or the domain is invalid.`);
    }
  };

  const handleSelectChange = (e) => {
    const value = e.target.value;
    if (value === '+') {
      setShowAddForm(true);
    } else {
      setSelectedDomain(value);
      setShowAddForm(false);
    }
  };

  useEffect(() => {
    const fetchVersionInfo = async () => {
      try {
        const versionInfo = await repo.isNewVersionAvailable();
        setVersionInfo(versionInfo);
      } catch (error) {
        console.error('Error fetching blank version:', error);
        setErrorMessage('Failed to fetch blank version');
      }
    };

    fetchVersionInfo();
  }, [repo]);

  useEffect(() => {
    
    // Use query parameter domain if available, otherwise use hash-based domain
    if (queryDomain && queryDomain !== domain) {
      setSelectedDomain(queryDomain);
    }
  }, [queryDomain, domain]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const queryString = hash.split('?')[1];
      const params = new URLSearchParams(queryString);
      const urlDomain = params.get('domain');
      
      // Use query parameter domain if available, otherwise use hash-based domain
      if (queryDomain && queryDomain !== domain) {
        setSelectedDomain(queryDomain);
      } else if (urlDomain) {
        setSelectedDomain(urlDomain);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [queryDomain, domain]);

  useEffect(() => {
    const checkExistingContent = async () => {
      if (selectedDomain && selectedDomain !== domain) {
        try {
          const { cid } = await resolveEnsDomain(viemClient, selectedDomain, contracts.universalResolver[chainId]);
          setHasExistingContent(Boolean(cid));
        } catch (error) {
          setHasExistingContent(false);
        }
      } else {
        setHasExistingContent(false);
      }
    };

    checkExistingContent();
  }, [selectedDomain, domain]);

  const publishOrFork = selectedDomain === domain ? 'Publish' : 'Fork';

  document.title = `${publishOrFork} - ${selectedDomain}`;

  return (
    <>
      <Navbar 
        activeTab="Publish"
      />
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <WalletInfo />
        <TransactionStatus 
          status={status}
          hash={hash}
          error={error}
          isConfirmed={isConfirmed}
          reset={reset}
          publishedDomain={selectedDomain !== domain ? selectedDomain : null}
        >
          <h1 className="text-3xl font-bold mb-6">{publishOrFork} {unstagedEdits.length} {unstagedEdits.length === 1 ? 'change' : 'changes'}</h1>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select ENS name to publish at</label>
            <div className="flex items-center">
              <select
                value={showAddForm ? '+' : selectedDomain}
                onChange={handleSelectChange}
                className="flex-grow select select-bordered"
              >
                {ownedDomains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
                <option value="+" className="text-center font-bold">+</option>
              </select>
            </div>
            {showAddForm && (
              <div className="mt-2 flex items-left">
                <div className="form-control">
                  <label className="input validator">
                    <input
                      type="text"
                      required
                      pattern="^[a-z0-9\-\.]+\.eth$"
                      title="Must be a valid .eth domain"
                      onChange={handleNewDomainChange}
                      placeholder="Enter new domain"
                    />
                  </label>
                  <p className="validator-hint">
                    Must be a valid .eth domain.
                  </p>
                </div>
                <button
                  onClick={handleAddDomain}
                  disabled={!isValidDomain}
                  className="btn btn-primary ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            )}
          </div>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Pages being {publishOrFork.toLowerCase()}ed:</h2>
            <ul className="list-inside">
              {unstagedEdits.map((change, index) => (
                <li key={index}>
                  {selectedDomain + change.path} 
                  <span className="ml-2 text-sm text-gray-500">({change.type})</span>
                </li>
              ))}
            </ul>
          </div>
          
          {versionInfo.canUpdate && (
            <div className="mb-6 border border-base-300 rounded-md p-2 bg-base-200">
              <label className="inline-flex items-center justify-between w-full">
                <span className="text-base-content/70">Update SimplePage (v{versionInfo.currentVersion} -&gt; v{versionInfo.templateVersion})</span>
                <input
                  type="checkbox"
                  checked={updateTemplate}
                  onChange={(e) => setUpdateTemplate(e.target.checked)}
                  className="toggle toggle-success"
                />
              </label>
            </div>
          )}

          {hasExistingContent && selectedDomain !== domain && (
            <div className="mb-6 border border-gray-300 rounded-md p-2 bg-gray-50">
              <label className="inline-flex items-center justify-between w-full">
                <span className="text-gray-500">Something else is already published at {selectedDomain}. Are you sure you want to overwrite the existing content?</span>
                <input
                  type="checkbox"
                  checked={allowOverwrite}
                  onChange={(e) => setAllowOverwrite(e.target.checked)}
                  className="toggle toggle-warning"
                />
              </label>
            </div>
          )}

          <div className="flex justify-end space-x-4">
            <button
              onClick={handlePublish}
              disabled={
                !selectedDomain || showAddForm ||
                !address || !isOwner ||
                selectedDomain === 'new.simplepage.eth' ||
                accountChainId !== chainId ||
                (hasExistingContent && selectedDomain !== domain && !allowOverwrite) ||
                (unstagedEdits.length === 0 && !updateTemplate)
              }
              className="btn btn-primary"
            >
              {publishOrFork}
            </button>
          </div>
        </TransactionStatus>
      </div>
    </>
  );
};

export default Publish;
