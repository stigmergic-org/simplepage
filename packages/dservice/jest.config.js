export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // Run tests sequentially to avoid Anvil process conflicts
  maxWorkers: 1,
  // Verbose output for debugging
  verbose: true
} 