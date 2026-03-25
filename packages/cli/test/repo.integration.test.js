import { jest } from '@jest/globals'
import '../../repo/node_modules/fake-indexeddb/auto/index.mjs'

import { spawnSync } from 'node:child_process'
import nodeFs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSource } from '@helia/unixfs'
import all from 'it-all'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { resolveEnsDomain, carFromBytes, emptyUnixfs, cat } from '@simplepg/common'

import { TestEnvironmentNode } from '../../test-utils/src/testEnvNode.js'
import { MockStorage } from '../../test-utils/src/mockStorage.js'
import { Repo } from '../../repo/src/repo.js'
import { runCliCommand } from './runCliCommand.js'


jest.setTimeout(120000)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TEST_UTILS_DIR = path.resolve(__dirname, '../../test-utils')
const require = createRequire(import.meta.url)

const jestEnvironmentJsdomPath = require.resolve('jest-environment-jsdom', {
  paths: [path.resolve(__dirname, '../../repo')]
})
const jsdomRequire = createRequire(jestEnvironmentJsdomPath)
const { JSDOM } = jsdomRequire('jsdom')

const dom = new JSDOM()
global.DOMParser = dom.window.DOMParser

const TEMPLATE_FIXTURE_PATH = path.resolve(__dirname, '../../repo/test/__fixtures__/new.simplepage.eth')
const DOMAIN = 'repo-test.eth'
const YEAR_SECONDS = 365 * 24 * 60 * 60
const TO_ADDRESS = '0x0000000000000000000000000000000000000001'

const requiredCommands = ['anvil', 'forge', 'cast']
const hasCommand = (command) => !spawnSync(command, ['--version'], { stdio: 'ignore' }).error
const getKuboBinaryPath = () => {
  const result = spawnSync('node', [
    '--input-type=module',
    '-e',
    "import { path } from 'kubo'; process.stdout.write(path())"
  ], {
    cwd: TEST_UTILS_DIR,
    encoding: 'utf8'
  })

  if (result.error || result.status !== 0) {
    return null
  }

  return result.stdout.trim() || null
}

const kuboBinaryPath = getKuboBinaryPath()
const hasWorkingKubo = () => {
  if (!kuboBinaryPath) return false
  const result = spawnSync(kuboBinaryPath, ['version'], { stdio: 'ignore' })
  return !result.error && result.status === 0
}
const describeIntegration = requiredCommands.every(hasCommand) && hasWorkingKubo() ? describe : describe.skip

const loadFixtures = async (kuboApi, fixturePath) => {
  const glob = globSource(fixturePath, '**/*')
  const entries = await all(glob)
  const result = await all(await kuboApi.addAll(entries, { wrapWithDirectory: true }))
  return result[result.length - 1].cid.toV1()
}

const realPath = (targetPath) => nodeFs.realpathSync.native ? nodeFs.realpathSync.native(targetPath) : nodeFs.realpathSync(targetPath)

describeIntegration('simplepage repo CLI integration', () => {
  let testEnv
  let addresses
  let client
  let walletClient
  let flags
  let statusFlags
  let versionA
  let versionB

  const publishVersion = async (repo, edits) => {
    for (const edit of edits) {
      if (edit.type === 'delete') {
        await repo.deletePage(edit.path)
      } else {
        await repo.setPageEdit(edit.path, edit.markdown, edit.body)
      }
    }

    const result = await repo.stage(DOMAIN, false)
    const hash = await walletClient.writeContract(result.prepTx)
    const receipt = await client.waitForTransactionReceipt({ hash })
    await testEnv.waitUntilBlockIsIndexed(receipt.blockNumber)
    await repo.finalizeCommit(result.cid)
    await testEnv.node.waitUntilCidIsServed(result.cid)
    return result
  }

  beforeAll(async () => {
    testEnv = new TestEnvironmentNode()
    await testEnv.start()
    addresses = testEnv.addresses

    client = createPublicClient({
      transport: http(testEnv.evm.url)
    })

    walletClient = createWalletClient({
      chain: testEnv.evm.chain,
      transport: http(testEnv.evm.url),
      account: privateKeyToAccount(testEnv.evm.secretKey)
    })

    testEnv.evm.mintPage('new.simplepage.eth', YEAR_SECONDS, TO_ADDRESS)
    testEnv.evm.mintPage(DOMAIN, YEAR_SECONDS, TO_ADDRESS)
    await testEnv.waitUntilBlockIsIndexed(testEnv.evm.getBlockNumber())

    testEnv.evm.setResolver(addresses.universalResolver, 'new.simplepage.eth', addresses.resolver1)
    testEnv.evm.setTextRecord(addresses.resolver1, 'new.simplepage.eth', 'dservice', testEnv.dserviceUrl)
    testEnv.evm.setResolver(addresses.universalResolver, DOMAIN, addresses.resolver1)

    const templateCid = await loadFixtures(testEnv.kuboApi, TEMPLATE_FIXTURE_PATH)
    testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString())
    testEnv.evm.setContenthash(addresses.resolver1, DOMAIN, templateCid.toString())

    const storage = new MockStorage()
    const repo = new Repo(DOMAIN, storage)
    await repo.init(client, {
      chainId: Number(testEnv.evm.chainId),
      universalResolver: addresses.universalResolver
    })

    versionA = await publishVersion(repo, [
      {
        path: '/',
        markdown: '# Home v1\n',
        body: '<h1>Home v1</h1>'
      },
      {
        path: '/about/',
        markdown: '# About v1\n',
        body: '<h1>About v1</h1>'
      },
      {
        path: '/docs/guides/',
        markdown: '# Guide v1\n',
        body: '<h1>Guide v1</h1>'
      }
    ])

    versionB = await publishVersion(repo, [
      {
        path: '/',
        markdown: '# Home v2\n',
        body: '<h1>Home v2</h1>'
      },
      {
        path: '/about/',
        markdown: '# About upstream v2\n',
        body: '<h1>About upstream v2</h1>'
      },
      {
        path: '/docs/guides/',
        type: 'delete'
      },
      {
        path: '/docs/api/',
        markdown: '# API v2\n',
        body: '<h1>API v2</h1>'
      }
    ])

    await repo.close()

    flags = [
      '--rpc', testEnv.evm.url,
      '--universal-resolver', addresses.universalResolver,
      '--dservice', testEnv.dserviceUrl,
    ]

    statusFlags = [
      '--rpc', testEnv.evm.url,
      '--universal-resolver', addresses.universalResolver,
    ]
  })

  afterAll(async () => {
    await testEnv?.stop()
  })

  beforeEach(async () => {
    testEnv.evm.setContenthash(addresses.resolver1, DOMAIN, versionA.cid.toString())
    await testEnv.waitUntilBlockIsIndexed(testEnv.evm.getBlockNumber())
  })

  it('clones markdown files from the live repo and stores the tracked CAR', async () => {
    const tempDir = await nodeFs.promises.mkdtemp(path.join(process.cwd(), 'tmp-repo-clone-'))
    try {
      const output = await runCliCommand(['repo', 'clone', DOMAIN, ...flags], { cwd: tempDir })
      const repoDir = path.join(tempDir, DOMAIN)
      const realRepoDir = realPath(repoDir)

      expect(output.code).toBe(0)
      expect(output.stderr).toBe('')
      expect(output.stdout).toMatch(`Cloned ${DOMAIN} into ${realRepoDir}`)
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'index.md'), 'utf8')).toBe('# Home v1\n')
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'about', 'index.md'), 'utf8')).toBe('# About v1\n')
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'docs', 'guides', 'index.md'), 'utf8')).toBe('# Guide v1\n')
    } finally {
      await nodeFs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('shows markdown diffs against the tracked upstream snapshot', async () => {
    const tempDir = await nodeFs.promises.mkdtemp(path.join(process.cwd(), 'tmp-repo-diff-'))
    try {
      await runCliCommand(['repo', 'clone', DOMAIN, ...flags], { cwd: tempDir })
      const repoDir = path.join(tempDir, DOMAIN)

      await nodeFs.promises.writeFile(path.join(repoDir, 'about', 'index.md'), '# About local\n')
      await nodeFs.promises.mkdir(path.join(repoDir, 'notes'), { recursive: true })
      await nodeFs.promises.writeFile(path.join(repoDir, 'notes', 'index.md'), '# Notes\n')
      await nodeFs.promises.rm(path.join(repoDir, 'docs', 'guides', 'index.md'))

      const output = await runCliCommand(['repo', 'diff'], { cwd: repoDir })

      expect(output.code).toBe(0)
      expect(output.stderr).toBe('')
      expect(output.stdout).toMatch(/diff -- about\/index\.md/)
      expect(output.stdout).toMatch(/-# About v1/)
      expect(output.stdout).toMatch(/\+# About local/)
      expect(output.stdout).toMatch(/diff -- notes\/index\.md/)
      expect(output.stdout).toMatch(/\+# Notes/)
      expect(output.stdout).toMatch(/diff -- docs\/guides\/index\.md/)
      expect(output.stdout).toMatch(/-# Guide v1/)
    } finally {
      await nodeFs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('resets requested markdown files back to the tracked root', async () => {
    const tempDir = await nodeFs.promises.mkdtemp(path.join(process.cwd(), 'tmp-repo-reset-'))
    try {
      await runCliCommand(['repo', 'clone', DOMAIN, ...flags], { cwd: tempDir })
      const repoDir = path.join(tempDir, DOMAIN)

      await nodeFs.promises.writeFile(path.join(repoDir, 'about', 'index.md'), '# About local\n')
      await nodeFs.promises.mkdir(path.join(repoDir, 'notes'), { recursive: true })
      await nodeFs.promises.writeFile(path.join(repoDir, 'notes', 'index.md'), '# Notes\n')
      await nodeFs.promises.rm(path.join(repoDir, 'docs', 'guides', 'index.md'))

      const output = await runCliCommand(['repo', 'reset', 'about', 'notes', 'docs/guides/'], { cwd: repoDir })

      expect(output.code).toBe(0)
      expect(output.stderr).toBe('')
      expect(output.stdout).toMatch(/Reset 3 markdown files to tracked root\./)
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'about', 'index.md'), 'utf8')).toBe('# About v1\n')
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'docs', 'guides', 'index.md'), 'utf8')).toBe('# Guide v1\n')
      expect(nodeFs.existsSync(path.join(repoDir, 'notes', 'index.md'))).toBe(false)
    } finally {
      await nodeFs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('shows local changes and detects when upstream has moved', async () => {
    const tempDir = await nodeFs.promises.mkdtemp(path.join(process.cwd(), 'tmp-repo-status-'))
    try {
      await runCliCommand(['repo', 'clone', DOMAIN, ...flags], { cwd: tempDir })
      const repoDir = path.join(tempDir, DOMAIN)

      await nodeFs.promises.writeFile(path.join(repoDir, 'about', 'index.md'), '# About local\n')
      testEnv.evm.setContenthash(addresses.resolver1, DOMAIN, versionB.cid.toString())
      await testEnv.waitUntilBlockIsIndexed(testEnv.evm.getBlockNumber())

      const output = await runCliCommand(['repo', 'status', ...statusFlags], { cwd: repoDir })

      expect(output.code).toBe(0)
      expect(output.stderr).toBe('')
      expect(output.stdout).toMatch(`Tracked root: ${versionA.cid.toString()}`)
      expect(output.stdout).toMatch(`Upstream root: ${versionB.cid.toString()}`)
      expect(output.stdout).toMatch(/Upstream changes: available/)
      expect(output.stdout).toMatch(/M about\/index\.md/)
    } finally {
      await nodeFs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('pulls a later published version, preserves conflicts, and advances the tracked CAR root', async () => {
    const tempDir = await nodeFs.promises.mkdtemp(path.join(process.cwd(), 'tmp-repo-pull-'))
    try {
      await runCliCommand(['repo', 'clone', DOMAIN, ...flags], { cwd: tempDir })
      const repoDir = path.join(tempDir, DOMAIN)

      await nodeFs.promises.writeFile(path.join(repoDir, 'about', 'index.md'), '# About local\n')
      testEnv.evm.setContenthash(addresses.resolver1, DOMAIN, versionB.cid.toString())
      await testEnv.waitUntilBlockIsIndexed(testEnv.evm.getBlockNumber())

      const output = await runCliCommand(['repo', 'pull', ...flags], { cwd: repoDir })

      expect(output.code).toBe(0)
      expect(output.stderr).toBe('')
      expect(output.stdout).toMatch(`Updated tracked root from ${versionA.cid.toString()} to ${versionB.cid.toString()}`)
      expect(output.stdout).toMatch(/Conflicts left as local changes:/)
      expect(output.stdout).toMatch(/M about\/index\.md/)

      expect(await nodeFs.promises.readFile(path.join(repoDir, 'index.md'), 'utf8')).toBe('# Home v2\n')
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'about', 'index.md'), 'utf8')).toBe('# About local\n')
      expect(await nodeFs.promises.readFile(path.join(repoDir, 'docs', 'api', 'index.md'), 'utf8')).toBe('# API v2\n')

      const carBytes = await nodeFs.promises.readFile(path.join(repoDir, '.simplepage.car'))
      const car = carFromBytes(carBytes)
      expect(car.roots).toHaveLength(1)
      expect(car.roots[0].toString()).toBe(versionB.cid.toString())

      const { fs, blockstore } = emptyUnixfs()
      for (const block of car.blocks) {
        await blockstore.put(block.cid, block.payload)
      }

      await expect(cat(fs, versionA.cid, 'index.md')).resolves.toBe('# Home v1\n')
      await expect(cat(fs, versionB.cid, 'index.md')).resolves.toBe('# Home v2\n')

      const { cid: liveCid } = await resolveEnsDomain(client, DOMAIN, addresses.universalResolver)
      expect(liveCid.toString()).toBe(versionB.cid.toString())
    } finally {
      await nodeFs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })
})
