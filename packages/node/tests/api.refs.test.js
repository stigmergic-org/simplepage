import { jest } from '@jest/globals'

import { createApi } from '../src/api.js'

const { FormData, Blob, fetch } = globalThis

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
      putRefCar: async () => ({ refId: 'draft', contentCid: 'bafyref', sequence: 1 }),
      refIndex: {
        listRefs: async () => [],
      },
      subscriptionIndex: {
        getStatus: async () => ({ status: 'active', units: [], expiresAt: null })
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
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`
  }
}

const stopServer = async (server) => new Promise(resolve => server.close(resolve))

describe('refs API', () => {
  it('lists refs for a domain', async () => {
    const refs = [{ refId: 'draft', contentCid: 'bafyref', sequence: 1, latest: true, agentName: 'api-agent' }]
    const { server, baseUrl } = await startServer({
      refIndex: {
        listRefs: async () => refs
      }
    })

    try {
      const response = await fetch(`${baseUrl}/refs/example.eth`)
      expect(response.ok).toBe(true)
      await expect(response.json()).resolves.toEqual({ refs })
    } finally {
      await stopServer(server)
    }
  })

  it('stores a ref car for a domain', async () => {
    const storedRef = { refId: 'draft', contentCid: 'bafyref', sequence: 1, agentName: 'api-agent' }
    const { server, baseUrl } = await startServer({
      putRefCar: async () => storedRef
    })

    try {
      const formData = new FormData()
      formData.append('file', new Blob(['ref car'], { type: 'application/vnd.ipld.car' }), 'ref.car')
      const response = await fetch(`${baseUrl}/refs/example.eth`, {
        method: 'POST',
        body: formData,
      })

      expect(response.ok).toBe(true)
      await expect(response.json()).resolves.toEqual({ ref: storedRef })
    } finally {
      await stopServer(server)
    }
  })

  it('rejects ref uploads for domains without an active subscription', async () => {
    const putRefCar = jest.fn()
    const { server, baseUrl } = await startServer({
      putRefCar,
      subscriptionIndex: {
        getStatus: async () => ({ status: 'expired', units: [], expiresAt: '2026-01-01T00:00:00.000Z' })
      },
    })

    try {
      const formData = new FormData()
      formData.append('file', new Blob(['ref car'], { type: 'application/vnd.ipld.car' }), 'ref.car')
      const response = await fetch(`${baseUrl}/refs/example.eth`, {
        method: 'POST',
        body: formData,
      })

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        detail: 'Subscription expired',
        reason: 'expired',
      })
      expect(putRefCar).not.toHaveBeenCalled()
    } finally {
      await stopServer(server)
    }
  })
})
