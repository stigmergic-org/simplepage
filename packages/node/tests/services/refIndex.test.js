import { jest } from '@jest/globals'
import * as dagCbor from '@ipld/dag-cbor'
import { encode as encodeBlock } from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'

import { REF_ENVELOPE_KIND, REF_OCAP_GRACE_MS, REF_PAYLOAD_KIND, REF_SCHEMA_VERSION, buildCapabilitySiweMessage, emptyUnixfs } from '@simplepg/common'

import { RefIndex } from '../../src/services/ipfs/refIndex.js'
import { RemoteHeadSync } from '../../src/services/ipfs/remoteHeadSync.js'

const makeAsyncIterable = (values) => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value
    }
  }
})

const createMockMfs = () => {
  const files = new Map()
  const refsDir = '/spg-data/test/refs'

  const listDir = async (path) => {
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path
    const children = new Set()
    for (const filePath of files.keys()) {
      if (!filePath.startsWith(`${normalizedPath}/`)) {
        continue
      }
      const nextPart = filePath.slice(normalizedPath.length + 1).split('/')[0]
      if (nextPart) {
        children.add(nextPart)
      }
    }
    return [...children].map(name => ({ name }))
  }

  return {
    files,
    refsDir,
    ensureRootDir: async () => {},
    getDomainRefsDir: async (domain) => `${refsDir}/${domain}`,
    ensureDir: async () => {},
    listDir,
    readFile: async (path) => files.get(path) || null,
    writeFile: async (path, content) => {
      files.set(path, content)
    },
    removePath: async (path) => {
      files.delete(path)
    },
  }
}

const createEnvelopeBlocks = async (record) => {
  const payloadBlock = await encodeBlock({
    codec: dagCbor,
    hasher: sha256,
    value: {
      kind: REF_PAYLOAD_KIND,
      schemaVersion: REF_SCHEMA_VERSION,
      domain: record.domain,
      refId: record.refId,
      sequence: record.sequence,
      contentCid: record.contentCid,
      didKey: record.didKey,
      siweMessage: record.siweMessage,
      siweSignature: record.siweSignature,
    }
  })
  const envelopeBlock = await encodeBlock({
    codec: dagCbor,
    hasher: sha256,
    value: {
      kind: REF_ENVELOPE_KIND,
      schemaVersion: REF_SCHEMA_VERSION,
      ref: payloadBlock.cid,
      signature: record.signature,
    }
  })

  return { payloadBlock, envelopeBlock }
}

describe('RefIndex', () => {
  it('syncs refs from connected peers through IPNS', async () => {
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('remote ref content'))
    const localRootCid = await fs.addBytes(new TextEncoder().encode('local refs root'))
    const remoteRootCid = await fs.addBytes(new TextEncoder().encode('remote refs root'))
    const domainCid = await fs.addBytes(new TextEncoder().encode('example.eth'))
    const refCid = await fs.addBytes(new TextEncoder().encode('draft'))

    const remoteRecord = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      sequence: 123,
      contentCid: contentCid.toString(),
      didKey: 'did:key:z6Mkremote',
      signature: '0x1234',
      siweMessage: 'siwe',
      siweSignature: '0xabcd',
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-03-31T12:00:00.000Z',
      agentName: 'sync-agent',
    }
    const { payloadBlock, envelopeBlock } = await createEnvelopeBlocks(remoteRecord)

    const client = {
      pin: {
        add: jest.fn().mockResolvedValue(undefined)
      },
      files: {
        stat: jest.fn().mockResolvedValue({ cid: localRootCid })
      },
      name: {
        publish: jest.fn().mockResolvedValue(undefined),
        resolve: jest.fn().mockImplementation(async () => makeAsyncIterable([`/ipfs/${remoteRootCid.toString()}`]))
      },
      ls: jest.fn().mockImplementation(async function * (cid) {
        const cidString = cid.toString()
        if (cidString === remoteRootCid.toString()) {
          yield { name: 'example.eth', cid: domainCid, type: 'dir' }
          return
        }
        if (cidString === domainCid.toString()) {
          yield { name: 'draft', cid: refCid, type: 'dir' }
          return
        }
        if (cidString === refCid.toString()) {
          yield { name: '123', cid: contentCid, type: 'file' }
        }
      }),
      cat: jest.fn().mockImplementation(() => makeAsyncIterable([
        Buffer.from(envelopeBlock.cid.toString())
      ])),
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          const cidString = cid.toString()
          if (cidString === envelopeBlock.cid.toString()) {
            return envelopeBlock.bytes
          }
          if (cidString === payloadBlock.cid.toString()) {
            return payloadBlock.bytes
          }
          throw new Error(`Unexpected block cid: ${cidString}`)
        })
      }
    }

    const verifyRecord = jest.fn(async (value) => ({
      ...value,
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-03-31T12:00:00.000Z',
      agentName: 'sync-agent',
    }))
    const refIndex = new RefIndex({
      client,
      mfs: createMockMfs(),
      chainId: '1',
      verifyRecord,
    })
    const remoteHeadSync = new RemoteHeadSync({
      client,
      logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
      refIndex,
      subscriptionIndex: {
        getStatus: jest.fn().mockResolvedValue({ status: 'active' }),
      },
      publishRoot: () => refIndex.publishRoot(),
    })

    const changed = await remoteHeadSync.sync(['peer-a'])
    const refs = await refIndex.listRefs('example.eth')

    expect(changed).toBe(true)
    expect(verifyRecord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      allowedExpiredMs: REF_OCAP_GRACE_MS,
    }))
    expect(refs).toHaveLength(1)
    expect(refs[0].refId).toBe('draft')
    expect(refs[0].latest).toBe(true)
    expect(refs[0].agentName).toBe('sync-agent')
    expect(client.block.get).toHaveBeenCalled()
    expect(client.pin.add).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recursive: true,
    }))
    expect(client.name.publish).toHaveBeenCalled()
  })

  it('skips remote refs for domains without an active local subscription', async () => {
    const { fs } = emptyUnixfs()
    const remoteRootCid = await fs.addBytes(new TextEncoder().encode('remote refs root'))
    const domainCid = await fs.addBytes(new TextEncoder().encode('example.eth'))
    const refCid = await fs.addBytes(new TextEncoder().encode('draft'))

    const client = {
      name: {
        resolve: jest.fn().mockImplementation(async () => makeAsyncIterable([`/ipfs/${remoteRootCid.toString()}`]))
      },
      ls: jest.fn().mockImplementation(async function * (cid) {
        const cidString = cid.toString()
        if (cidString === remoteRootCid.toString()) {
          yield { name: 'example.eth', cid: domainCid, type: 'dir' }
          return
        }
        if (cidString === domainCid.toString()) {
          yield { name: 'draft', cid: refCid, type: 'dir' }
        }
      }),
      cat: jest.fn(),
    }
    const refIndex = new RefIndex({
      client,
      mfs: createMockMfs(),
      chainId: '1',
      verifyRecord: async (record) => record,
    })
    const subscriptionIndex = {
      getStatus: jest.fn().mockResolvedValue({ status: 'missing' }),
    }
    const remoteHeadSync = new RemoteHeadSync({
      client,
      logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
      refIndex,
      subscriptionIndex,
      publishRoot: jest.fn(),
    })

    const changed = await remoteHeadSync.sync(['peer-a'])

    expect(changed).toBe(false)
    expect(subscriptionIndex.getStatus).toHaveBeenCalledWith('example.eth')
    expect(client.cat).not.toHaveBeenCalled()
  })

  it('rejects writes when a ref lane is already claimed by a different did:key', async () => {
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('claimed ref content'))
    const claimedRecord = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      sequence: 123,
      contentCid: contentCid.toString(),
      didKey: 'did:key:z6Mkclaimed',
      signature: '0x1234',
      siweMessage: 'siwe',
      siweSignature: '0xabcd',
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-03-31T12:00:00.000Z',
      agentName: 'claimed-agent',
    }
    const conflictingRecord = {
      ...claimedRecord,
      sequence: 124,
      didKey: 'did:key:z6Mkconflict',
    }
    const { payloadBlock: claimedPayloadBlock, envelopeBlock: claimedEnvelopeBlock } = await createEnvelopeBlocks(claimedRecord)
    const mfs = createMockMfs()
    mfs.files.set(`${mfs.refsDir}/example.eth/draft/123`, claimedEnvelopeBlock.cid.toString())

    const client = {
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          if (cid.toString() === claimedEnvelopeBlock.cid.toString()) {
            return claimedEnvelopeBlock.bytes
          }
          if (cid.toString() === claimedPayloadBlock.cid.toString()) {
            return claimedPayloadBlock.bytes
          }

          throw new Error(`Unexpected block cid: ${cid.toString()}`)
        })
      },
      pin: {
        add: jest.fn().mockResolvedValue(undefined)
      }
    }

    const refIndex = new RefIndex({
      client,
      mfs,
      chainId: '1',
      verifyRecord: async (record) => record,
    })

    await expect(refIndex.storeVerifiedRef(conflictingRecord, claimedEnvelopeBlock.cid.toString())).rejects.toThrow('Ref draft is claimed by a different did:key')
    expect(client.pin.add).not.toHaveBeenCalled()
  })

  it('allows the same did:key to update a ref lane with a higher sequence', async () => {
    const { fs } = emptyUnixfs()
    const firstContentCid = await fs.addBytes(new TextEncoder().encode('first draft content'))
    const secondContentCid = await fs.addBytes(new TextEncoder().encode('second draft content'))
    const baseRecord = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      didKey: 'did:key:z6Mksameagent',
      signature: '0x1234',
      siweMessage: 'siwe',
      siweSignature: '0xabcd',
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-03-31T12:00:00.000Z',
      agentName: 'same-agent',
    }
    const firstRecord = {
      ...baseRecord,
      sequence: 123,
      contentCid: firstContentCid.toString(),
    }
    const secondRecord = {
      ...baseRecord,
      sequence: 124,
      contentCid: secondContentCid.toString(),
    }
    const { payloadBlock: firstPayloadBlock, envelopeBlock: firstEnvelopeBlock } = await createEnvelopeBlocks(firstRecord)
    const { payloadBlock: secondPayloadBlock, envelopeBlock: secondEnvelopeBlock } = await createEnvelopeBlocks(secondRecord)
    const mfs = createMockMfs()

    const blockBytes = new Map([
      [firstPayloadBlock.cid.toString(), firstPayloadBlock.bytes],
      [firstEnvelopeBlock.cid.toString(), firstEnvelopeBlock.bytes],
      [secondPayloadBlock.cid.toString(), secondPayloadBlock.bytes],
      [secondEnvelopeBlock.cid.toString(), secondEnvelopeBlock.bytes],
    ])
    const client = {
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          const bytes = blockBytes.get(cid.toString())
          if (!bytes) {
            throw new Error(`Unexpected block cid: ${cid.toString()}`)
          }
          return bytes
        })
      },
      pin: {
        add: jest.fn().mockResolvedValue(undefined)
      }
    }
    const refIndex = new RefIndex({
      client,
      mfs,
      chainId: '1',
      verifyRecord: async (record) => ({
        ...record,
        ownerAddress: baseRecord.ownerAddress,
        issuedAt: baseRecord.issuedAt,
        agentName: baseRecord.agentName,
      }),
    })

    await expect(refIndex.storeVerifiedRef(firstRecord, firstEnvelopeBlock.cid.toString(), { publish: false })).resolves.toMatchObject({ stored: true })
    await expect(refIndex.storeVerifiedRef(secondRecord, secondEnvelopeBlock.cid.toString(), { publish: false })).resolves.toMatchObject({ stored: true })

    const latest = await refIndex.getLatestRef('example.eth', 'draft')
    const refs = await refIndex.listRefs('example.eth')

    expect(latest.sequence).toBe(124)
    expect(latest.contentCid).toBe(secondContentCid.toString())
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ sequence: 124, latest: true, contentCid: secondContentCid.toString() })
    expect(refs[1]).toMatchObject({ sequence: 123, latest: false, contentCid: firstContentCid.toString() })
    expect(client.pin.add).toHaveBeenCalledTimes(2)
  })

  it('rejects same-agent ref updates with the same or lower sequence', async () => {
    const { fs } = emptyUnixfs()
    const firstContentCid = await fs.addBytes(new TextEncoder().encode('first draft content'))
    const sameSequenceContentCid = await fs.addBytes(new TextEncoder().encode('same sequence content'))
    const lowerSequenceContentCid = await fs.addBytes(new TextEncoder().encode('lower sequence content'))
    const baseRecord = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      didKey: 'did:key:z6Mksameagent',
      signature: '0x1234',
      siweMessage: 'siwe',
      siweSignature: '0xabcd',
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-03-31T12:00:00.000Z',
      agentName: 'same-agent',
    }
    const firstRecord = {
      ...baseRecord,
      sequence: 123,
      contentCid: firstContentCid.toString(),
    }
    const sameSequenceRecord = {
      ...baseRecord,
      sequence: 123,
      contentCid: sameSequenceContentCid.toString(),
    }
    const lowerSequenceRecord = {
      ...baseRecord,
      sequence: 122,
      contentCid: lowerSequenceContentCid.toString(),
    }
    const { payloadBlock: firstPayloadBlock, envelopeBlock: firstEnvelopeBlock } = await createEnvelopeBlocks(firstRecord)
    const { envelopeBlock: sameSequenceEnvelopeBlock } = await createEnvelopeBlocks(sameSequenceRecord)
    const { envelopeBlock: lowerSequenceEnvelopeBlock } = await createEnvelopeBlocks(lowerSequenceRecord)
    const mfs = createMockMfs()
    const client = {
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          if (cid.toString() === firstEnvelopeBlock.cid.toString()) {
            return firstEnvelopeBlock.bytes
          }
          if (cid.toString() === firstPayloadBlock.cid.toString()) {
            return firstPayloadBlock.bytes
          }
          throw new Error(`Unexpected block cid: ${cid.toString()}`)
        })
      },
      pin: {
        add: jest.fn().mockResolvedValue(undefined)
      }
    }
    const refIndex = new RefIndex({
      client,
      mfs,
      chainId: '1',
      verifyRecord: async (record) => record,
    })

    await expect(refIndex.storeVerifiedRef(firstRecord, firstEnvelopeBlock.cid.toString(), { publish: false })).resolves.toMatchObject({ stored: true })
    await expect(refIndex.storeVerifiedRef(sameSequenceRecord, sameSequenceEnvelopeBlock.cid.toString(), { publish: false })).rejects.toThrow('Ref draft sequence must be higher than 123')
    await expect(refIndex.storeVerifiedRef(lowerSequenceRecord, lowerSequenceEnvelopeBlock.cid.toString(), { publish: false })).rejects.toThrow('Ref draft sequence must be higher than 123')

    const refs = await refIndex.listRefs('example.eth')
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ sequence: 123, latest: true, contentCid: firstContentCid.toString() })
    expect(client.pin.add).toHaveBeenCalledTimes(1)
  })

  it('skips unverifiable refs when listing refs', async () => {
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('expired ref content'))
    const record = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      sequence: 123,
      contentCid: contentCid.toString(),
      didKey: 'did:key:z6Mkexpired',
      signature: '0x1234',
      siweMessage: 'siwe',
      siweSignature: '0xabcd',
    }
    const { payloadBlock, envelopeBlock } = await createEnvelopeBlocks(record)
    const mfs = createMockMfs()
    mfs.files.set(`${mfs.refsDir}/example.eth/draft/123`, envelopeBlock.cid.toString())

    const client = {
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          if (cid.toString() === envelopeBlock.cid.toString()) {
            return envelopeBlock.bytes
          }
          if (cid.toString() === payloadBlock.cid.toString()) {
            return payloadBlock.bytes
          }

          throw new Error(`Unexpected block cid: ${cid.toString()}`)
        })
      }
    }

    const refIndex = new RefIndex({
      client,
      mfs,
      chainId: '1',
      verifyRecord: async () => {
        throw new Error('SIWE capability has expired')
      },
    })

    await expect(refIndex.listRefs('example.eth')).resolves.toEqual([])
  })

  it('passes the ocap grace period when listing refs', async () => {
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('expired but grace ref content'))
    const record = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      sequence: 123,
      contentCid: contentCid.toString(),
      didKey: 'did:key:z6Mkgrace',
      signature: '0x1234',
      siweMessage: 'siwe',
      siweSignature: '0xabcd',
    }
    const { payloadBlock, envelopeBlock } = await createEnvelopeBlocks(record)
    const mfs = createMockMfs()
    mfs.files.set(`${mfs.refsDir}/example.eth/draft/123`, envelopeBlock.cid.toString())
    const verifyRecord = jest.fn(async (value) => ({
      ...value,
      ownerAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: '2026-03-31T12:00:00.000Z',
      expiresAt: '2026-03-31T13:00:00.000Z',
      agentName: 'grace-agent',
    }))
    const client = {
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          if (cid.toString() === envelopeBlock.cid.toString()) {
            return envelopeBlock.bytes
          }
          if (cid.toString() === payloadBlock.cid.toString()) {
            return payloadBlock.bytes
          }
          throw new Error(`Unexpected block cid: ${cid.toString()}`)
        })
      }
    }
    const refIndex = new RefIndex({
      client,
      mfs,
      chainId: '1',
      verifyRecord,
    })

    const refs = await refIndex.listRefs('example.eth')

    expect(refs).toHaveLength(1)
    expect(refs[0].expiresAt).toBe('2026-03-31T13:00:00.000Z')
    expect(verifyRecord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      expectedDomain: 'example.eth',
      allowedExpiredMs: REF_OCAP_GRACE_MS,
    }))
  })

  it('garbage collects refs whose ocap is outside the grace period', async () => {
    const { fs } = emptyUnixfs()
    const contentCid = await fs.addBytes(new TextEncoder().encode('old expired ref content'))
    const siweMessage = buildCapabilitySiweMessage({
      ownerAddress: '0x0000000000000000000000000000000000000001',
      didKey: 'did:key:z6Mkoldexpired',
      domain: 'example.eth',
      chainId: 1,
      nonce: '123',
      issuedAt: '2026-03-31T12:00:00.000Z',
      expirationTime: '2026-03-31T13:00:00.000Z',
    })
    const record = {
      schemaVersion: REF_SCHEMA_VERSION,
      domain: 'example.eth',
      refId: 'draft',
      sequence: 123,
      contentCid: contentCid.toString(),
      didKey: 'did:key:z6Mkoldexpired',
      signature: '0x1234',
      siweMessage,
      siweSignature: '0xabcd',
    }
    const { payloadBlock, envelopeBlock } = await createEnvelopeBlocks(record)
    const mfs = createMockMfs()
    const refPath = `${mfs.refsDir}/example.eth/draft/123`
    mfs.files.set(refPath, envelopeBlock.cid.toString())
    const client = {
      files: {
        stat: jest.fn().mockResolvedValue({ cid: contentCid })
      },
      name: {
        publish: jest.fn().mockResolvedValue(undefined),
      },
      pin: {
        rm: jest.fn().mockResolvedValue(undefined),
      },
      block: {
        get: jest.fn().mockImplementation(async (cid) => {
          if (cid.toString() === envelopeBlock.cid.toString()) {
            return envelopeBlock.bytes
          }
          if (cid.toString() === payloadBlock.cid.toString()) {
            return payloadBlock.bytes
          }
          throw new Error(`Unexpected block cid: ${cid.toString()}`)
        })
      }
    }
    const refIndex = new RefIndex({
      client,
      mfs,
      chainId: '1',
      verifyRecord: async (value) => value,
    })

    const pruned = await refIndex.pruneExpiredRefs(Date.parse('2026-05-01T13:00:00.000Z'))

    expect(pruned).toBe(1)
    expect(mfs.files.has(refPath)).toBe(false)
    expect(client.pin.rm).toHaveBeenCalledWith(envelopeBlock.cid, expect.objectContaining({
      name: expect.stringContaining('draft_123'),
    }))
    expect(client.name.publish).toHaveBeenCalled()
  })
})
