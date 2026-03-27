import { PeerDiscovery } from '../../src/services/ipfs/peerDiscovery.js'
import { jest } from '@jest/globals'

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const emptyAsyncIterable = () => ({
  async *[Symbol.asyncIterator]() {}
})

describe('PeerDiscovery', () => {
  it('start does not wait for the initial discovery pass', async () => {
    const provideDeferred = createDeferred()
    const client = {
      id: jest.fn().mockResolvedValue({ id: 'local-peer' }),
      routing: {
        provide: jest.fn().mockReturnValue(provideDeferred.promise),
        findProvs: jest.fn().mockReturnValue(emptyAsyncIterable())
      },
      swarm: {
        connect: jest.fn()
      }
    }
    const logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
    const peerDiscovery = new PeerDiscovery({ client, logger, namespace: '1' })

    const result = await Promise.race([
      peerDiscovery.start().then(() => 'started'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 25))
    ])

    expect(result).toBe('started')
    expect(peerDiscovery.intervalId).not.toBeNull()
    expect(client.routing.provide).toHaveBeenCalledTimes(1)

    provideDeferred.resolve(emptyAsyncIterable())
    await new Promise(resolve => setTimeout(resolve, 0))
    await peerDiscovery.stop()
  })
})
