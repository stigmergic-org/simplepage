export default {
  testEnvironment: 'node',
  transform: {},
  testRunner: './testRunner.cjs',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@simplepg/node$': '<rootDir>/../node/src/index.js'
  }
}; 
