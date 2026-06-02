import { generateKeyPairSync, sign as signBytes } from 'node:crypto'

import { privateKeyToAccount } from 'viem/accounts'

import { emptyCar, emptyUnixfs } from '../src/ipld.js'
import {
  REF_ENVELOPE_KIND,
  REF_PAYLOAD_KIND,
  REF_SCHEMA_VERSION,
  buildCapabilitySiweMessage,
  didKeyFromEd25519PublicKey,
  encodeRefPayload,
  parseRefCar,
  verifyCapability,
  verifyRefRecord,
} from '../src/refs.js'

const OWNER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ED25519_SPKI_PREFIX_LENGTH = 12

const getDidKey = (publicKey) => {
  const exported = publicKey.export({ format: 'der', type: 'spki' })
  return didKeyFromEd25519PublicKey(exported.subarray(ED25519_SPKI_PREFIX_LENGTH))
}

describe('refs', () => {
  it('parses and verifies a signed ref CAR', async () => {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('hello refs'))
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const didKey = getDidKey(publicKey)
    const sequence = 1711923456789
    const issuedAt = '2027-03-31T12:00:00.000Z'
    const agentName = 'draft-writer'
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: owner.address,
      didKey,
      domain: 'example.eth',
      agentName,
      chainId: 1,
      nonce: `${sequence}`,
      issuedAt,
      expirationTime: '2027-03-31T13:00:00.000Z',
    })
    const siweSignature = await owner.signMessage({ message: siweMessage })

    const payload = {
      kind: REF_PAYLOAD_KIND,
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
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
    const payloadCid = car.put(payload)
    car.put({
      kind: REF_ENVELOPE_KIND,
      schemaVersion: REF_SCHEMA_VERSION,
      ref: payloadCid,
      signature,
    }, { isRoot: true })

    const { record } = await parseRefCar(car.bytes)
    const verified = await verifyRefRecord(record, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: owner.address,
    })

    expect(verified.domain).toBe('example.eth')
    expect(verified.refId).toBe('draft')
    expect(verified.sequence).toBe(sequence)
    expect(verified.contentCid).toBe(contentCid.toString())
    expect(verified.ownerAddress).toBe(owner.address)
    expect(verified.issuedAt).toBe(issuedAt)
    expect(verified.agentName).toBe(agentName)
  })

  it('rejects a ref when the expected owner does not match the SIWE signer', async () => {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('hello refs'))
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const didKey = getDidKey(publicKey)
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: owner.address,
      didKey,
      domain: 'example.eth',
      chainId: 1,
      nonce: '42',
      issuedAt: '2027-03-31T12:00:00.000Z',
      expirationTime: '2027-03-31T13:00:00.000Z',
    })
    const siweSignature = await owner.signMessage({ message: siweMessage })
    const signature = `0x${signBytes(null, Buffer.from(encodeRefPayload({
      domain: 'example.eth',
      refId: 'draft',
      sequence: 42,
      didKey,
      contentCid: contentCid.toString(),
      siweMessage,
      siweSignature,
      signature: '0x00',
    })), privateKey).toString('hex')}`

    await expect(verifyRefRecord({
      domain: 'example.eth',
      refId: 'draft',
      sequence: 42,
      didKey,
      contentCid: contentCid.toString(),
      siweMessage,
      siweSignature,
      signature,
    }, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: '0x0000000000000000000000000000000000000001',
    })).rejects.toThrow('SIWE signer is not the ENS owner')
  })

  it('verifies a capability payload with expiry', async () => {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const { publicKey } = generateKeyPairSync('ed25519')
    const didKey = getDidKey(publicKey)
    const agentName = 'editor-bot'
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: owner.address,
      didKey,
      domain: 'example.eth',
      agentName,
      chainId: 1,
      nonce: '7',
      issuedAt: '2026-03-31T12:00:00.000Z',
      expirationTime: '2026-03-31T13:00:00.000Z',
    })
    const siweSignature = await owner.signMessage({ message: siweMessage })

    const verified = await verifyCapability({
      domain: 'example.eth',
      didKey,
      siweMessage,
      siweSignature,
    }, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: owner.address,
      expectedAgentName: agentName,
      now: Date.parse('2026-03-31T12:30:00.000Z'),
    })

    expect(verified.ownerAddress).toBe(owner.address)
    expect(verified.expiresAt).toBe('2026-03-31T13:00:00.000Z')
    expect(verified.nonce).toBe('7')
    expect(verified.agentName).toBe(agentName)
  })

  it('rejects a capability without an expiry', async () => {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const { publicKey } = generateKeyPairSync('ed25519')
    const didKey = getDidKey(publicKey)
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: owner.address,
      didKey,
      domain: 'example.eth',
      chainId: 1,
      nonce: '7',
      issuedAt: '2026-03-31T12:00:00.000Z',
    })
    const siweSignature = await owner.signMessage({ message: siweMessage })

    await expect(verifyCapability({
      domain: 'example.eth',
      didKey,
      siweMessage,
      siweSignature,
    }, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: owner.address,
      now: Date.parse('2026-03-31T12:30:00.000Z'),
    })).rejects.toThrow('SIWE capability must include an expiration time')
  })

  it('allows expired capabilities within an explicit grace period', async () => {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const { publicKey } = generateKeyPairSync('ed25519')
    const didKey = getDidKey(publicKey)
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: owner.address,
      didKey,
      domain: 'example.eth',
      chainId: 1,
      nonce: '7',
      issuedAt: '2026-03-31T12:00:00.000Z',
      expirationTime: '2026-03-31T13:00:00.000Z',
    })
    const siweSignature = await owner.signMessage({ message: siweMessage })

    await expect(verifyCapability({
      domain: 'example.eth',
      didKey,
      siweMessage,
      siweSignature,
    }, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: owner.address,
      now: Date.parse('2026-03-31T14:00:00.000Z'),
      allowedExpiredMs: 2 * 60 * 60 * 1000,
    })).resolves.toMatchObject({
      domain: 'example.eth',
      expiresAt: '2026-03-31T13:00:00.000Z',
    })

    await expect(verifyCapability({
      domain: 'example.eth',
      didKey,
      siweMessage,
      siweSignature,
    }, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: owner.address,
      now: Date.parse('2026-03-31T16:00:00.000Z'),
      allowedExpiredMs: 2 * 60 * 60 * 1000,
    })).rejects.toThrow('SIWE capability has expired')
  })

  it('rejects a capability when the signed agent does not match the requested agent', async () => {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY)
    const { publicKey } = generateKeyPairSync('ed25519')
    const didKey = getDidKey(publicKey)
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: owner.address,
      didKey,
      domain: 'example.eth',
      agentName: 'writer-a',
      chainId: 1,
      nonce: '8',
      issuedAt: '2026-03-31T12:00:00.000Z',
      expirationTime: '2026-03-31T13:00:00.000Z',
    })
    const siweSignature = await owner.signMessage({ message: siweMessage })

    await expect(verifyCapability({
      domain: 'example.eth',
      didKey,
      siweMessage,
      siweSignature,
    }, {
      expectedDomain: 'example.eth',
      expectedChainId: 1,
      expectedOwnerAddress: owner.address,
      expectedAgentName: 'writer-b',
      now: Date.parse('2026-03-31T12:30:00.000Z'),
    })).rejects.toThrow('SIWE agent does not match request agent')
  })

  it('rejects reserved ref ids', async () => {
    await expect(async () => encodeRefPayload({
      domain: 'example.eth',
      refId: '_ocaps',
      sequence: 1,
      didKey: 'did:key:z6Mktest',
      contentCid: 'bafybeigdyrzt5sfp7udm7hu76x7zqfykhdmododwmzdhgx7qg5ee5jd3su',
      siweMessage: 'siwe',
      siweSignature: '0x1234',
    })).rejects.toThrow('Ref id _ocaps is reserved')

  })
})
