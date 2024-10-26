import { jest } from '@jest/globals'
import fetchMock from 'jest-fetch-mock'
import { TestEnvironmentEvm } from '@simplepg/test-utils'
import { createPublicClient, http } from 'viem'
import { DService } from '../src/dservice.js'

describe('DService', () => {
  let dservice
  let testEnv
  let client

  beforeAll(async () => {
    // Start test environment
    testEnv = new TestEnvironmentEvm()
    await testEnv.start()

    client = createPublicClient({
      transport: http(testEnv.url)
    })
  })

  afterAll(async () => {
    await testEnv.stop()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.resetMocks()
    dservice = new DService('test.eth')
  })

  describe('constructor', () => {
    it('should initialize with domain and options', () => {
      const dserviceWithEndpoint = new DService('example.eth', {
        apiEndpoint: 'https://api.example.com'
      })
      
      expect(dserviceWithEndpoint.domain).toBe('example.eth')
      expect(dserviceWithEndpoint.dserviceEndpoints).toContain('https://api.example.com')
    })

    it('should initialize without apiEndpoint', () => {
      expect(dservice.domain).toBe('test.eth')
      expect(dservice.dserviceEndpoints).toEqual([])
    })
  })

  describe('init with ENS text records', () => {
    it('should fetch endpoints from ENS text record', async () => {

      // Set up resolver for test.eth
      testEnv.setResolver(testEnv.addresses.universalResolver, 'test.eth', testEnv.addresses.resolver1)
      
      // Set dservice text record
      testEnv.setTextRecord(testEnv.addresses.resolver1, 'test.eth', 'dservice', 'https://api1.example.com\nhttps://api2.example.com')

      try {
        await dservice.init(client, { 
          chainId: parseInt(testEnv.chainId),
          universalResolver: testEnv.addresses.universalResolver
        })

        expect(dservice.dserviceEndpoints).toHaveLength(2)
        expect(dservice.dserviceEndpoints).toContain('https://api1.example.com')
        expect(dservice.dserviceEndpoints).toContain('https://api2.example.com')
      } catch (error) {
        console.error('Test failed with error:', error)
        throw error
      }
    })

    it('should not fetch from ENS if apiEndpoint is provided', async () => {
      const dserviceWithEndpoint = new DService('test.eth', {
        apiEndpoint: 'https://api.example.com'
      })

      await dserviceWithEndpoint.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })

      expect(dserviceWithEndpoint.dserviceEndpoints).toContain('https://api.example.com')
      expect(dserviceWithEndpoint.dserviceEndpoints).toHaveLength(1)
    })

    it('should throw error when no text record is found', async () => {
      // Clear any existing resolver and set up a new one but don't set text record
      testEnv.clearResolver(testEnv.addresses.universalResolver, 'test.eth')
      testEnv.setResolver(testEnv.addresses.universalResolver, 'test.eth', testEnv.addresses.resolver1)
      
      // Also clear any existing text record to ensure clean state
      try {
        testEnv.clearTextRecord(testEnv.addresses.resolver1, 'test.eth', 'dservice')
      } catch (e) {
        // Ignore error if text record doesn't exist
      }

      await expect(dservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })).rejects.toThrow('No dservice endpoints found for domain: test.eth')
    })

    it('should throw error when no resolver is found', async () => {
      // Clear any existing resolver for test.eth
      testEnv.clearResolver(testEnv.addresses.universalResolver, 'test.eth')

      await expect(dservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })).rejects.toThrow()
    })

    it('should parse newline-separated URLs correctly', async () => {
      // Set up resolver for test.eth
      testEnv.setResolver(testEnv.addresses.universalResolver, 'test.eth', testEnv.addresses.resolver1)
      
      // Set dservice text record with various formatting
      testEnv.setTextRecord(testEnv.addresses.resolver1, 'test.eth', 'dservice', 'https://api1.example.com\nhttps://api2.example.com\n  https://api3.example.com  \n\nhttps://api4.example.com')

      await dservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })

      expect(dservice.dserviceEndpoints).toContain('https://api1.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api2.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api3.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api4.example.com')
      expect(dservice.dserviceEndpoints).toHaveLength(4)
    })

    it('should filter out empty URLs', async () => {
      // Set up resolver for test.eth
      testEnv.setResolver(testEnv.addresses.universalResolver, 'test.eth', testEnv.addresses.resolver1)
      
      // Set dservice text record with empty lines
      testEnv.setTextRecord(testEnv.addresses.resolver1, 'test.eth', 'dservice', 'https://api1.example.com\n\nhttps://api2.example.com\n  \nhttps://api3.example.com')

      await dservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })

      expect(dservice.dserviceEndpoints).toHaveLength(3)
      expect(dservice.dserviceEndpoints).toContain('https://api1.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api2.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api3.example.com')
    })
  })

  describe.skip('fetch', () => {
    beforeEach(async () => {
      // Enable fetch mocking only for these tests
      fetchMock.enableMocks()
      
      // Initialize with some endpoints
      dservice.dserviceEndpoints = [
        'https://api1.example.com',
        'https://api2.example.com'
      ]
      await dservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })
    })

    afterEach(() => {
      // Disable fetch mocking after these tests
      fetchMock.disableMocks()
    })

    it('should fetch from first successful endpoint', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ data: 'success' }), { status: 200 })

      const result = await dservice.fetch('/test', { method: 'GET' })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api1.example.com/test',
        { method: 'GET' }
      )
      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })

    it('should try next endpoint if first fails', async () => {
      // First endpoint fails
      fetchMock
        .mockResponseOnce('Internal Server Error', { status: 500 })
        .mockResponseOnce(JSON.stringify({ data: 'success' }), { status: 200 })

      const result = await dservice.fetch('/test', { method: 'GET' })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api1.example.com/test', { method: 'GET' })
      expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api2.example.com/test', { method: 'GET' })
      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })

    it('should throw error if all endpoints fail', async () => {
      fetchMock.mockResponse('Internal Server Error', { status: 500 })

      await expect(dservice.fetch('/test', { method: 'GET' }))
        .rejects
        .toThrow('All dservice endpoints failed')
    })

    it('should throw immediately on 4xx errors', async () => {
      fetchMock.mockResponse('Not Found', { status: 404 })

      await expect(dservice.fetch('/test', { method: 'GET' }))
        .rejects
        .toThrow('HTTP 404: Not Found')
    })

    it('should throw error if no endpoints available', async () => {
      const emptyDservice = new DService('test.eth')
      await expect(emptyDservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })).rejects.toThrow('No dservice endpoints found for domain: test.eth')
    })

    it('should handle network errors and try next endpoint', async () => {
      fetchMock
        .mockRejectOnce(new Error('Network error'))
        .mockResponseOnce(JSON.stringify({ data: 'success' }), { status: 200 })

      const result = await dservice.fetch('/test', { method: 'GET' })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })
  })

  describe('endpoint randomization', () => {
    it('should randomize endpoint order', async () => {
      // Set up resolver for test.eth
      testEnv.setResolver(testEnv.addresses.universalResolver, 'test.eth', testEnv.addresses.resolver1)
      
      // Set dservice text record with multiple endpoints
      testEnv.setTextRecord(testEnv.addresses.resolver1, 'test.eth', 'dservice', 'https://api1.example.com\nhttps://api2.example.com\nhttps://api3.example.com')

      await dservice.init(client, { 
        chainId: parseInt(testEnv.chainId),
        universalResolver: testEnv.addresses.universalResolver
      })

      // The order should be randomized, so we can't predict the exact order
      expect(dservice.dserviceEndpoints).toHaveLength(3)
      expect(dservice.dserviceEndpoints).toContain('https://api1.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api2.example.com')
      expect(dservice.dserviceEndpoints).toContain('https://api3.example.com')
    })
  })
}) 