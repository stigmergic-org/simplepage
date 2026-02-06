import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Notice } from '@simplepg/react-components';
import { decodeEventLog, decodeFunctionData, formatEther } from 'viem';
import { formatTimestamp, hexToNumber } from '../lib/rpc.js';
import Navbar from '../components/Navbar.jsx';
import AddressBadge from '../components/AddressBadge.jsx';
import { usePublicClient } from 'wagmi';

export default function Tx() {
  const { txhash } = useParams();
  const publicClient = usePublicClient();
  const [tx, setTx] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [blockTimestamp, setBlockTimestamp] = useState(null);
  const [latestBlockNumber, setLatestBlockNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [abiByAddress, setAbiByAddress] = useState({});
  const [abiStatusByAddress, setAbiStatusByAddress] = useState({});
  const [contractNameByAddress, setContractNameByAddress] = useState({});
  const [traceResult, setTraceResult] = useState(null);
  const [traceError, setTraceError] = useState(null);

  const TRACE_RPCS = [
    'https://eth.drpc.org',
    'https://ethereum-rpc.publicnode.com',
  ];

  useEffect(() => {
    let active = true;
    const fetchTx = async () => {
      setLoading(true);
      setError(null);
      try {
        const [txResponse, receiptResponse] = await Promise.all([
          publicClient.request({
            method: 'eth_getTransactionByHash',
            params: [txhash],
          }),
          publicClient.request({
            method: 'eth_getTransactionReceipt',
            params: [txhash],
          }),
        ]);
        if (!active) return;
        setTx(txResponse);
        setReceipt(receiptResponse);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTx();
    return () => {
      active = false;
    };
  }, [publicClient, txhash]);

  useEffect(() => {
    const addresses = new Set();
    if (tx?.to) addresses.add(tx.to.toLowerCase());
    receipt?.logs?.forEach((log) => addresses.add(log.address.toLowerCase()));
    traceResult?.forEach((trace) => {
      if (trace?.action?.to) addresses.add(trace.action.to.toLowerCase());
    });
    if (addresses.size === 0) return undefined;

    let active = true;
    const chainId = publicClient?.chain?.id ?? 1;
    const baseUrl = 'https://sourcify.dev/server';

    const extractAbi = (data) => {
      if (Array.isArray(data?.abi)) return data.abi;
      if (Array.isArray(data?.metadata?.output?.abi)) return data.metadata.output.abi;
      if (Array.isArray(data?.output?.abi)) return data.output.abi;
      if (Array.isArray(data?.contracts)) {
        const contractWithAbi = data.contracts.find((item) => Array.isArray(item?.abi));
        if (contractWithAbi) return contractWithAbi.abi;
      }
      return null;
    };

    const extractContractName = (data) => {
      const compilationTarget = data?.metadata?.settings?.compilationTarget;
      if (compilationTarget && typeof compilationTarget === 'object') {
        const targetName = Object.values(compilationTarget)[0];
        if (targetName) return targetName;
      }
      if (Array.isArray(data?.contracts) && data.contracts[0]?.name) {
        return data.contracts[0].name;
      }
      return null;
    };

    const normalizeMatchType = (matchType) => {
      if (!matchType) return 'unknown';
      if (matchType.includes('partial')) return 'partial';
      if (matchType.includes('full') || matchType.includes('exact')) return 'full';
      return matchType;
    };

    const fetchAbi = async (address) => {
      if (abiStatusByAddress[address]) return;
      setAbiStatusByAddress((prev) => ({ ...prev, [address]: 'loading' }));

      const tryContractEndpoint = async () => {
        const response = await fetch(`${baseUrl}/v2/contract/${chainId}/${address}?fields=all`);
        if (!response.ok) return null;
        const data = await response.json();
        const abi = extractAbi(data);
        if (!abi) return null;
        const matchType = normalizeMatchType(data?.matchType || data?.contracts?.[0]?.matchType || 'full');
        return { abi, matchType, raw: data };
      };

      const tryMatch = async (matchType) => {
        const response = await fetch(
          `${baseUrl}/repository/contracts/${matchType}/${chainId}/${address}/metadata.json`
        );
        if (!response.ok) return null;
        const metadata = await response.json();
        const abi = extractAbi(metadata);
        if (!abi) return null;
        return { abi, matchType, raw: metadata };
      };

      try {
        const contractResponse = await tryContractEndpoint();
        if (contractResponse && active) {
          setAbiByAddress((prev) => ({ ...prev, [address]: contractResponse.abi }));
          setAbiStatusByAddress((prev) => ({ ...prev, [address]: contractResponse.matchType }));
          const name = extractContractName(contractResponse.raw);
          if (name) {
            setContractNameByAddress((prev) => ({ ...prev, [address]: name }));
          }
          return;
        }

        const fullMatch = await tryMatch('full_match');
        if (fullMatch && active) {
          setAbiByAddress((prev) => ({ ...prev, [address]: fullMatch.abi }));
          setAbiStatusByAddress((prev) => ({ ...prev, [address]: 'full' }));
          const name = extractContractName(fullMatch.raw);
          if (name) {
            setContractNameByAddress((prev) => ({ ...prev, [address]: name }));
          }
          return;
        }

        const partialMatch = await tryMatch('partial_match');
        if (partialMatch && active) {
          setAbiByAddress((prev) => ({ ...prev, [address]: partialMatch.abi }));
          setAbiStatusByAddress((prev) => ({ ...prev, [address]: 'partial' }));
          const name = extractContractName(partialMatch.raw);
          if (name) {
            setContractNameByAddress((prev) => ({ ...prev, [address]: name }));
          }
          return;
        }

        if (active) {
          setAbiStatusByAddress((prev) => ({ ...prev, [address]: 'none' }));
        }
      } catch (_err) {
        if (active) {
          setAbiStatusByAddress((prev) => ({ ...prev, [address]: 'none' }));
        }
      }
    };

    addresses.forEach((address) => {
      fetchAbi(address);
    });

    return () => {
      active = false;
    };
  }, [tx, receipt, traceResult, publicClient]);

  useEffect(() => {
    if (!receipt?.blockNumber) return undefined;
    let active = true;
    const fetchBlock = async () => {
      try {
        const block = await publicClient.request({
          method: 'eth_getBlockByNumber',
          params: [receipt.blockNumber, false],
        });
        if (active) {
          setBlockTimestamp(block?.timestamp || null);
        }
      } catch (_err) {
      }
    };
    fetchBlock();
    return () => {
      active = false;
    };
  }, [receipt, publicClient]);

  useEffect(() => {
    if (!txhash) return undefined;
    let active = true;

    const fetchTrace = async () => {
      setTraceError(null);
      setTraceResult(null);

      for (const rpcUrl of TRACE_RPCS) {
        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'trace_transaction',
              params: [txhash],
            }),
          });
          const payload = await response.json();
          if (payload?.result) {
            if (active) setTraceResult(payload.result);
            return;
          }
        } catch (_err) {
        }
      }

      if (active) {
        setTraceError('Trace RPC not available from public endpoints.');
      }
    };

    fetchTrace();
    return () => {
      active = false;
    };
  }, [txhash]);

  useEffect(() => {
    let active = true;
    const fetchLatestBlock = async () => {
      try {
        const latest = await publicClient.request({
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
        });
        if (active) {
          setLatestBlockNumber(hexToNumber(latest?.number));
        }
      } catch (_err) {
      }
    };

    fetchLatestBlock();
    const interval = setInterval(fetchLatestBlock, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [publicClient]);

  const confirmations = receipt?.blockNumber && latestBlockNumber !== null
    ? Math.max(latestBlockNumber - hexToNumber(receipt.blockNumber) + 1, 0)
    : 0;

  const statusBadge = receipt?.status === '0x1' ? 'Success' : receipt?.status === '0x0' ? 'Failed' : 'Pending';

  const decodedInput = (() => {
    if (!tx?.to || !tx?.input) return null;
    const abi = abiByAddress[tx.to.toLowerCase()];
    if (!abi) return null;
    try {
      return decodeFunctionData({ abi, data: tx.input });
    } catch (_err) {
      return null;
    }
  })();

  const inputDefinition = (() => {
    if (!decodedInput || !tx?.to) return null;
    const abi = abiByAddress[tx.to.toLowerCase()];
    if (!abi) return null;
    return abi.find((item) => item.type === 'function' && item.name === decodedInput.functionName) || null;
  })();

  const normalizeJson = (value) => {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, normalizeJson(entry)])
      );
    }
    return value;
  };

  const renderArgs = (args, inputs = []) => {
    if (!args) return null;
    const namedEntries = Object.entries(args).filter(([key]) => Number.isNaN(Number(key)));
    const fallbackEntries = Array.isArray(args)
      ? args.map((value, index) => [inputs[index]?.name || index, value])
      : Object.entries(args);
    const entries = namedEntries.length ? namedEntries : fallbackEntries;

    if (entries.length === 0) return null;

    return (
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Param</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={String(key)}>
                <td className="font-mono">{key}</td>
                <td className="font-mono break-all">
                  {typeof value === 'bigint'
                    ? value.toString()
                    : typeof value === 'object'
                      ? JSON.stringify(normalizeJson(value))
                      : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const decodedLogs = receipt?.logs?.map((log) => {
    const abi = abiByAddress[log.address.toLowerCase()];
    if (!abi) return { log, decoded: null, inputs: [] };
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });
      const eventDefinition = abi.find((item) => item.type === 'event' && item.name === decoded.eventName);
      return { log, decoded, inputs: eventDefinition?.inputs || [] };
    } catch (_err) {
      return { log, decoded: null, inputs: [] };
    }
  }) ?? [];

  const decodedTraceCalls = traceResult?.map((trace, index) => {
    const toAddress = trace?.action?.to?.toLowerCase();
    const abi = toAddress ? abiByAddress[toAddress] : null;
    let decoded = null;
    let inputs = [];
    if (abi && trace?.action?.input && trace.action.input !== '0x') {
      try {
        decoded = decodeFunctionData({ abi, data: trace.action.input });
        const definition = abi.find((item) => item.type === 'function' && item.name === decoded.functionName);
        inputs = definition?.inputs || [];
      } catch (_err) {
        decoded = null;
      }
    }

    return {
      trace,
      decoded,
      inputs,
      depth: trace?.traceAddress?.length || 0,
      key: `${trace.transactionHash || txhash}-${index}`,
    };
  }) ?? [];

  return (
    <div className="space-y-6">
      <Navbar />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-base-content/60">Transaction</p>
        </div>
      </div>

      {loading && <Notice type="info" message="Loading transaction…" />}
      {error && <Notice type="error" message={error} />}
      {!loading && !tx && <Notice type="warning" message="Transaction not found." />}

      {tx && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Hash</div>
                <div className="font-mono break-all">{tx.hash}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Status</div>
                <div className={`badge ${statusBadge === 'Success' ? 'badge-success' : statusBadge === 'Failed' ? 'badge-error' : 'badge-outline'}`}>
                  {statusBadge}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">From</div>
                <AddressBadge address={tx.from} name={contractNameByAddress[tx.from?.toLowerCase()]} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">To</div>
                {tx.to ? (
                  <AddressBadge address={tx.to} name={contractNameByAddress[tx.to?.toLowerCase()]} />
                ) : (
                  <div className="text-base-content/60">Contract creation</div>
                )}
              </div>
              {blockTimestamp && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-base-content/60">Date</div>
                  <div>{formatTimestamp(blockTimestamp)}</div>
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Confirmations</div>
                <div>{receipt?.blockNumber ? confirmations : 'Pending'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Value</div>
                <div>{formatEther(BigInt(tx.value || '0'))} ETH</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Nonce</div>
                <div>{hexToNumber(tx.nonce)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Gas</div>
                <div>{hexToNumber(tx.gas)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Gas price</div>
                <div>{hexToNumber(tx.gasPrice)} wei</div>
              </div>
            </div>
            {decodedInput && (
              <div className="divider">Decoded input</div>
            )}
            {decodedInput && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">{decodedInput.functionName}</div>
                {renderArgs(decodedInput.args, inputDefinition?.inputs || [])}
              </div>
            )}
          </div>
        </div>
      )}

      {receipt && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Receipt</h2>
              <span className="badge badge-outline">{receipt.logs?.length ?? 0} logs</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Block</div>
                <div className="font-mono">{hexToNumber(receipt.blockNumber)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Confirmations</div>
                <div>{receipt.blockNumber ? confirmations : 'Pending'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Block hash</div>
                <div className="font-mono break-all">{receipt.blockHash}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Gas used</div>
                <div>{hexToNumber(receipt.gasUsed)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Effective gas price</div>
                <div>{hexToNumber(receipt.effectiveGasPrice)} wei</div>
              </div>
              {receipt.contractAddress && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-base-content/60">Contract created</div>
                  <div className="font-mono break-all">{receipt.contractAddress}</div>
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-widest text-base-content/60">Cumulative gas used</div>
                <div>{hexToNumber(receipt.cumulativeGasUsed)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(traceResult || traceError) && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Trace calls</h2>
              {traceResult && (
                <span className="badge badge-outline">{traceResult.length} calls</span>
              )}
            </div>
            {traceError ? (
              <Notice type="warning" message={traceError} />
            ) : (
              <div className="space-y-4">
                {decodedTraceCalls.map(({ trace, decoded, inputs, depth, key }) => (
                  <div key={key} className="rounded-box border border-base-200 bg-base-200/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-outline">{trace?.type || trace?.action?.callType || 'call'}</span>
                      <span className="badge badge-ghost">depth {depth}</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-widest text-base-content/60">From</div>
                        <AddressBadge address={trace?.action?.from} name={contractNameByAddress[trace?.action?.from?.toLowerCase()]} />
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-widest text-base-content/60">To</div>
                        <AddressBadge address={trace?.action?.to} name={contractNameByAddress[trace?.action?.to?.toLowerCase()]} />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-widest text-base-content/60">Gas</div>
                        <div className="font-mono">{trace?.action?.gas || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-widest text-base-content/60">Value</div>
                        <div className="font-mono">{trace?.action?.value || '0x0'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-widest text-base-content/60">Output</div>
                        <div className="font-mono truncate">{trace?.result?.output || '0x'}</div>
                      </div>
                    </div>
                    {decoded ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">{decoded.functionName}</div>
                        {renderArgs(decoded.args, inputs)}
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs uppercase tracking-widest text-base-content/60">Input</div>
                        <div className="font-mono break-all text-sm">{trace?.action?.input || '0x'}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {receipt && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Logs</h2>
              <span className="badge badge-outline">{receipt.logs?.length ?? 0} total</span>
            </div>
            {decodedLogs.length === 0 ? (
              <div className="text-base-content/60">No logs emitted.</div>
            ) : (
              <div className="space-y-4">
                {decodedLogs.map(({ log, decoded, inputs }, index) => {
                  const matchStatus = abiStatusByAddress[log.address.toLowerCase()] || 'unknown';
                  return (
                    <div key={`${log.transactionHash}-${index}`} className="border border-base-200 rounded-box p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-outline">Log {index + 1}</span>
                        <span className="badge badge-ghost">{matchStatus}</span>
                        <Link className="link link-primary" to={`/address/${log.address}`}>
                          {log.address}
                        </Link>
                      </div>
                      {decoded ? (
                        <>
                          <div className="font-semibold">{decoded.eventName}</div>
                          {renderArgs(decoded.args, inputs)}
                        </>
                      ) : (
                        <pre className="bg-base-200 p-4 rounded-box text-xs overflow-x-auto">
                          {JSON.stringify({ topics: log.topics, data: log.data }, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
