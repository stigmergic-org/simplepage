import { generateKeyPairSync, sign as signBytes } from 'node:crypto'

import all from 'it-all'
import { jest } from '@jest/globals'
import { privateKeyToAccount } from 'viem/accounts'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'

import {
  buildCapabilitySiweMessage,
  didKeyFromEd25519PublicKey,
  emptyCar,
  emptyUnixfs,
  encodeRefPayload,
  REF_ENVELOPE_KIND,
  REF_PAYLOAD_KIND,
  REF_SCHEMA_VERSION,
  walkDag,
} from '@simplepg/common'
import { TestEnvironmentMultiNode } from '@simplepg/test-utils'

const { Blob, FormData, fetch } = globalThis

const YEAR_SECONDS = 365 * 24 * 60 * 60
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000001'
const ED25519_SPKI_PREFIX_LENGTH = 12

const getDidKey = (publicKey) => {
  const exported = publicKey.export({ format: 'der', type: 'spki' })
  return didKeyFromEd25519PublicKey(exported.subarray(ED25519_SPKI_PREFIX_LENGTH))
}

const encode = (value) => new TextEncoder().encode(value)

const mfsPathExists = async (kuboApi, filePath) => {
  try {
    await kuboApi.files.stat(filePath)
    return true
  } catch (_error) {
    return false
  }
}

const readMfsJson = async (kuboApi, filePath) => {
  const chunks = await all(await kuboApi.files.read(filePath))
  return JSON.parse(uint8ArrayToString(Buffer.concat(chunks)))
}

const readMfsText = async (kuboApi, filePath) => {
  const chunks = await all(await kuboApi.files.read(filePath))
  return uint8ArrayToString(Buffer.concat(chunks))
}

const waitFor = async (predicate, {
  timeoutMs = 60_000,
  intervalMs = 500,
  message = 'Timed out waiting for condition',
} = {}) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await predicate()
    if (result) {
      return result
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error(message)
}

const postCapability = async ({
  dserviceUrl,
  domain,
  ownerPrivateKey,
  didKey,
  agentName,
  chainId,
}) => {
  const owner = privateKeyToAccount(ownerPrivateKey)
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const siweMessage = buildCapabilitySiweMessage({
    ownerAddress: owner.address,
    didKey,
    domain,
    agentName,
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
      agentName,
      siweMessage,
      siweSignature,
    })
  })

  if (!response.ok) {
    throw new Error(`Capability POST failed: ${await response.text()}`)
  }

  return response.json()
}

const createRefCar = async ({
  domain,
  refId,
  sequence,
  content,
  ownerPrivateKey,
  chainId,
  agentName,
  agentKeyPair = generateKeyPairSync('ed25519'),
}) => {
  const owner = privateKeyToAccount(ownerPrivateKey)
  const { fs, blockstore } = emptyUnixfs()
  const contentCid = await fs.addBytes(encode(content))
  const blocks = await walkDag(blockstore, contentCid)
  const { publicKey, privateKey } = agentKeyPair
  const didKey = getDidKey(publicKey)
  const siweMessage = buildCapabilitySiweMessage({
    ownerAddress: owner.address,
    didKey,
    domain,
    agentName,
    chainId,
    nonce: String(sequence),
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })
  const siweSignature = await owner.signMessage({ message: siweMessage })

  const payload = {
    kind: REF_PAYLOAD_KIND,
    schemaVersion: REF_SCHEMA_VERSION,
    domain,
    refId,
    sequence,
    didKey,
    contentCid,
    siweMessage,
    siweSignature,
  }
  const signature = `0x${signBytes(null, Buffer.from(encodeRefPayload({
    ...payload,
    contentCid: contentCid.toString(),
  })), privateKey).toString('hex')}`

  const car = emptyCar()
  for (const block of blocks) {
    car.blocks.put(block)
  }
  const payloadCid = car.put(payload)
  const envelopeCid = car.put({
    kind: REF_ENVELOPE_KIND,
    schemaVersion: REF_SCHEMA_VERSION,
    ref: payloadCid,
    signature,
  }, { isRoot: true })

  return {
    bytes: car.bytes,
    contentCid: contentCid.toString(),
    envelopeCid: envelopeCid.toString(),
  }
}

const postRefCar = async ({ dserviceUrl, domain, bytes }) => {
  const formData = new FormData()
  formData.append('file', new Blob([bytes], { type: 'application/vnd.ipld.car' }), 'ref.car')

  const response = await fetch(`${dserviceUrl}/refs/${encodeURIComponent(domain)}`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Ref POST failed: ${await response.text()}`)
  }

  return response.json()
}

const seedSubscriptionOnNodes = async (nodes, domain) => {
  const expiresAt = Math.floor(Date.now() / 1000) + YEAR_SECONDS
  await Promise.all(nodes.map(async (node) => {
    await node.dservice.ipfs.subscriptionIndex.writeSubscription(domain, [expiresAt])
    const status = await node.dservice.ipfs.subscriptionIndex.getStatus(domain)
    if (status.status !== 'active') {
      throw new Error(`Expected active subscription for ${domain}, got ${status.status}`)
    }
  }))
}

jest.setTimeout(180000)

describe('Multi-node ref and capability sync', () => {
  let testEnv

  beforeAll(async () => {
    testEnv = new TestEnvironmentMultiNode()
    await testEnv.start({ nodeCount: 2 })
  })

  afterAll(async () => {
    await testEnv.stop()
  })

  it('syncs persisted _ocaps capabilities between nodes over the shared refs root', async () => {
    const [nodeA, nodeB] = testEnv.nodes
    const domain = 'sync-capabilities.eth'
    const agentName = 'capability-sync-agent'
    const owner = privateKeyToAccount(testEnv.evm.secretKey)
    const didKey = getDidKey(generateKeyPairSync('ed25519').publicKey)
    const chainId = Number(testEnv.evm.chainId)

    testEnv.evm.mintPage(domain, YEAR_SECONDS, ZERO_ADDRESS)
    testEnv.evm.setResolver(testEnv.addresses.universalResolver, domain, testEnv.addresses.resolver1)
    await seedSubscriptionOnNodes([nodeA, nodeB], domain)

    const { capability } = await postCapability({
      dserviceUrl: nodeA.dserviceUrl,
      domain,
      ownerPrivateKey: testEnv.evm.secretKey,
      didKey,
      agentName,
      chainId,
    })

    expect(capability.didKey).toBe(didKey)
    expect(capability.agentName).toBe(agentName)
    expect(capability.ownerAddress).toBe(owner.address)

    const capabilityPath = `/spg-data/${testEnv.evm.chainId}/refs/${domain}/_ocaps/${encodeURIComponent(didKey)}.json`
    expect(await mfsPathExists(nodeA.kuboApi, capabilityPath)).toBe(true)

    const testPeerId = await nodeA.kuboApi.id().then(id => id.id.toString())
    await nodeB.dservice.ipfs.syncRefsFromPeers([testPeerId])

    const syncedCapability = await waitFor(async () => {
      const response = await fetch(`${nodeB.dserviceUrl}/capabilities/${encodeURIComponent(domain)}`)
      if (!response.ok) {
        return null
      }

      const payload = await response.json()
      return payload.capabilities?.find(entry => entry.didKey === didKey) || null
    }, {
      message: `Timed out waiting for capability ${didKey} on node B`,
    })

    expect(syncedCapability.agentName).toBe(agentName)
    expect(syncedCapability.ownerAddress).toBe(owner.address)

    expect(await mfsPathExists(nodeB.kuboApi, capabilityPath)).toBe(true)

    const persistedCapability = await readMfsJson(nodeB.kuboApi, capabilityPath)
    expect(persistedCapability).toEqual({
      siweMessage: capability.siweMessage,
      siweSignature: capability.siweSignature,
    })
  })

  it('syncs signed refs and their content between nodes', async () => {
    const [nodeA, nodeB] = testEnv.nodes
    const domain = 'sync-refs.eth'
    const refId = 'draft'
    const sequence = Date.now()
    const agentName = 'ref-sync-agent'

    testEnv.evm.mintPage(domain, YEAR_SECONDS, ZERO_ADDRESS)
    testEnv.evm.setResolver(testEnv.addresses.universalResolver, domain, testEnv.addresses.resolver1)
    await seedSubscriptionOnNodes([nodeA, nodeB], domain)

    const refCar = await createRefCar({
      domain,
      refId,
      sequence,
      content: '<html><body>multinode ref sync</body></html>',
      ownerPrivateKey: testEnv.evm.secretKey,
      chainId: Number(testEnv.evm.chainId),
      agentName,
    })

    const { ref } = await postRefCar({
      dserviceUrl: nodeA.dserviceUrl,
      domain,
      bytes: refCar.bytes,
    })

    expect(ref.refId).toBe(refId)
    expect(ref.contentCid).toBe(refCar.contentCid)
    expect(ref.agentName).toBe(agentName)

    const testPeerId = await nodeA.kuboApi.id().then(id => id.id.toString())
    await nodeB.dservice.ipfs.syncRefsFromPeers([testPeerId])

    const syncedRef = await waitFor(async () => {
      const response = await fetch(`${nodeB.dserviceUrl}/refs/${encodeURIComponent(domain)}`)
      if (!response.ok) {
        return null
      }

      const payload = await response.json()
      return payload.refs?.find(entry => entry.refId === refId && entry.sequence === sequence) || null
    }, {
      message: `Timed out waiting for ref ${refId}@${sequence} on node B`,
    })

    expect(syncedRef.contentCid).toBe(refCar.contentCid)
    expect(syncedRef.latest).toBe(true)
    expect(syncedRef.agentName).toBe(agentName)

    const refPath = `/spg-data/${testEnv.evm.chainId}/refs/${domain}/${encodeURIComponent(refId)}/${sequence}`
    expect(await mfsPathExists(nodeB.kuboApi, refPath)).toBe(true)

    const persistedRef = await readMfsText(nodeB.kuboApi, refPath)
    expect(persistedRef).toBe(refCar.envelopeCid)

    await nodeB.waitUntilCidIsServed(refCar.contentCid, { timeoutMs: 90_000 })
    const pageResponse = await fetch(`${nodeB.dserviceUrl}/page?cid=${encodeURIComponent(refCar.contentCid)}`)
    expect(pageResponse.ok).toBe(true)
    await expect(pageResponse.text()).resolves.toContain('multinode ref sync')
  })

  it('does not sync same-agent refs with the same or lower sequence over newer local refs', async () => {
    const [nodeA, nodeB] = testEnv.nodes
    const domain = 'sync-ref-sequence.eth'
    const refId = 'draft'
    const higherSequence = Date.now()
    const lowerSequence = higherSequence - 1
    const agentName = 'sequence-sync-agent'
    const agentKeyPair = generateKeyPairSync('ed25519')

    testEnv.evm.mintPage(domain, YEAR_SECONDS, ZERO_ADDRESS)
    testEnv.evm.setResolver(testEnv.addresses.universalResolver, domain, testEnv.addresses.resolver1)
    await seedSubscriptionOnNodes([nodeA, nodeB], domain)

    const higherRefCar = await createRefCar({
      domain,
      refId,
      sequence: higherSequence,
      content: '<html><body>higher local ref</body></html>',
      ownerPrivateKey: testEnv.evm.secretKey,
      chainId: Number(testEnv.evm.chainId),
      agentName,
      agentKeyPair,
    })
    const lowerRefCar = await createRefCar({
      domain,
      refId,
      sequence: lowerSequence,
      content: '<html><body>lower remote ref</body></html>',
      ownerPrivateKey: testEnv.evm.secretKey,
      chainId: Number(testEnv.evm.chainId),
      agentName,
      agentKeyPair,
    })
    const equalRefCar = await createRefCar({
      domain,
      refId,
      sequence: higherSequence,
      content: '<html><body>equal remote ref</body></html>',
      ownerPrivateKey: testEnv.evm.secretKey,
      chainId: Number(testEnv.evm.chainId),
      agentName,
      agentKeyPair,
    })

    await postRefCar({
      dserviceUrl: nodeB.dserviceUrl,
      domain,
      bytes: higherRefCar.bytes,
    })
    await postRefCar({
      dserviceUrl: nodeA.dserviceUrl,
      domain,
      bytes: lowerRefCar.bytes,
    })
    await postRefCar({
      dserviceUrl: nodeA.dserviceUrl,
      domain,
      bytes: equalRefCar.bytes,
    })

    const peerId = await nodeA.kuboApi.id().then(id => id.id.toString())
    await nodeB.dservice.ipfs.syncRefsFromPeers([peerId])

    const response = await fetch(`${nodeB.dserviceUrl}/refs/${encodeURIComponent(domain)}`)
    expect(response.ok).toBe(true)
    const payload = await response.json()
    const refs = payload.refs?.filter(entry => entry.refId === refId) || []

    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({
      sequence: higherSequence,
      contentCid: higherRefCar.contentCid,
      latest: true,
      agentName,
    })

    const higherRefPath = `/spg-data/${testEnv.evm.chainId}/refs/${domain}/${encodeURIComponent(refId)}/${higherSequence}`
    const lowerRefPath = `/spg-data/${testEnv.evm.chainId}/refs/${domain}/${encodeURIComponent(refId)}/${lowerSequence}`
    expect(await readMfsText(nodeB.kuboApi, higherRefPath)).toBe(higherRefCar.envelopeCid)
    expect(await mfsPathExists(nodeB.kuboApi, lowerRefPath)).toBe(false)
  })
})
