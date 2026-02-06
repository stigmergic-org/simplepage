import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Notice } from '@simplepg/react-components';
import { formatEther } from 'viem';
import Navbar from '../components/Navbar.jsx';
import { usePublicClient } from 'wagmi';

export default function Address() {
  const { address } = useParams();
  const publicClient = usePublicClient();
  const [balance, setBalance] = useState(null);
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchAccount = async () => {
      setLoading(true);
      setError(null);
      try {
        const [balanceResult, codeResult] = await Promise.all([
          publicClient.request({ method: 'eth_getBalance', params: [address, 'latest'] }),
          publicClient.request({ method: 'eth_getCode', params: [address, 'latest'] }),
        ]);
        if (!active) return;
        setBalance(balanceResult);
        setCode(codeResult);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAccount();
    return () => {
      active = false;
    };
  }, [address, publicClient]);

  const isContract = code && code !== '0x';

  return (
    <div className="space-y-6">
      <Navbar />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-base-content/60">Account</p>
          <h1 className="text-3xl font-semibold">eth_getBalance & eth_getCode</h1>
        </div>
        <Link className="btn btn-ghost" to="/">Back to blocks</Link>
      </div>

      {loading && <Notice type="info" message="Loading account data…" />}
      {error && <Notice type="error" message={error} />}

      {!loading && !balance && <Notice type="warning" message="Account not found." />}

      {balance && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-base-content/60">Address</div>
              <div className="font-mono break-all">{address}</div>
            </div>
            <div className="stats shadow bg-base-200">
              <div className="stat">
                <div className="stat-title">Balance</div>
                <div className="stat-value text-primary">{formatEther(BigInt(balance))} ETH</div>
                <div className="stat-desc">{balance}</div>
              </div>
              <div className="stat">
                <div className="stat-title">Type</div>
                <div className="stat-value text-secondary">{isContract ? 'Contract' : 'EOA'}</div>
                <div className="stat-desc">{isContract ? 'Bytecode detected' : 'No bytecode'}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-base-content/60">Code</div>
              <pre className="bg-base-200 p-4 rounded-box text-xs overflow-x-auto">
                {code}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
