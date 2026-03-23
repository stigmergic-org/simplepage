import { jest } from '@jest/globals'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { globSource } from '@helia/unixfs'
import all from 'it-all'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { JSDOM } from 'jsdom'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MockStorage, TestEnvironmentMultiNode } from '@simplepg/test-utils'

import { Repo } from '../src/repo.js'

const dom = new JSDOM()
global.DOMParser = dom.window.DOMParser

const YEAR_SECONDS = 365 * 24 * 60 * 60
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000001'
const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url))

const encode = (value) => new TextEncoder().encode(value)
const decode = (value) => new TextDecoder().decode(value)

const resetIDB = () => {
  global.indexedDB = new IDBFactory()
}

const loadFixtures = async (kuboApi, fixtureFolder) => {
  const fixturePath = join(FIXTURES_DIR, fixtureFolder)
  const glob = globSource(fixturePath, '**/*')
  const entries = await all(glob)
  const result = await all(await kuboApi.addAll(entries, { wrapWithDirectory: true }))
  return result[result.length - 1].cid.toV1()
}

const commitAndFinalize = async ({ repo, domain, walletClient, client }) => {
  const result = await repo.stage(domain, false)
  const hash = await walletClient.writeContract(result.prepTx)
  const receipt = await client.waitForTransactionReceipt({ hash })
  await repo.finalizeCommit(result.cid)
  return { cid: result.cid, receipt }
}

jest.setTimeout(180000)

describe('Repo Multi-node Integration Tests', () => {
  let testEnv
  let addresses
  let client
  let walletClient
  let templateCid
  let baseSiteCid
  const openRepos = []

  const createRepo = async ({ domain, apiEndpoint }) => {
    const storage = new MockStorage()
    const repo = new Repo(domain, storage, apiEndpoint ? { apiEndpoint } : {})
    await repo.init(client, {
      chainId: parseInt(testEnv.evm.chainId),
      universalResolver: addresses.universalResolver,
    })
    openRepos.push(repo)
    return repo
  }

  const waitForAllNodes = async (blockNumber = null) => {
    const target = blockNumber ?? Number(testEnv.evm.getBlockNumber())
    await testEnv.waitUntilBlockIsIndexed(target, { timeoutMs: 90_000 })
  }

  const setupDomain = async (domain) => {
    testEnv.evm.mintPage(domain, YEAR_SECONDS, ZERO_ADDRESS)
    testEnv.evm.setResolver(addresses.universalResolver, domain, addresses.resolver1)
    testEnv.evm.setContenthash(addresses.resolver1, domain, baseSiteCid.toString())
    await waitForAllNodes()
    await testEnv.waitUntilCidIsServedByAll(baseSiteCid, { timeoutMs: 90_000 })
  }

  beforeAll(async () => {
    testEnv = new TestEnvironmentMultiNode()
    await testEnv.start({ nodeCount: 2 })

    addresses = testEnv.addresses
    templateCid = await loadFixtures(testEnv.nodes[0].kuboApi, 'new.simplepage.eth')
    baseSiteCid = await loadFixtures(testEnv.nodes[0].kuboApi, 'test.eth')

    testEnv.evm.mintPage('new.simplepage.eth', YEAR_SECONDS, ZERO_ADDRESS)
    testEnv.setTemplateDserviceEndpoints()
    testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString())

    await waitForAllNodes()
    await testEnv.waitUntilCidIsServedByAll(templateCid, { timeoutMs: 90_000 })
    await testEnv.waitUntilCidIsServedByAll(baseSiteCid, { timeoutMs: 90_000 })

    client = createPublicClient({
      transport: http(testEnv.evm.url)
    })

    walletClient = createWalletClient({
      transport: http(testEnv.evm.url),
      account: privateKeyToAccount(testEnv.evm.secretKey)
    })
  })

  afterEach(async () => {
    while (openRepos.length > 0) {
      const repo = openRepos.pop()
      await repo.close()
    }
    resetIDB()
  })

  afterAll(async () => {
    await testEnv.stop()
  })

  it('syncs committed pages between node endpoints', async () => {
    const domain = 'sync-pages.eth'
    await setupDomain(domain)

    const repoA = await createRepo({ domain, apiEndpoint: testEnv.nodes[0].dserviceUrl })
    await repoA.setPageEdit('/', '# Node A Home', '<h1>Node A Home</h1>')
    await repoA.setPageEdit('/docs/', '# Distributed Docs', '<h1>Distributed Docs</h1>')

    const { cid, receipt } = await commitAndFinalize({ repo: repoA, domain, walletClient, client })
    await waitForAllNodes(Number(receipt.blockNumber))
    await testEnv.nodes[1].waitUntilCidIsServed(cid, { timeoutMs: 90_000 })

    const repoB = await createRepo({ domain, apiEndpoint: testEnv.nodes[1].dserviceUrl })
    expect(await repoB.getMarkdown('/')).toBe('# Node A Home')
    expect(await repoB.getMarkdown('/docs/')).toBe('# Distributed Docs')

    const pages = await repoB.getAllPages()
    expect(pages).toContain('/')
    expect(pages).toContain('/docs/')
  })

  it('syncs files and settings with reverse updates across nodes', async () => {
    const domain = 'sync-files.eth'
    await setupDomain(domain)

    const repoA = await createRepo({ domain, apiEndpoint: testEnv.nodes[0].dserviceUrl })
    await repoA.files.add('/assets/welcome.txt', encode('hello-from-node-a'))
    await repoA.files.add('/assets/remove-me.txt', encode('delete-this'))
    await repoA.settings.write({ theme: 'light', source: 'node-a' })
    await repoA.setPageEdit('/to-delete/', '# Delete me', '<h1>Delete me</h1>')

    const firstCommit = await commitAndFinalize({ repo: repoA, domain, walletClient, client })
    await waitForAllNodes(Number(firstCommit.receipt.blockNumber))
    await testEnv.nodes[1].waitUntilCidIsServed(firstCommit.cid, { timeoutMs: 90_000 })

    const repoB = await createRepo({ domain, apiEndpoint: testEnv.nodes[1].dserviceUrl })
    expect(decode(await repoB.files.cat('/assets/welcome.txt'))).toBe('hello-from-node-a')
    expect(await repoB.settings.readProperty('source')).toBe('node-a')

    await repoB.files.add('/assets/welcome.txt', encode('updated-from-node-b'))
    await repoB.files.rm('/assets/remove-me.txt')
    await repoB.settings.writeProperty('source', 'node-b')
    await repoB.deletePage('/to-delete/')

    const secondCommit = await commitAndFinalize({ repo: repoB, domain, walletClient, client })
    await waitForAllNodes(Number(secondCommit.receipt.blockNumber))
    await testEnv.nodes[0].waitUntilCidIsServed(secondCommit.cid, { timeoutMs: 90_000 })

    const repoAReadBack = await createRepo({ domain, apiEndpoint: testEnv.nodes[0].dserviceUrl })
    expect(decode(await repoAReadBack.files.cat('/assets/welcome.txt'))).toBe('updated-from-node-b')
    await expect(repoAReadBack.files.cat('/assets/remove-me.txt')).rejects.toThrow()
    await expect(repoAReadBack.getMarkdown('/to-delete/')).rejects.toThrow()
    expect(await repoAReadBack.settings.readProperty('source')).toBe('node-b')
  })

  it('uses new.simplepage.eth text record to discover dservice endpoints', async () => {
    const domain = 'txt-record-sync.eth'
    await setupDomain(domain)

    const repoViaTxtRecord = await createRepo({ domain })
    expect(repoViaTxtRecord.dservice.dserviceEndpoints).toHaveLength(2)
    expect(repoViaTxtRecord.dservice.dserviceEndpoints).toEqual(
      expect.arrayContaining(testEnv.dserviceUrls)
    )

    await repoViaTxtRecord.setPageEdit('/from-txt/', '# TXT Record Sync', '<h1>TXT Record Sync</h1>')
    const { cid, receipt } = await commitAndFinalize({
      repo: repoViaTxtRecord,
      domain,
      walletClient,
      client,
    })

    await waitForAllNodes(Number(receipt.blockNumber))
    await testEnv.waitUntilCidIsServedByAll(cid, { timeoutMs: 90_000 })

    const repoFromA = await createRepo({ domain, apiEndpoint: testEnv.nodes[0].dserviceUrl })
    const repoFromB = await createRepo({ domain, apiEndpoint: testEnv.nodes[1].dserviceUrl })
    expect(await repoFromA.getMarkdown('/from-txt/')).toBe('# TXT Record Sync')
    expect(await repoFromB.getMarkdown('/from-txt/')).toBe('# TXT Record Sync')
  })

  it('syncs full history to a node that joins after earlier publishes', async () => {
    const domain = 'late-history.eth'
    await setupDomain(domain)

    const repoA = await createRepo({ domain, apiEndpoint: testEnv.nodes[0].dserviceUrl })

    await repoA.setPageEdit('/chapter-one/', '# Chapter One', '<h1>Chapter One</h1>')
    const first = await commitAndFinalize({ repo: repoA, domain, walletClient, client })
    await waitForAllNodes(Number(first.receipt.blockNumber))

    await repoA.setPageEdit('/chapter-two/', '# Chapter Two', '<h1>Chapter Two</h1>')
    await repoA.setPageEdit('/', '# Updated Home', '<h1>Updated Home</h1>')
    const second = await commitAndFinalize({ repo: repoA, domain, walletClient, client })
    await waitForAllNodes(Number(second.receipt.blockNumber))

    const lateNode = await testEnv.startNode()
    await lateNode.waitUntilBlockIsIndexed(Number(second.receipt.blockNumber), { timeoutMs: 120_000 })
    await lateNode.waitUntilCidIsServed(first.cid, { timeoutMs: 120_000 })
    await lateNode.waitUntilCidIsServed(second.cid, { timeoutMs: 120_000 })

    const lateRepo = await createRepo({ domain, apiEndpoint: lateNode.dserviceUrl })
    const history = await lateRepo.history.get()
    const historyCids = history.map(entry => entry.cid.toString())

    expect(historyCids).toContain(first.cid.toString())
    expect(historyCids).toContain(second.cid.toString())
    expect(await lateRepo.getMarkdown('/chapter-one/')).toBe('# Chapter One')
    expect(await lateRepo.getMarkdown('/chapter-two/')).toBe('# Chapter Two')

    const oldCidResponse = await fetch(`${lateNode.dserviceUrl}/page?cid=${encodeURIComponent(first.cid.toString())}`)
    expect(oldCidResponse.ok).toBe(true)
  })
})
