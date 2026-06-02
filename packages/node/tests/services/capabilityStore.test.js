import { jest } from '@jest/globals'
import { privateKeyToAccount } from 'viem/accounts'

import { buildCapabilitySiweMessage } from '@simplepg/common'

import { CapabilityStore } from '../../src/services/capabilityStore.js'
import { RemoteHeadSync } from '../../src/services/ipfs/remoteHeadSync.js'

const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const makeAsyncIterable = (values) => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value
    }
  }
})

const createMockMfs = () => {
  const files = new Map()
  const refsDir = '/spg-data/test/refs'

  const listDir = async (path) => {
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path
    const children = new Set()
    for (const filePath of files.keys()) {
      if (!filePath.startsWith(`${normalizedPath}/`)) {
        continue
      }

      const nextPart = filePath.slice(normalizedPath.length + 1).split('/')[0]
      if (nextPart) {
        children.add(nextPart)
      }
    }

    return [...children].map(name => ({ name }))
  }

  return {
    files,
    refsDir,
    ensureRootDir: async () => {},
    ensureDir: async () => {},
    listDir,
    readFile: async (path) => files.get(path) || null,
    writeFile: async (path, content) => {
      files.set(path, content)
    },
    removePath: async (path) => {
      files.delete(path)
    },
    getDomainOcapsDir: async (domain) => `${refsDir}/${domain}/_ocaps`,
  }
}

const buildSignedCapability = async ({
  domain = 'example.eth',
  didKey = 'did:key:z6MkrJfcfT8vU8nL7YxT8x2HqVYxAQ3YwXx1Y1example',
  agentName = 'writer-bot',
  chainId = 31337,
  issuedAt,
  expiresAt,
} = {}) => {
  const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
  const siweMessage = buildCapabilitySiweMessage({
    ownerAddress: owner.address,
    didKey,
    domain,
    agentName,
    chainId,
    nonce: '1',
    issuedAt,
    expirationTime: expiresAt,
  })
  const siweSignature = await owner.signMessage({ message: siweMessage })

  return {
    owner,
    payload: {
      domain,
      didKey,
      key: didKey,
      agentName,
      siweMessage,
      siweSignature,
    },
  }
}

describe('CapabilityStore', () => {
  it('stores capabilities until the SIWE expiry instead of the local TTL', async () => {
    const now = Date.now()
    const issuedAt = new Date(now - 60 * 1000).toISOString()
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString()
    const { owner, payload } = await buildSignedCapability({ issuedAt, expiresAt })
    const store = new CapabilityStore({
      viemClient: {
        readContract: async () => owner.address,
      },
      chainId: 31337,
      ttlMs: 1000,
      cleanupIntervalMs: 60 * 60 * 1000,
    })

    const stored = await store.putCapability(payload)

    expect(stored.expiresAt).toBe(expiresAt)
    expect(stored.agentName).toBe('writer-bot')

    store.pruneExpired(now + 1500)
    expect(store.getCapability(payload.domain, payload.didKey)?.didKey).toBe(payload.didKey)

    store.pruneExpired(now + 31 * 60 * 1000)
    expect(store.getCapability(payload.domain, payload.didKey)).toBeNull()
  })

  it('loads persisted capabilities and syncs them from peer refs roots', async () => {
    const now = Date.now()
    const issuedAt = new Date(now - 60 * 1000).toISOString()
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString()
    const { owner, payload } = await buildSignedCapability({
      didKey: 'did:key:z6MkmJp8nQhL8o9q7Ywx4uQn8F8mQy1peerExample',
      agentName: 'sync-agent',
      issuedAt,
      expiresAt,
    })
    const mfs = createMockMfs()
    const publishRoot = jest.fn().mockResolvedValue(undefined)
    const rootCid = 'bafybeigdyrsyncroot'
    const domainCid = 'bafybeigdyrsyncdomain'
    const capabilitiesCid = 'bafybeigdyrsynccapabilities'

    const client = {
      name: {
        resolve: jest.fn().mockImplementation(async () => makeAsyncIterable([`/ipfs/${rootCid}`]))
      },
      ls: jest.fn().mockImplementation(async function * (cid) {
        if (cid === rootCid) {
          yield { name: payload.domain, cid: domainCid, type: 'dir' }
          return
        }

        if (cid === domainCid) {
          yield { name: '_ocaps', cid: capabilitiesCid, type: 'dir' }
          return
        }

        if (cid === capabilitiesCid) {
          yield { name: `${encodeURIComponent(payload.didKey)}.json`, cid: 'cap-file', type: 'file' }
        }
      }),
      cat: jest.fn().mockImplementation(() => makeAsyncIterable([
        Buffer.from(JSON.stringify({
          siweMessage: payload.siweMessage,
          siweSignature: payload.siweSignature,
        }))
      ]))
    }

    const store = new CapabilityStore({
      viemClient: {
        readContract: async () => owner.address,
      },
      chainId: 31337,
      mfs,
      cleanupIntervalMs: 60 * 60 * 1000,
    })
    const remoteHeadSync = new RemoteHeadSync({
      client,
      logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
      capabilityStore: store,
      subscriptionIndex: {
        getStatus: jest.fn().mockResolvedValue({ status: 'active' }),
      },
      publishRoot,
    })

    try {
      await store.start()
      await remoteHeadSync.sync(['peer-a'])

      const stored = store.getCapability(payload.domain, payload.didKey)
      expect(stored?.didKey).toBe(payload.didKey)
      expect(stored?.agentName).toBe('sync-agent')

      const persistedPath = `${mfs.refsDir}/${payload.domain}/_ocaps/${encodeURIComponent(payload.didKey)}.json`
      expect(mfs.files.has(persistedPath)).toBe(true)
      expect(JSON.parse(mfs.files.get(persistedPath))).toEqual({
        siweMessage: payload.siweMessage,
        siweSignature: payload.siweSignature,
      })
      expect(publishRoot).toHaveBeenCalled()
    } finally {
      store.stop()
    }
  })
})
