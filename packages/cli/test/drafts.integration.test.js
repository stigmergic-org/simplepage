import { spawn } from 'child_process'
import { jest } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

import { privateKeyToAccount } from 'viem/accounts'

import { buildCapabilitySiweMessage, emptyCar } from '@simplepg/common'
import { TestEnvironmentNode } from '@simplepg/test-utils'

import { buildContentDag } from '../commands/utils/contentCar.js'
import { runCliCommand } from './runCliCommand.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_PATH = path.resolve(__dirname, '../bin/simplepage.js')
const YEAR_SECONDS = 365 * 24 * 60 * 60

jest.setTimeout(60000)

const getUrlParams = (url) => new URLSearchParams(url.search || url.hash.replace(/^#/, ''))

const postCapability = async ({ agentsUrl, ownerPrivateKey, fallbackDserviceUrl, fallbackChainId }) => {
  const params = getUrlParams(agentsUrl)
  const domain = params.get('domain')
  const didKey = params.get('key')
  const agentName = params.get('agent')
  const chainId = Number(params.get('chainId') || fallbackChainId || 1)
  const dserviceUrl = params.get('dservice') || fallbackDserviceUrl

  const owner = privateKeyToAccount(ownerPrivateKey)
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const siweMessage = buildCapabilitySiweMessage({
    ownerAddress: owner.address,
    didKey,
    domain,
    agentName: agentName || undefined,
    chainId,
    nonce: `${Date.now()}`,
    issuedAt,
    expirationTime: expiresAt,
  })
  const siweSignature = await owner.signMessage({ message: siweMessage })

  const response = await fetch(`${dserviceUrl}/capabilities/${encodeURIComponent(domain)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key: didKey,
      didKey,
      agentName: agentName || undefined,
      siweMessage,
      siweSignature,
    })
  })

  if (!response.ok) {
    throw new Error(`Capability POST failed: ${await response.text()}`)
  }
}

const runCliWithAuth = async ({ args, cwd, ownerPrivateKey, dserviceUrl, chainId }) => {
  return new Promise((resolve, reject) => {
    const cli = spawn('node', [
      '--no-warnings',
      CLI_PATH,
      ...args,
    ], { cwd })

    let stdout = ''
    let stderr = ''
    let authorizationUrl = null
    let authorizationPromise = null
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const fail = (error) => {
      if (settled) return
      settled = true
      try {
        cli.kill('SIGTERM')
      } catch (_error) {
        // ignore
      }
      reject(error)
    }

    const maybeAuthorize = async () => {
      if (authorizationUrl) return
      const authUrl = stdout
        .split(/\s+/)
        .find(token => token.startsWith('http://') || token.startsWith('https://'))
      const agentsUrl = authUrl && authUrl.includes('/spg-agents') ? authUrl : null
      if (!agentsUrl) return
      authorizationUrl = agentsUrl
      authorizationPromise = (async () => {
        await postCapability({
          agentsUrl: new URL(agentsUrl),
          ownerPrivateKey,
          fallbackDserviceUrl: dserviceUrl,
          fallbackChainId: chainId,
        })
      })()
      try {
        await authorizationPromise
      } catch (error) {
        fail(error)
      }
    }

    cli.stdout.on('data', (data) => {
      stdout += data.toString()
      void maybeAuthorize()
    })
    cli.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    cli.on('error', fail)
    cli.on('close', async (code) => {
      if (authorizationPromise) {
        try {
          await authorizationPromise
        } catch (error) {
          fail(error)
          return
        }
      }
      finish({ stdout, stderr, code, authorizationUrl })
    })
  })
}

const writeSimplePageSite = (siteDir, body = 'SimplePage site') => {
  fs.mkdirSync(siteDir, { recursive: true })
  fs.writeFileSync(path.join(siteDir, 'index.md'), `# ${body}\n`)
  fs.writeFileSync(path.join(siteDir, 'index.html'), `<html><body>${body}</body></html>`)
  fs.writeFileSync(path.join(siteDir, '_template.html'), '<html><body>{{content}}</body></html>')
  fs.writeFileSync(path.join(siteDir, '_redirects'), '')
}

const uploadSite = async ({ domain, siteDir, testEnv, resolver }) => {
  const { root, blocks } = await buildContentDag(siteDir)
  const car = emptyCar()
  car.roots.push(root)
  for (const block of blocks) {
    car.blocks.put(block)
  }

  const formData = new FormData()
  formData.append('file', new Blob([car.bytes], {
    type: 'application/vnd.ipld.car',
  }), 'site.car')

  const response = await fetch(`${testEnv.dserviceUrl}/page?domain=${encodeURIComponent(domain)}`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Site upload failed: ${await response.text()}`)
  }

  const { cid } = await response.json()
  testEnv.evm.setContenthash(resolver, domain, cid)
  return cid
}

describe('simplepage drafts CLI', () => {
  let testEnv
  let addresses
  let flags
  let tempDir

  beforeAll(async () => {
    testEnv = new TestEnvironmentNode()
    await testEnv.start()
    addresses = testEnv.addresses
    flags = [
      '--rpc', testEnv.evm.url,
      '--chain-id', testEnv.evm.chainId,
      '--universal-resolver', addresses.universalResolver,
      '--dservice', testEnv.dserviceUrl,
    ]
  })

  afterAll(async () => {
    await testEnv.stop()
  })

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'simplepage-drafts-'))
  })

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('creates raw signed draft revisions and lists them', async () => {
    const ensName = 'draft-ref.eth'
    const agentName = 'integration-agent'
    testEnv.evm.mintPage(ensName, YEAR_SECONDS, '0x0000000000000000000000000000000000000001')
    testEnv.evm.setResolver(addresses.universalResolver, ensName, addresses.resolver1)
    await testEnv.waitUntilBlockIsIndexed(testEnv.evm.getBlockNumber())

    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>draft v1</body></html>')

    const firstAuth = await runCliWithAuth({
      args: ['auth', ensName, '--name', agentName, ...flags],
      cwd: tempDir,
      ownerPrivateKey: testEnv.evm.secretKey,
      dserviceUrl: testEnv.dserviceUrl,
      chainId: testEnv.evm.chainId,
    })

    expect(firstAuth.code).toBe(0)
    expect(firstAuth.stderr).toBe('')
    expect(firstAuth.stdout).toMatch(/Authorize agent integration-agent for draft-ref\.eth:/)
    const authorizationUrl = new URL(firstAuth.authorizationUrl)
    expect(authorizationUrl.origin).toBe('https://new.simplepage.eth.link')
    expect(authorizationUrl.pathname).toBe('/spg-agents')
    expect(authorizationUrl.search).toBe('')
    const authorizationParams = getUrlParams(authorizationUrl)
    expect(authorizationParams.get('domain')).toBe(ensName)
    expect(authorizationParams.get('agent')).toBe(agentName)
    expect(authorizationParams.has('chainId')).toBe(false)
    expect(authorizationParams.has('rpc')).toBe(false)
    expect(authorizationParams.has('dservice')).toBe(false)
    expect(authorizationParams.has('universalResolver')).toBe(false)

    const firstPush = await runCliWithAuth({
      args: ['drafts', 'push-raw', ensName, 'draft', tempDir, ...flags],
      cwd: tempDir,
      ownerPrivateKey: testEnv.evm.secretKey,
      dserviceUrl: testEnv.dserviceUrl,
      chainId: testEnv.evm.chainId,
    })

    expect(firstPush.code).toBe(0)
    expect(firstPush.stderr).toBe('')
    expect(firstPush.stdout).toMatch(/Stored draft `draft` for draft-ref\.eth\./)
    expect(firstPush.stdout).toMatch(/Agent: integration-agent \(did:key:/)
    expect(firstPush.stdout).toMatch(/CID: ipfs:\/\//)
    expect(firstPush.stdout).toMatch(/Version: 1/)
    expect(fs.existsSync(path.join(tempDir, '.simplepage', 'identity.json'))).toBe(true)

    let response = await fetch(`${testEnv.dserviceUrl}/refs/${encodeURIComponent(ensName)}`)
    expect(response.ok).toBe(true)
    let payload = await response.json()
    expect(payload.refs).toHaveLength(1)
    expect(payload.refs[0].latest).toBe(true)
    expect(payload.refs[0].sequence).toBe(1)
    expect(payload.refs[0].agentName).toBe(agentName)

    const fileResponse = await fetch(`${testEnv.dserviceUrl}/file?cid=${encodeURIComponent(payload.refs[0].contentCid)}`)
    expect(fileResponse.ok).toBe(true)

    await new Promise(resolve => setTimeout(resolve, 10))
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>draft v2</body></html>')

    const secondPush = await runCliWithAuth({
      args: ['drafts', 'push-raw', ensName, 'draft', tempDir, ...flags],
      cwd: tempDir,
      ownerPrivateKey: testEnv.evm.secretKey,
      dserviceUrl: testEnv.dserviceUrl,
      chainId: testEnv.evm.chainId,
    })

    expect(secondPush.code).toBe(0)
    expect(secondPush.stderr).toBe('')
    expect(secondPush.stdout).not.toMatch(/Authorize agent integration-agent for draft-ref\.eth:/)
    expect(secondPush.stdout).toMatch(/Version: 2/)

    response = await fetch(`${testEnv.dserviceUrl}/refs/${encodeURIComponent(ensName)}`)
    expect(response.ok).toBe(true)
    payload = await response.json()
    expect(payload.refs).toHaveLength(2)
    expect(payload.refs[0].refId).toBe('draft')
    expect(payload.refs[0].latest).toBe(true)
    expect(payload.refs[1].latest).toBe(false)
    expect(payload.refs[0].sequence).toBeGreaterThan(payload.refs[1].sequence)
    expect(payload.refs[0].sequence).toBe(2)
    expect(payload.refs[1].sequence).toBe(1)
    expect(payload.refs[0].agentName).toBe(agentName)

    const listOutput = await runCliCommand([
      'drafts',
      'list',
      ensName,
      '--rpc', testEnv.evm.url,
      '--chain-id', testEnv.evm.chainId,
      '--universal-resolver', addresses.universalResolver,
      '--dservice', testEnv.dserviceUrl,
    ])

    expect(listOutput.code).toBe(0)
    expect(listOutput.stderr).toBe('')
    expect(listOutput.stdout).toMatch(/Drafts for draft-ref\.eth:/)
    expect(listOutput.stdout).toMatch(/draft v2 latest/)
    expect(listOutput.stdout).toMatch(/draft v1/)
  })

  it('uses the actual SimplePage site for draft auth and review URLs', async () => {
    const ensName = 'draft-site.eth'
    const agentName = 'site-agent'
    testEnv.evm.mintPage(ensName, YEAR_SECONDS, '0x0000000000000000000000000000000000000001')
    testEnv.evm.setResolver(addresses.universalResolver, ensName, addresses.resolver1)
    await testEnv.waitUntilBlockIsIndexed(testEnv.evm.getBlockNumber())

    writeSimplePageSite(tempDir, 'published site')
    await uploadSite({
      domain: ensName,
      siteDir: tempDir,
      testEnv,
      resolver: addresses.resolver1,
    })

    const authOutput = await runCliWithAuth({
      args: ['auth', ensName, '--name', agentName, ...flags],
      cwd: tempDir,
      ownerPrivateKey: testEnv.evm.secretKey,
      dserviceUrl: testEnv.dserviceUrl,
      chainId: testEnv.evm.chainId,
    })

    expect(authOutput.code).toBe(0)
    expect(authOutput.stderr).toBe('')
    const authorizationUrl = new URL(authOutput.authorizationUrl)
    expect(authorizationUrl.origin).toBe(`https://${ensName}.link`)
    expect(authorizationUrl.pathname).toBe('/spg-agents')

    const reviewOutput = await runCliCommand([
      'drafts',
      'review',
      ensName,
      '--rpc', testEnv.evm.url,
      '--chain-id', testEnv.evm.chainId,
      '--universal-resolver', addresses.universalResolver,
      '--dservice', testEnv.dserviceUrl,
    ])

    expect(reviewOutput.code).toBe(0)
    expect(reviewOutput.stderr).toBe('')
    expect(reviewOutput.stdout.trim()).toBe(`https://${ensName}.link/spg-drafts#domain=${ensName}`)

    const fallbackReviewOutput = await runCliCommand([
      'drafts',
      'review',
      ensName,
      '--fallback',
      '--rpc', testEnv.evm.url,
      '--chain-id', testEnv.evm.chainId,
      '--universal-resolver', addresses.universalResolver,
      '--dservice', testEnv.dserviceUrl,
    ])

    expect(fallbackReviewOutput.code).toBe(0)
    expect(fallbackReviewOutput.stderr).toBe('')
    expect(fallbackReviewOutput.stdout.trim()).toBe(`https://new.simplepage.eth.link/spg-drafts#domain=${ensName}`)

    const pushOutput = await runCliWithAuth({
      args: ['drafts', 'push-raw', ensName, 'site-draft', tempDir, ...flags],
      cwd: tempDir,
      ownerPrivateKey: testEnv.evm.secretKey,
      dserviceUrl: testEnv.dserviceUrl,
      chainId: testEnv.evm.chainId,
    })

    expect(pushOutput.code).toBe(0)
    expect(pushOutput.stderr).toBe('')
    expect(pushOutput.stdout).toMatch(/Stored draft `site-draft` for draft-site\.eth\./)
    expect(pushOutput.stdout).toMatch(/Version: 1/)
  })
})
