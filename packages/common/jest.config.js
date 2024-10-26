export default {
  testEnvironment: 'node',
  transform: {},
  transformIgnorePatterns: [
    'node_modules/(?!(cross-fetch)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  setupFiles: ['<rootDir>/test/setupFetchMock.js'],
}; 