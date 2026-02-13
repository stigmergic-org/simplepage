import { createApi } from '../src/api.js'

const { FormData, Blob, fetch } = globalThis

const mockLogger = {
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {}
}

const createTestIpfs = () => ({
  maxStagedAge: 60 * 60,
  domainExists: async () => true,
  stageCar: async () => ({
    toString: () => 'bafytestcid'
  })
})

const startServer = async (rateLimits) => {
  const app = createApi({
    ipfs: createTestIpfs(),
    version: 'test',
    logger: mockLogger,
    rateLimits,
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

describe('upload rate limits', () => {
  it('enforces request limits per ip+domain', async () => {
    const { server, baseUrl } = await startServer({
      upload: {
        requestsPerIpDomain: 1,
        requestsPerIp: 5,
        requestWindowSeconds: 300,
        bytesPerIpDomain: 1024 * 1024 * 1024,
        bytesPerIp: 2 * 1024 * 1024 * 1024,
        byteWindowSeconds: 3600,
        concurrentPerIp: 1
      }
    })

    try {
      const first = await upload(baseUrl)
      expect(first.status).toBe(200)

      const second = await upload(baseUrl)
      expect(second.status).toBe(429)
    } finally {
      await stopServer(server)
    }
  })

  it('enforces byte budgets per ip', async () => {
    const { server, baseUrl } = await startServer({
      upload: {
        requestsPerIpDomain: 10,
        requestsPerIp: 10,
        requestWindowSeconds: 300,
        bytesPerIpDomain: 1,
        bytesPerIp: 1,
        byteWindowSeconds: 3600,
        concurrentPerIp: 1
      }
    })

    try {
      const response = await upload(baseUrl, 'example.eth', 'content-that-exceeds')
      expect(response.status).toBe(429)
    } finally {
      await stopServer(server)
    }
  })
})
