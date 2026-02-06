import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon, Notice } from '@simplepg/react-components';
import { formatEther } from 'viem';
import { formatTime, formatTimestamp, hexToNumber, shorten, toHex } from '../lib/rpc.js';
import Navbar from '../components/Navbar.jsx';
import { usePublicClient } from 'wagmi';

const INITIAL_BLOCK_COUNT = 10;
const POLL_INTERVAL = 1000;

const BlockRow = ({ block }) => (
  <tr>
    <td className="font-mono">{block.numberValue}</td>
    <td>{formatTime(block.timestamp)}</td>
    <td>{block.txCount}</td>
  </tr>
);

const TxRow = ({ tx }) => (
  <tr>
    <td className="font-mono">
      <Link className="link link-primary" to={`/tx/${tx.hash}`}>
        {shorten(tx.hash, 4)}
      </Link>
    </td>
    <td className="font-mono truncate max-w-[140px]">
      <Link className="link link-primary" to={`/address/${tx.from}`}>
        {shorten(tx.from, 4)}
      </Link>
    </td>
    <td className="font-mono truncate max-w-[140px]">
      {tx.to ? (
        <Link className="link link-primary" to={`/address/${tx.to}`}>
          {shorten(tx.to, 4)}
        </Link>
      ) : (
        'Contract'
      )}
    </td>
    <td>{formatEther(BigInt(tx.value || '0'))} ETH</td>
  </tr>
);

export default function Home() {
  const publicClient = usePublicClient();
  const [blocks, setBlocks] = useState([]);
  const [latestBlock, setLatestBlock] = useState(null);
  const [latestNumber, setLatestNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mergeBlocks = (prev, incoming) => {
    const merged = new Map(prev.map((block) => [block.numberValue, block]));
    incoming.forEach((block) => {
      merged.set(block.numberValue, block);
    });
    return Array.from(merged.values()).sort((a, b) => b.numberValue - a.numberValue).slice(0, INITIAL_BLOCK_COUNT);
  };

  const normalizeBlock = (block) => ({
    number: block.number,
    numberValue: hexToNumber(block.number),
    hash: block.hash,
    timestamp: block.timestamp,
    txCount: block.transactions?.length ?? 0,
  });

  useEffect(() => {
    let active = true;
    const loadBlocks = async () => {
      setLoading(true);
      setError(null);
      try {
        const latest = await publicClient.request({
          method: 'eth_getBlockByNumber',
          params: ['latest', true],
        });
        if (!active) return;
        const latestNumber = hexToNumber(latest.number);
        setLatestBlock(latest);
        setLatestNumber(latestNumber);
        setBlocks([normalizeBlock(latest)]);

        for (let offset = 1; offset < INITIAL_BLOCK_COUNT; offset += 1) {
          if (!active) return;
          const block = await publicClient.request({
            method: 'eth_getBlockByNumber',
            params: [toHex(latestNumber - offset), false],
          });
          if (!block || !active) continue;
          setBlocks((prev) => mergeBlocks(prev, [normalizeBlock(block)]));
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBlocks();
    return () => {
      active = false;
    };
  }, [publicClient]);

  useEffect(() => {
    if (latestNumber === null) return undefined;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const latest = await publicClient.request({
          method: 'eth_getBlockByNumber',
          params: ['latest', true],
        });
        if (cancelled) return;
        const numberValue = hexToNumber(latest.number);
        if (numberValue > latestNumber) {
          for (let nextNumber = latestNumber + 1; nextNumber <= numberValue; nextNumber += 1) {
            if (cancelled) return;
            const block = nextNumber === numberValue
              ? latest
              : await publicClient.request({
                method: 'eth_getBlockByNumber',
                params: [toHex(nextNumber), false],
              });

            if (!block) continue;
            const nextBlock = normalizeBlock(block);
            setBlocks((prev) => mergeBlocks(prev, [nextBlock]));
            setLatestNumber(nextBlock.numberValue);
            if (nextNumber === numberValue) {
              setLatestBlock(latest);
            }
          }
        }
      } catch (_err) {
      }
    }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [latestNumber, publicClient]);

  const latestTxs = useMemo(() => {
    if (!latestBlock?.transactions) return [];
    return latestBlock.transactions.slice(0, 10);
  }, [latestBlock]);

  return (
    <div className="space-y-6">
      <Navbar />
      <div className="hero bg-base-100 rounded-box shadow-sm">
        <div className="hero-content flex-col lg:flex-row">
          <div className="flex-1">
            <p className="text-sm uppercase tracking-widest text-base-content/60">Ethereum Mainnet</p>
            <h1 className="text-4xl font-semibold mt-2">nfo.eth explorer</h1>
            <p className="mt-3 text-base-content/70">Tracking the latest 10 blocks with a fresh view of new transactions.</p>
          </div>
          <div className="stats shadow bg-base-200">
            <div className="stat">
              <div className="stat-title">Latest block</div>
              <div className="stat-value text-primary">{blocks[0]?.numberValue ?? '--'}</div>
              <div className="stat-desc">{blocks[0] ? formatTimestamp(blocks[0].timestamp) : 'Loading'}</div>
            </div>
          </div>
        </div>
      </div>

      {error && <Notice type="error" message={error} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Latest blocks</h2>
              <span className="badge badge-outline">{INITIAL_BLOCK_COUNT} blocks</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Time</th>
                    <th>Txs</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((block) => (
                    <BlockRow key={block.number} block={block} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Latest transactions</h2>
              <span className="badge badge-outline">Block #{blocks[0]?.numberValue ?? '--'}</span>
            </div>
            {latestTxs.length === 0 ? (
              <div className="flex items-center gap-2 text-base-content/60">
                <Icon name="history" size={4} />
                Waiting for transactions…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Hash</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestTxs.map((tx) => (
                      <TxRow key={tx.hash} tx={tx} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
