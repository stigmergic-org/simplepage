// Setup file for jest-fetch-mock
import fetchMock from 'jest-fetch-mock'

// Disable fetch mocking by default - we'll enable it only for specific tests
fetchMock.disableMocks()

// Set default response for when mocking is enabled
fetchMock.mockResponse('{}') 