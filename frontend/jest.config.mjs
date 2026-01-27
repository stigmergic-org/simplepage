export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@simplepg|multiformats|@ipld)/)'
  ],
  // Run tests sequentially to avoid test environment conflicts
  maxWorkers: 1,
  // Verbose output for debugging
  verbose: true
}