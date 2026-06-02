import { createApi } from '../src/api.js'

const { fetch } = globalThis

const logger = {
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {},
}

const startServer = async (ipfsOverrides = {}) => {
  const app = createApi({
    ipfs: {
      maxStagedAge: 60 * 60,
      subscriptionIndex: {
        getStatus: async () => ({ status: 'active', units: [], expiresAt: null })
      },
      stageCar: async () => ({ toString: () => 'bafytestcid' }),
      putRefCar: async () => ({ refId: 'draft', contentCid: 'bafyref', sequence: 1 }),
      refIndex: {
        listRefs: async () => [],
      },
      capabilityStore: {
        listCapabilities: () => [],
        putCapability: async () => null,
      },
      ...ipfsOverrides,
    },
    version: 'test',
    logger,
    rateLimits: {
      upload: {
        enabled: false
      }
    }
  })

  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const { port } = server.address()
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

const stopServer = async (server) => new Promise(resolve => server.close(resolve))

describe('capabilities API', () => {
  it('stores and lists capabilities for a domain', async () => {
    const capability = {
      domain: 'example.eth',
      key: 'did:key:z6Mkexample',
      didKey: 'did:key:z6Mkexample',
      siweMessage: 'message',
      siweSignature: 'signature',
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-04-02T10:00:00.000Z',
      expiresAt: '2026-04-02T10:30:00.000Z',
      nonce: '1',
      agentName: 'api-agent',
    }
    const { server, baseUrl } = await startServer({
      capabilityStore: {
        putCapability: async () => capability,
        listCapabilities: () => [capability],
      },
    })

    try {
      const postResponse = await fetch(`${baseUrl}/capabilities/example.eth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: capability.key,
          siweMessage: capability.siweMessage,
          siweSignature: capability.siweSignature,
        })
      })

      expect(postResponse.ok).toBe(true)
      await expect(postResponse.json()).resolves.toEqual({ capability })

      const getResponse = await fetch(`${baseUrl}/capabilities/example.eth`)
      expect(getResponse.ok).toBe(true)
      await expect(getResponse.json()).resolves.toEqual({ capabilities: [capability] })
    } finally {
      await stopServer(server)
    }
  })

  it('lists capabilities for a domain', async () => {
    const capabilitiesList = [{ domain: 'example.eth', key: 'did:key:z6Mkexample' }]
    const { server, baseUrl } = await startServer({
      capabilityStore: {
        putCapability: async () => capabilitiesList[0],
        listCapabilities: () => capabilitiesList,
      },
    })

    try {
      const response = await fetch(`${baseUrl}/capabilities/example.eth`)
      expect(response.ok).toBe(true)
      await expect(response.json()).resolves.toEqual({ capabilities: capabilitiesList })
    } finally {
      await stopServer(server)
    }
  })
})
