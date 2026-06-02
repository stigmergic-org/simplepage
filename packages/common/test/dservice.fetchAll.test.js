import { jest } from '@jest/globals'
import fetchMock from 'jest-fetch-mock'

import { DService } from '../src/dservice.js'

describe('DService fetch all endpoints', () => {
  let dservice

  beforeEach(() => {
    fetchMock.enableMocks()
    fetchMock.resetMocks()
    dservice = new DService('test.eth', {
      apiEndpoint: 'https://api1.example.com'
    })
    dservice.dserviceEndpoints = [
      'https://api1.example.com',
      'https://api2.example.com'
    ]
  })

  afterEach(() => {
    fetchMock.disableMocks()
    jest.clearAllMocks()
  })

  it('posts to every endpoint when allEndpoints is enabled', async () => {
    fetchMock.mockImplementation(async (request) => {
      const url = typeof request === 'string' ? request : request.url

      if (url.startsWith('https://api1.example.com/')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      }

      if (url.startsWith('https://api2.example.com/')) {
        return new Response('Unavailable', { status: 503 })
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    await dservice.init({ getChainId: async () => 1 }, { chainId: 1 })
    const results = await dservice.fetch('/capabilities/example.eth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ hello: 'world' })
    }, {
      allEndpoints: true
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api1.example.com/capabilities/example.eth',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api2.example.com/capabilities/example.eth',
      expect.objectContaining({ method: 'POST' })
    )
    expect(results).toHaveLength(2)

    const resultsByEndpoint = new Map(results.map(result => [result.endpoint, result.response]))
    expect(resultsByEndpoint.get('https://api1.example.com')?.ok).toBe(true)
    expect(resultsByEndpoint.get('https://api2.example.com')?.status).toBe(503)
  })
})
