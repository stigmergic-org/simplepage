import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { base58btc } from 'multiformats/bases/base58'
import { concat } from 'uint8arrays/concat'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { getAddress, recoverMessageAddress } from 'viem'

import { resolveEnsOwner } from './ens.js'
import { carFromBytes } from './ipld.js'

export const REF_SCHEMA_VERSION = 1
export const REF_PAYLOAD_KIND = 'simplepage/ref@1'
export const REF_ENVELOPE_KIND = 'simplepage/ref-envelope@1'
export const REF_OCAP_GRACE_MS = 30 * 24 * 60 * 60 * 1000

const DID_KEY_PREFIX = 'did:key:'
const AGENT_RESOURCE_PREFIX = 'urn:simplepage:agent:'
const RESERVED_REF_IDS = new Set(['_ocaps'])
const ED25519_MULTICODEC_PREFIX = Uint8Array.from([0xed, 0x01])
const ED25519_SPKI_PREFIX = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00])

const stripHexPrefix = (value) => value.startsWith('0x') ? value.slice(2) : value

const concatBytes = (...arrays) => concat(arrays)

const hexToBytes = (value) => uint8ArrayFromString(stripHexPrefix(value), 'base16')

const normalizeSignature = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Missing signature')
  }
  return value.startsWith('0x') ? value : `0x${value}`
}

const normalizeSequence = (value) => {
  const sequence = Number(value)
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('Invalid ref sequence')
  }
  return sequence
}

const parseCidLike = (value) => {
  if (typeof value === 'string') {
    return CID.parse(value)
  }

  const cid = CID.asCID(value)
  if (cid) {
    return cid
  }

  const linkValue = value?.['/']
  if (typeof linkValue === 'string') {
    return CID.parse(linkValue)
  }
  if (linkValue instanceof Uint8Array) {
    return CID.decode(linkValue)
  }
  if (Array.isArray(linkValue)) {
    return CID.decode(Uint8Array.from(linkValue))
  }

  throw new Error('Invalid ref CID')
}

const normalizeCidString = (value) => {
  return parseCidLike(value).toString()
}

const normalizeRefId = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Missing ref id')
  }
  const normalized = value.trim()
  if (RESERVED_REF_IDS.has(normalized)) {
    throw new Error(`Ref id ${normalized} is reserved`)
  }
  return normalized
}

const normalizeDidKey = (value) => {
  if (typeof value !== 'string' || !value.startsWith(DID_KEY_PREFIX)) {
    throw new Error('Invalid did:key identifier')
  }
  return value
}

const normalizeAgentName = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const buildAgentResource = (agentName) => {
  const normalizedAgentName = normalizeAgentName(agentName)
  if (!normalizedAgentName) {
    return null
  }

  return `${AGENT_RESOURCE_PREFIX}${encodeURIComponent(normalizedAgentName)}`
}

const parseAgentNameFromResources = (resources) => {
  const agentResources = resources.filter(resource => resource.startsWith(AGENT_RESOURCE_PREFIX))
  if (agentResources.length === 0) {
    return null
  }
  if (agentResources.length > 1) {
    throw new Error('SIWE contains multiple agent resources')
  }

  const encodedAgentName = agentResources[0].slice(AGENT_RESOURCE_PREFIX.length)
  const agentName = normalizeAgentName(decodeURIComponent(encodedAgentName))
  if (!agentName) {
    throw new Error('SIWE agent resource is invalid')
  }

  return agentName
}

const normalizeRefPayload = (record) => {
  if (!record || typeof record !== 'object') {
    throw new Error('Invalid ref payload')
  }

  const domain = typeof record.domain === 'string' && record.domain.trim().length > 0
    ? record.domain.trim()
    : null
  if (!domain) {
    throw new Error('Missing ref domain')
  }

  const siweMessage = typeof record.siweMessage === 'string' && record.siweMessage.length > 0
    ? record.siweMessage
    : null
  if (!siweMessage) {
    throw new Error('Missing SIWE message')
  }

  return {
    schemaVersion: REF_SCHEMA_VERSION,
    kind: REF_PAYLOAD_KIND,
    domain,
    refId: normalizeRefId(record.refId),
    sequence: normalizeSequence(record.sequence),
    didKey: normalizeDidKey(record.didKey),
    contentCid: normalizeCidString(record.contentCid),
    siweMessage,
    siweSignature: normalizeSignature(record.siweSignature),
  }
}

const parseRefEnvelope = (car) => {
  if (!Array.isArray(car.roots) || car.roots.length !== 1) {
    throw new Error('Ref CAR must contain exactly one root')
  }

  const envelopeCid = car.roots[0]
  const envelope = car.get(envelopeCid)

  if (!envelope || envelope.kind !== REF_ENVELOPE_KIND) {
    throw new Error('Invalid ref envelope')
  }

  if (Number(envelope.schemaVersion ?? REF_SCHEMA_VERSION) !== REF_SCHEMA_VERSION) {
    throw new Error('Unsupported ref envelope schema version')
  }

  let refCid
  try {
    refCid = parseCidLike(envelope.ref)
  } catch {
    throw new Error('Ref envelope is missing payload link')
  }

  const payload = car.get(refCid)
  if (!payload || payload.kind !== REF_PAYLOAD_KIND) {
    throw new Error('Invalid ref payload')
  }

  if (Number(payload.schemaVersion ?? REF_SCHEMA_VERSION) !== REF_SCHEMA_VERSION) {
    throw new Error('Unsupported ref payload schema version')
  }

  return { envelopeCid, envelope, payload, refCid }
}

const encodePayloadForSigning = (record) => {
  const payload = normalizeRefPayload(record)
  return dagCbor.encode({
    kind: REF_PAYLOAD_KIND,
    schemaVersion: REF_SCHEMA_VERSION,
    domain: payload.domain,
    refId: payload.refId,
    sequence: payload.sequence,
    didKey: payload.didKey,
    contentCid: CID.parse(payload.contentCid),
    siweMessage: payload.siweMessage,
    siweSignature: payload.siweSignature,
  })
}

const verifySignatureForDidKey = async (payloadBytes, didKey, signature) => {
  const subtleCrypto = globalThis.crypto?.subtle
  if (!subtleCrypto) {
    throw new Error('Web Crypto is unavailable')
  }

  const publicKey = await subtleCrypto.importKey(
    'spki',
    concatBytes(ED25519_SPKI_PREFIX, ed25519PublicKeyFromDidKey(didKey)),
    'Ed25519',
    false,
    ['verify']
  )

  return subtleCrypto.verify('Ed25519', publicKey, hexToBytes(signature), payloadBytes)
}

export function didKeyFromEd25519PublicKey(rawPublicKey) {
  if (!(rawPublicKey instanceof Uint8Array) || rawPublicKey.length !== 32) {
    throw new Error('ed25519 public key must be 32 bytes')
  }

  const encoded = base58btc.encode(concatBytes(ED25519_MULTICODEC_PREFIX, rawPublicKey))

  return `${DID_KEY_PREFIX}${encoded}`
}

export function ed25519PublicKeyFromDidKey(didKey) {
  const normalizedDidKey = normalizeDidKey(didKey)
  const multibaseValue = normalizedDidKey.slice(DID_KEY_PREFIX.length)
  const decoded = base58btc.decode(multibaseValue)

  if (decoded.length !== 34) {
    throw new Error('Invalid did:key length')
  }

  if (decoded[0] !== ED25519_MULTICODEC_PREFIX[0] || decoded[1] !== ED25519_MULTICODEC_PREFIX[1]) {
    throw new Error('Unsupported did:key codec')
  }

  return decoded.slice(2)
}

export function buildRefSiweMessage({
  ownerAddress,
  didKey,
  domain,
  agentName,
  chainId,
  issuedAt,
  expirationTime,
  nonce,
  serviceDomain = 'simplepage.eth.link'
}) {
  const normalizedDomain = typeof domain === 'string' && domain.trim().length > 0
    ? domain.trim()
    : null
  if (!normalizedDomain) {
    throw new Error('Missing capability domain')
  }

  const issuedAtIso = new Date(issuedAt).toISOString()
  const nonceValue = typeof nonce === 'undefined' ? `${Date.now()}` : String(nonce)
  const suffix = expirationTime
    ? `\nExpiration Time: ${new Date(expirationTime).toISOString()}`
    : ''
  const resources = [
    `- ens://${normalizedDomain}`,
  ]
  const agentResource = buildAgentResource(agentName)
  if (agentResource) {
    resources.push(`- ${agentResource}`)
  }

  return `${serviceDomain} wants you to sign in with your Ethereum account:\n${getAddress(ownerAddress)}\n\nAuthorize SimplePage CLI for ${normalizedDomain}\n\nURI: ${normalizeDidKey(didKey)}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonceValue}\nIssued At: ${issuedAtIso}${suffix}\nResources:\n${resources.join('\n')}`
}

export const buildCapabilitySiweMessage = buildRefSiweMessage

export function normalizeRefRecord(record) {
  return {
    ...normalizeRefPayload(record),
    signature: normalizeSignature(record.signature),
  }
}

export function parseSiweMessage(message) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Invalid SIWE message')
  }

  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const headerMatch = lines[0]?.match(/^(.*) wants you to sign in with your Ethereum account:$/)

  if (!headerMatch) {
    throw new Error('Invalid SIWE header')
  }

  const address = lines[1]?.trim()
  if (!address) {
    throw new Error('Missing SIWE address')
  }

  let index = 2
  while (index < lines.length && lines[index] === '') {
    index += 1
  }

  const statementLines = []
  while (index < lines.length && lines[index] !== '') {
    statementLines.push(lines[index])
    index += 1
  }

  while (index < lines.length && lines[index] === '') {
    index += 1
  }

  const fields = new Map()
  const resources = []
  while (index < lines.length) {
    const line = lines[index]
    if (!line) {
      index += 1
      continue
    }

    if (line === 'Resources:') {
      index += 1
      while (index < lines.length && lines[index].startsWith('- ')) {
        resources.push(lines[index].slice(2).trim())
        index += 1
      }
      continue
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      throw new Error(`Invalid SIWE field: ${line}`)
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    fields.set(key, value)
    index += 1
  }

  return {
    serviceDomain: headerMatch[1],
    address: getAddress(address),
    statement: statementLines.join('\n'),
    uri: fields.get('URI') || null,
    version: fields.get('Version') || null,
    chainId: fields.get('Chain ID') || null,
    nonce: fields.get('Nonce') || null,
    issuedAt: fields.get('Issued At') || null,
    expirationTime: fields.get('Expiration Time') || null,
    requestId: fields.get('Request ID') || null,
    resources,
  }
}

export async function verifyCapability({
  domain,
  didKey,
  siweMessage,
  siweSignature,
}, {
  expectedDomain,
  expectedChainId,
  expectedOwnerAddress,
  expectedAgentName,
  viemClient,
  now = Date.now(),
  allowedExpiredMs = 0,
} = {}) {
  const normalizedDomain = typeof domain === 'string' && domain.trim().length > 0
    ? domain.trim()
    : null
  if (!normalizedDomain) {
    throw new Error('Missing capability domain')
  }

  const normalizedDidKey = normalizeDidKey(didKey)
  const normalizedSiweMessage = typeof siweMessage === 'string' && siweMessage.length > 0
    ? siweMessage
    : null
  if (!normalizedSiweMessage) {
    throw new Error('Missing SIWE message')
  }

  const normalizedSiweSignature = normalizeSignature(siweSignature)
  const siwe = parseSiweMessage(normalizedSiweMessage)
  const signedAddress = getAddress(await recoverMessageAddress({
    message: normalizedSiweMessage,
    signature: normalizedSiweSignature,
  }))

  if (signedAddress !== siwe.address) {
    throw new Error('SIWE signer does not match SIWE address')
  }

  if (expectedDomain && normalizedDomain !== expectedDomain) {
    throw new Error('Capability domain does not match request domain')
  }

  let resolvedOwnerAddress = expectedOwnerAddress
  if (!resolvedOwnerAddress && viemClient && expectedChainId && normalizedDomain) {
    resolvedOwnerAddress = await resolveEnsOwner(viemClient, normalizedDomain, expectedChainId)
    if (!resolvedOwnerAddress) {
      throw new Error('Could not resolve ENS owner for capability')
    }
  }

  if (resolvedOwnerAddress && signedAddress !== getAddress(resolvedOwnerAddress)) {
    throw new Error('SIWE signer is not the ENS owner')
  }

  if (siwe.uri !== normalizedDidKey) {
    throw new Error('SIWE uri does not match did:key')
  }

  if (expectedChainId && String(siwe.chainId) !== String(expectedChainId)) {
    throw new Error('SIWE chain id does not match')
  }

  if (siwe.version !== '1') {
    throw new Error('Unsupported SIWE version')
  }

  if (!siwe.resources.includes(`ens://${normalizedDomain}`)) {
    throw new Error('SIWE resources do not include the ENS name')
  }

  const agentName = parseAgentNameFromResources(siwe.resources)
  const normalizedExpectedAgentName = normalizeAgentName(expectedAgentName)
  if (normalizedExpectedAgentName && agentName !== normalizedExpectedAgentName) {
    throw new Error('SIWE agent does not match request agent')
  }

  const issuedAtDate = new Date(siwe.issuedAt)
  if (Number.isNaN(issuedAtDate.getTime())) {
    throw new Error('Invalid SIWE issued at timestamp')
  }

  const expirationTime = siwe.expirationTime ? new Date(siwe.expirationTime) : null
  if (!expirationTime) {
    throw new Error('SIWE capability must include an expiration time')
  }
  if (expirationTime && Number.isNaN(expirationTime.getTime())) {
    throw new Error('Invalid SIWE expiration timestamp')
  }

  if (expirationTime && expirationTime.getTime() + allowedExpiredMs <= now) {
    throw new Error('SIWE capability has expired')
  }

  return {
    domain: normalizedDomain,
    didKey: normalizedDidKey,
    siweMessage: normalizedSiweMessage,
    siweSignature: normalizedSiweSignature,
    ownerAddress: signedAddress,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: expirationTime ? expirationTime.toISOString() : null,
    nonce: siwe.nonce,
    agentName,
  }
}

export async function parseRefCar(bytes) {
  const car = carFromBytes(bytes, { verify: false })
  const { envelopeCid, envelope, payload } = parseRefEnvelope(car)
  const record = normalizeRefRecord({
    domain: payload.domain,
    refId: payload.refId,
    sequence: payload.sequence,
    didKey: payload.didKey,
    contentCid: payload.contentCid,
    siweMessage: payload.siweMessage,
    siweSignature: payload.siweSignature,
    signature: envelope.signature,
  })

  return {
    envelopeCid: envelopeCid.toString(),
    record,
  }
}

export async function verifyRefRecord(record, {
  expectedDomain,
  expectedChainId,
  expectedOwnerAddress,
  viemClient,
  allowedExpiredMs = 0,
} = {}) {
  const normalizedRecord = normalizeRefRecord(record)

  if (expectedDomain && normalizedRecord.domain !== expectedDomain) {
    throw new Error('Ref domain does not match request path')
  }

  if (!await verifySignatureForDidKey(
    encodePayloadForSigning(normalizedRecord),
    normalizedRecord.didKey,
    normalizedRecord.signature
  )) {
    throw new Error('Invalid ref signature')
  }

  const capability = await verifyCapability({
    domain: normalizedRecord.domain,
    didKey: normalizedRecord.didKey,
    siweMessage: normalizedRecord.siweMessage,
    siweSignature: normalizedRecord.siweSignature,
  }, {
    expectedDomain,
    expectedChainId,
    expectedOwnerAddress,
    viemClient,
    allowedExpiredMs,
  })

  return {
    ...normalizedRecord,
    ownerAddress: capability.ownerAddress,
    issuedAt: capability.issuedAt,
    expiresAt: capability.expiresAt,
    agentName: capability.agentName,
  }
}

export function encodeRefPayload(record) {
  return encodePayloadForSigning(record)
}
