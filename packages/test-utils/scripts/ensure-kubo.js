import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const kubo = require('kubo')

function getKuboPath() {
  try {
    return kubo.path()
  } catch (_error) {
    return null
  }
}

function isWorkingKubo(binaryPath) {
  if (!binaryPath) return false

  const result = spawnSync(binaryPath, ['version'], { stdio: 'ignore' })
  return !result.error && result.status === 0
}

const existingPath = getKuboPath()
if (isWorkingKubo(existingPath)) {
  process.exit(0)
}

const kuboPackageDir = dirname(require.resolve('kubo'))
const postinstallPath = join(kuboPackageDir, 'post-install.js')
const result = spawnSync(process.execPath, [postinstallPath], {
  cwd: dirname(kuboPackageDir),
  stdio: 'inherit'
})

if (result.error) {
  throw result.error
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const installedPath = getKuboPath()
if (!isWorkingKubo(installedPath)) {
  throw new Error('Kubo binary was installed but could not be executed')
}
