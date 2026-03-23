import { createApi } from '../src/api.js'

const { fetch } = globalThis

const mockLogger = {
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {}
}

const startServer = async () => {
  const app = createApi({
    ipfs: {
      maxStagedAge: 60 * 60
    },
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

const requestInfo = async (baseUrl, origin) => {
  return fetch(`${baseUrl}/info`, {
    headers: {
      Origin: origin
    }
  })
}

describe('cors origin allowlist', () => {
  it('allows .eth origins', async () => {
    const { server, baseUrl } = await startServer()

    try {
      const origin = 'https://editor.simplepage.eth.limo'
      const response = await requestInfo(baseUrl, origin)

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    } finally {
      await stopServer(server)
    }
  })

  it('allows .wei origins', async () => {
    const { server, baseUrl } = await startServer()

    try {
      const domainsOrigin = 'https://app.wei.domains'
      const domainsResponse = await requestInfo(baseUrl, domainsOrigin)

      expect(domainsResponse.status).toBe(200)
      expect(domainsResponse.headers.get('access-control-allow-origin')).toBe(domainsOrigin)

      const isOrigin = 'https://app.wei.is'
      const isResponse = await requestInfo(baseUrl, isOrigin)

      expect(isResponse.status).toBe(200)
      expect(isResponse.headers.get('access-control-allow-origin')).toBe(isOrigin)
    } finally {
      await stopServer(server)
    }
  })

  it('blocks cid-based .ipfs. gateway origins', async () => {
    const { server, baseUrl } = await startServer()

    try {
      const response = await requestInfo(
        baseUrl,
        'https://bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm.ipfs.dweb.link'
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      await stopServer(server)
    }
  })

  it('blocks origins without an allowed name label', async () => {
    const { server, baseUrl } = await startServer()

    try {
      const response = await requestInfo(baseUrl, 'https://example.com')

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      await stopServer(server)
    }
  })
})
