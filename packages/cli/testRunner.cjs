const nodeFs = require('node:fs')
const path = require('node:path')

const pnpmStorePath = path.resolve(__dirname, '../../node_modules/.pnpm')
const jestCircusEntry = nodeFs.readdirSync(pnpmStorePath)
  .find(entry => entry.startsWith('jest-circus@'))

if (!jestCircusEntry) {
  throw new Error('Could not locate jest-circus in the pnpm store')
}

module.exports = require(path.join(
  pnpmStorePath,
  jestCircusEntry,
  'node_modules/jest-circus/build/runner.js'
))
