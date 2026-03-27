import { createApi } from '../src/api.js'

const { FormData, Blob, fetch } = globalThis

const mockLogger = {
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {}
}

const createTestIpfs = (status) => ({
  maxStagedAge: 60 * 60,
  subscriptionIndex: {
    getStatus: async () => typeof status === 'function' ? status() : status
  },
  stageCar: async () => ({
    toString: () => 'bafytestcid'
  })
})

const startServer = async (status, { indexer } = {}) => {
  const app = createApi({
    ipfs: createTestIpfs(status),
    _indexer: indexer,
    version: 'test',
    logger: mockLogger,
    rateLimits: {
      upload: {
        enabled: false
      }
    },
    trustProxy: false
  })

  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`
  return { server, baseUrl }
}

const stopServer = async (server) => {
  await new Promise(resolve => server.close(resolve))
}

const buildForm = (content = 'test') => {
  const formData = new FormData()
  formData.append('file', new Blob([content], { type: 'application/vnd.ipld.car' }), 'site.car')
  return formData
}

const upload = async (baseUrl, domain = 'example.eth', content = 'test') => {
  return fetch(`${baseUrl}/page?domain=${encodeURIComponent(domain)}`, {
    method: 'POST',
    body: buildForm(content)
  })
}

describe('subscription enforcement', () => {
  it('rejects uploads when subscription is expired', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 10
    const { server, baseUrl } = await startServer({
      status: 'expired',
      expiresAt,
      units: [expiresAt]
    })

    try {
      const response = await upload(baseUrl)
      expect(response.status).toBe(401)
      const payload = await response.json()
      expect(payload.reason).toBe('expired')
      expect(payload.detail).toBe('Subscription expired')
      expect(payload.expiresAt).toBe(expiresAt)
    } finally {
      await stopServer(server)
    }
  })

  it('rejects uploads when subscription is missing', async () => {
    const { server, baseUrl } = await startServer({
      status: 'missing',
      expiresAt: null,
      units: []
    })

    try {
      const response = await upload(baseUrl)
      expect(response.status).toBe(401)
      const payload = await response.json()
      expect(payload.reason).toBe('missing')
      expect(payload.detail).toBe('Subscription not found')
      expect(payload.expiresAt).toBeUndefined()
    } finally {
      await stopServer(server)
    }
  })

  it('refreshes stale subscription state before rejecting uploads', async () => {
    let status = {
      status: 'missing',
      expiresAt: null,
      units: []
    }
    const indexer = {
      refreshDomainRegistration: async () => {
        status = {
          status: 'active',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          units: [Math.floor(Date.now() / 1000) + 3600]
        }
        return { domain: 'example.eth' }
      }
    }
    const { server, baseUrl } = await startServer(() => status, { indexer })

    try {
      const response = await upload(baseUrl)
      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload.cid).toBe('bafytestcid')
    } finally {
      await stopServer(server)
    }
  })
})
