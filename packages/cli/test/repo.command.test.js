import { jest } from '@jest/globals'
import http from 'node:http'
import nodeFs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { encodeAbiParameters } from 'viem'

import {
  cidToENSContentHash,
  emptyUnixfs,
  addFile,
  emptyCar,
  walkDag,
  carFromBytes,
  cat,
} from '@simplepg/common'

import { runCliCommand } from './runCliCommand.js'


jest.setTimeout(30000)

const UNIVERSAL_RESOLVER = '0x1111111111111111111111111111111111111111'
const RESOLVER_ADDRESS = '0x2222222222222222222222222222222222222222'

const makeTempDir = () => nodeFs.mkdtempSync(path.join(tmpdir(), 'simplepage-repo-cli-'))
const realPath = (targetPath) => nodeFs.realpathSync.native ? nodeFs.realpathSync.native(targetPath) : nodeFs.realpathSync(targetPath)

const buildIndexHtml = (domain, version) => `<html><head><meta name="ens-domain" content="${domain}" /><meta name="version" content="${version}" /></head><body>${version}</body></html>`

const createSiteVersion = async (files) => {
  const { fs, blockstore } = emptyUnixfs()
  let root = await fs.addDirectory()

  for (const [filePath, content] of Object.entries(files)) {
    root = await addFile(fs, root, filePath, content)
  }

  const car = emptyCar()
  const blocks = await walkDag(blockstore, root)
  for (const block of blocks) {
    car.blocks.put(block)
  }
  car.roots.push(root)

  return {
    cid: root,
    carBytes: car.bytes
  }
}

const listen = async (server) => new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve())
})

const closeServer = async (server) => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve())
})

const getServerUrl = (server) => {
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

const createRpcServer = (getCurrentCid) => http.createServer((req, res) => {
  const chunks = []

  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8')
    const payload = rawBody ? JSON.parse(rawBody) : {}
    const requests = Array.isArray(payload) ? payload : [payload]

    const responses = requests.map((entry) => {
      if (entry.method === 'eth_chainId') {
        return { jsonrpc: '2.0', id: entry.id, result: '0x1' }
      }

      if (entry.method !== 'eth_call') {
        return { jsonrpc: '2.0', id: entry.id, result: '0x' }
      }

      const currentCid = getCurrentCid()
      const encodedContenthash = cidToENSContentHash(currentCid)
      const contenthashResult = encodeAbiParameters([{ type: 'bytes' }], [encodedContenthash])
      const outerResult = encodeAbiParameters([
        { name: 'result', type: 'bytes' },
        { name: 'resolver', type: 'address' },
      ], [contenthashResult, RESOLVER_ADDRESS])

      return {
        jsonrpc: '2.0',
        id: entry.id,
        result: outerResult
      }
    })

    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(Array.isArray(payload) ? responses : responses[0]))
  })
})

const createDserviceServer = (carsByCid) => http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname !== '/page') {
    res.statusCode = 404
    res.end('not found')
    return
  }

  const cid = url.searchParams.get('cid')
  if (!cid || !carsByCid.has(cid)) {
    res.statusCode = 404
    res.end('missing cid')
    return
  }

  res.setHeader('Content-Type', 'application/vnd.ipld.car')
  res.end(Buffer.from(carsByCid.get(cid)))
})

describe('simplepage repo CLI command behavior', () => {
  let domain
  let versionA
  let versionB
  let tempDir
  let currentCid
  let rpcServer
  let dserviceServer
  let rpcUrl
  let dserviceUrl
  let repoFlags
  let statusFlags

  beforeAll(async () => {
    domain = 'repo-test.eth'

    versionA = await createSiteVersion({
      'index.html': buildIndexHtml(domain, 'v1'),
      'index.md': '# Home v1\n',
      'about/index.md': '# About v1\n',
      'docs/guides/index.md': '# Guide v1\n'
    })

    versionB = await createSiteVersion({
      'index.html': buildIndexHtml(domain, 'v2'),
      'index.md': '# Home v2\n',
      'about/index.md': '# About upstream v2\n',
      'docs/api/index.md': '# API v2\n'
    })

    currentCid = versionA.cid

    rpcServer = createRpcServer(() => currentCid)
    dserviceServer = createDserviceServer(new Map([
      [versionA.cid.toString(), versionA.carBytes],
      [versionB.cid.toString(), versionB.carBytes],
    ]))

    await Promise.all([
      listen(rpcServer),
      listen(dserviceServer)
    ])

    rpcUrl = getServerUrl(rpcServer)
    dserviceUrl = getServerUrl(dserviceServer)
    repoFlags = [
      '--rpc', rpcUrl,
      '--universal-resolver', UNIVERSAL_RESOLVER,
      '--dservice', dserviceUrl,
    ]
    statusFlags = [
      '--rpc', rpcUrl,
      '--universal-resolver', UNIVERSAL_RESOLVER,
    ]
  })

  afterAll(async () => {
    await Promise.all([
      closeServer(rpcServer),
      closeServer(dserviceServer)
    ])
  })

  beforeEach(() => {
    tempDir = makeTempDir()
    currentCid = versionA.cid
  })

  afterEach(() => {
    if (tempDir && nodeFs.existsSync(tempDir)) {
      nodeFs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('repo clone creates the domain folder and stores markdown plus the CAR file', async () => {
    const output = await runCliCommand(['repo', 'clone', domain, ...repoFlags], { cwd: tempDir })
    const repoDir = path.join(tempDir, domain)
    const realRepoDir = realPath(repoDir)

    expect(output.code).toBe(0)
    expect(output.stderr).toBe('')
    expect(output.stdout).toMatch(`Cloned ${domain} into ${realRepoDir}`)
    expect(nodeFs.readFileSync(path.join(repoDir, 'index.md'), 'utf8')).toBe('# Home v1\n')
    expect(nodeFs.readFileSync(path.join(repoDir, 'about', 'index.md'), 'utf8')).toBe('# About v1\n')
    expect(nodeFs.readFileSync(path.join(repoDir, 'docs', 'guides', 'index.md'), 'utf8')).toBe('# Guide v1\n')

    const carBytes = nodeFs.readFileSync(path.join(repoDir, '.simplepage.car'))
    const car = carFromBytes(carBytes)
    expect(car.roots).toHaveLength(1)
    expect(car.roots[0].toString()).toBe(versionA.cid.toString())
  })

  it('repo diff shows modified, added, and deleted markdown files', async () => {
    await runCliCommand(['repo', 'clone', domain, ...repoFlags], { cwd: tempDir })
    const repoDir = path.join(tempDir, domain)

    nodeFs.writeFileSync(path.join(repoDir, 'about', 'index.md'), '# About local\n')
    nodeFs.mkdirSync(path.join(repoDir, 'notes'), { recursive: true })
    nodeFs.writeFileSync(path.join(repoDir, 'notes', 'index.md'), '# Notes\n')
    nodeFs.rmSync(path.join(repoDir, 'docs', 'guides', 'index.md'))

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
  })

  it('repo reset restores requested markdown files to the tracked root', async () => {
    await runCliCommand(['repo', 'clone', domain, ...repoFlags], { cwd: tempDir })
    const repoDir = path.join(tempDir, domain)

    nodeFs.writeFileSync(path.join(repoDir, 'about', 'index.md'), '# About local\n')
    nodeFs.mkdirSync(path.join(repoDir, 'notes'), { recursive: true })
    nodeFs.writeFileSync(path.join(repoDir, 'notes', 'index.md'), '# Notes\n')
    nodeFs.rmSync(path.join(repoDir, 'docs', 'guides', 'index.md'))

    const output = await runCliCommand(['repo', 'reset', 'about', 'notes', 'docs/guides/'], { cwd: repoDir })

    expect(output.code).toBe(0)
    expect(output.stderr).toBe('')
    expect(output.stdout).toMatch(/Reset 3 markdown files to tracked root\./)
    expect(output.stdout).toMatch(/about\/index\.md/)
    expect(output.stdout).toMatch(/notes\/index\.md/)
    expect(output.stdout).toMatch(/docs\/guides\/index\.md/)
    expect(nodeFs.readFileSync(path.join(repoDir, 'about', 'index.md'), 'utf8')).toBe('# About v1\n')
    expect(nodeFs.existsSync(path.join(repoDir, 'notes', 'index.md'))).toBe(false)
    expect(nodeFs.readFileSync(path.join(repoDir, 'docs', 'guides', 'index.md'), 'utf8')).toBe('# Guide v1\n')
  })

  it('repo status reports both upstream and local changes', async () => {
    await runCliCommand(['repo', 'clone', domain, ...repoFlags], { cwd: tempDir })
    const repoDir = path.join(tempDir, domain)

    nodeFs.writeFileSync(path.join(repoDir, 'about', 'index.md'), '# About local\n')
    currentCid = versionB.cid

    const output = await runCliCommand(['repo', 'status', ...statusFlags], { cwd: repoDir })

    expect(output.code).toBe(0)
    expect(output.stderr).toBe('')
    expect(output.stdout).toMatch(`Domain: ${domain}`)
    expect(output.stdout).toMatch(`Tracked root: ${versionA.cid.toString()}`)
    expect(output.stdout).toMatch(`Upstream root: ${versionB.cid.toString()}`)
    expect(output.stdout).toMatch(/Upstream changes: available/)
    expect(output.stdout).toMatch(/Local markdown changes:/)
    expect(output.stdout).toMatch(/M about\/index\.md/)
  })

  it('repo status stays usable when upstream cannot be reached', async () => {
    await runCliCommand(['repo', 'clone', domain, ...repoFlags], { cwd: tempDir })
    const repoDir = path.join(tempDir, domain)

    nodeFs.writeFileSync(path.join(repoDir, 'about', 'index.md'), '# About local\n')

    const output = await runCliCommand([
      'repo',
      'status',
      '--rpc', 'http://127.0.0.1:1',
      '--universal-resolver', UNIVERSAL_RESOLVER,
    ], { cwd: repoDir })

    expect(output.code).toBe(0)
    expect(output.stderr).toBe('')
    expect(output.stdout).toMatch(/Upstream root: unavailable/)
    expect(output.stdout).toMatch(/Upstream changes: unknown \(upstream might be out of date\)/)
    expect(output.stdout).toMatch(/Local markdown changes:/)
    expect(output.stdout).toMatch(/M about\/index\.md/)
  })

  it('repo pull applies upstream changes, preserves conflicts, and keeps old blocks in the CAR file', async () => {
    await runCliCommand(['repo', 'clone', domain, ...repoFlags], { cwd: tempDir })
    const repoDir = path.join(tempDir, domain)

    nodeFs.writeFileSync(path.join(repoDir, 'about', 'index.md'), '# About local\n')
    currentCid = versionB.cid

    const output = await runCliCommand(['repo', 'pull', ...repoFlags], { cwd: repoDir })

    expect(output.code).toBe(0)
    expect(output.stderr).toBe('')
    expect(output.stdout).toMatch(`Updated tracked root from ${versionA.cid.toString()} to ${versionB.cid.toString()}`)
    expect(output.stdout).toMatch(/Applied 3 upstream markdown changes/)
    expect(output.stdout).toMatch(/Conflicts left as local changes:/)
    expect(output.stdout).toMatch(/M about\/index\.md/)

    expect(nodeFs.readFileSync(path.join(repoDir, 'index.md'), 'utf8')).toBe('# Home v2\n')
    expect(nodeFs.readFileSync(path.join(repoDir, 'about', 'index.md'), 'utf8')).toBe('# About local\n')
    expect(nodeFs.readFileSync(path.join(repoDir, 'docs', 'api', 'index.md'), 'utf8')).toBe('# API v2\n')
    expect(nodeFs.existsSync(path.join(repoDir, 'docs', 'guides', 'index.md'))).toBe(false)

    const carBytes = nodeFs.readFileSync(path.join(repoDir, '.simplepage.car'))
    const car = carFromBytes(carBytes)
    expect(car.roots).toHaveLength(1)
    expect(car.roots[0].toString()).toBe(versionB.cid.toString())

    const { fs, blockstore } = emptyUnixfs()
    for (const block of car.blocks) {
      await blockstore.put(block.cid, block.payload)
    }

    await expect(cat(fs, versionA.cid, 'index.md')).resolves.toBe('# Home v1\n')
    await expect(cat(fs, versionB.cid, 'index.md')).resolves.toBe('# Home v2\n')
  })
})
