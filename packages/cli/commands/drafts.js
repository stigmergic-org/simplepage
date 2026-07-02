import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as signBytes } from 'node:crypto'

import { createPublicClient, http } from 'viem'

import {
  contracts,
  DService,
  emptyCar,
  REF_ENVELOPE_KIND,
  REF_PAYLOAD_KIND,
  REF_SCHEMA_VERSION,
  didKeyFromEd25519PublicKey,
  encodeRefPayload,
  isSimplePageSiteEns,
} from '@simplepg/common'

import { buildContentDag } from './utils/contentCar.js'

const SIMPLEPAGE_DSERVICE = 'new.simplepage.eth'
const FALLBACK_AGENTS_DOMAIN = 'new.simplepage.eth'
const CHAIN_ID = 1
const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com'
const ED25519_SPKI_PREFIX_LENGTH = 12
const AGENT_STATE_DIR = '.simplepage'
const AGENT_STATE_FILE = 'identity.json'
const AGENT_ADJECTIVES = ['amber', 'brisk', 'clear', 'copper', 'ember', 'gentle', 'glacial', 'golden', 'granite', 'harbor', 'indigo', 'jade', 'lunar', 'moss', 'north', 'quiet', 'river', 'silver', 'solar', 'wild']
const AGENT_TRAITS = ['bright', 'calm', 'clever', 'curious', 'daring', 'eager', 'honest', 'kind', 'nimble', 'patient', 'proud', 'quick', 'ready', 'steady', 'tidy', 'warm']
const AGENT_ANIMALS = ['badger', 'falcon', 'fox', 'gecko', 'heron', 'ibis', 'koala', 'lemur', 'lynx', 'marten', 'narwhal', 'otter', 'owl', 'panda', 'raven', 'seal', 'stoat', 'swift', 'yak', 'wren']

const getDidKeyForPublicKey = (publicKey) => {
  const exported = publicKey.export({ format: 'der', type: 'spki' })
  return didKeyFromEd25519PublicKey(exported.subarray(ED25519_SPKI_PREFIX_LENGTH))
}

const normalizeAgentName = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()
  return normalizedValue.length > 0 ? normalizedValue : null
}

const generateAgentName = () => {
  const adjective = AGENT_ADJECTIVES[Math.floor(Math.random() * AGENT_ADJECTIVES.length)]
  const trait = AGENT_TRAITS[Math.floor(Math.random() * AGENT_TRAITS.length)]
  const animal = AGENT_ANIMALS[Math.floor(Math.random() * AGENT_ANIMALS.length)]
  return `${adjective}-${trait}-${animal}`
}

const getAgentStatePath = (cwd = process.cwd()) => path.join(cwd, AGENT_STATE_DIR, AGENT_STATE_FILE)

const resolveAgentIdentity = ({ cwd = process.cwd(), agentName: agentNameOverride }) => {
  const agentStatePath = getAgentStatePath(cwd)
  let state = null
  if (fs.existsSync(agentStatePath)) {
    state = JSON.parse(fs.readFileSync(agentStatePath, 'utf8'))
  }

  let privateKey = null
  let privateKeyPem = typeof state?.privateKeyPem === 'string' && state.privateKeyPem.length > 0
    ? state.privateKeyPem
    : null
  if (privateKeyPem) {
    privateKey = createPrivateKey(privateKeyPem)
  } else {
    const generatedKeyPair = generateKeyPairSync('ed25519')
    privateKey = generatedKeyPair.privateKey
    privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' })
  }

  const agentName = normalizeAgentName(agentNameOverride)
    || normalizeAgentName(state?.agentName)
    || generateAgentName()

  const nextState = {
    privateKeyPem,
    agentName,
  }
  if (!state || state.privateKeyPem !== nextState.privateKeyPem || state.agentName !== nextState.agentName) {
    fs.mkdirSync(path.dirname(agentStatePath), { recursive: true })
    fs.writeFileSync(agentStatePath, `${JSON.stringify(nextState, null, 2)}\n`)
  }

  return {
    privateKey,
    didKey: getDidKeyForPublicKey(createPublicKey(privateKey)),
    agentName,
    statePath: agentStatePath,
  }
}

export const createDservice = async (options) => {
  const chainId = Number(options.chainId ?? CHAIN_ID)
  const rpcUrl = options.rpc || DEFAULT_RPC
  const dserviceUrl = options.dservice
  const universalResolver = options.universalResolver || contracts.universalResolver[chainId]

  const client = createPublicClient({ transport: http(rpcUrl) })
  const dservice = new DService(SIMPLEPAGE_DSERVICE, { apiEndpoint: dserviceUrl })
  await dservice.init(client, { chainId, universalResolver })

  return {
    client,
    dservice,
    chainId,
    rpcUrl,
    universalResolver,
    dserviceUrl,
  }
}

const buildAgentsUrl = ({
  domain,
  appDomain,
  didKey,
  agentName,
  chainId,
}) => {
  const gatewaySuffix = Number(chainId) === 11155111 ? '.sepoliaens.eth.link' : '.link'
  const url = new URL(`https://${appDomain}${gatewaySuffix}/spg-agents`)
  const params = new URLSearchParams()
  params.set('domain', domain)
  params.set('key', didKey)
  if (agentName) {
    params.set('agent', agentName)
  }
  url.hash = params.toString()
  return url
}

const buildDraftsUrl = ({ domain, appDomain, chainId }) => {
  const gatewaySuffix = Number(chainId) === 11155111 ? '.sepoliaens.eth.link' : '.link'
  const url = new URL(`https://${appDomain}${gatewaySuffix}/spg-drafts`)
  const params = new URLSearchParams()
  params.set('domain', domain)
  url.hash = params.toString()
  return url
}

const getAppDomain = async ({ client, dservice, domain, universalResolver, fallback = false }) => {
  if (fallback) {
    return FALLBACK_AGENTS_DOMAIN
  }

  const isSimplePageSite = await isSimplePageSiteEns({
    viemClient: client,
    dservice,
    domain,
    universalResolver,
  })
  return isSimplePageSite ? domain : FALLBACK_AGENTS_DOMAIN
}

const shouldUseFallback = (options) => Boolean(options.fallback)

const openUrl = (url) => new Promise((resolve, reject) => {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open'
  const args = process.platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url]
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  })

  child.on('error', reject)
  child.unref()
  resolve()
})

const listCapabilities = async ({ dservice, domain }) => {
  const response = await dservice.fetch(`/capabilities/${encodeURIComponent(domain)}`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error(`Could not fetch capabilities: ${response.statusText}`)
  }

  const payload = await response.json()
  return Array.isArray(payload?.capabilities) ? payload.capabilities : []
}

const findMatchingCapability = ({ capabilities, didKey, agentName }) => capabilities.find(capability => (
  capability.didKey === didKey && normalizeAgentName(capability.agentName) === normalizeAgentName(agentName)
)) || null

export const listRefs = async ({ dservice, domain }) => {
  const response = await dservice.fetch(`/refs/${encodeURIComponent(domain)}`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error(`Could not fetch refs: ${response.statusText}`)
  }

  const payload = await response.json()
  return Array.isArray(payload?.refs) ? payload.refs : []
}

const getRefUploadErrorMessage = (error, { domain, refId, agentName }) => {
  const message = error?.message || String(error)
  const claimMatch = message.match(/Ref\s+(.+?)\s+is claimed by a different did:key/i)
  if (claimMatch) {
    const claimedRefId = claimMatch[1] || refId
    return `Ref "${claimedRefId}" on ${domain} is already claimed by a different agent key. Ref names are scoped per ENS name. Choose a different ref name, or use the original agent identity for that ref. Current agent: ${agentName}.`
  }

  const detailMatch = message.match(/HTTP\s+\d+:\s+[^:]+:\s+(.+)$/)
  if (detailMatch) {
    return getRefUploadErrorMessage(new Error(detailMatch[1]), { domain, refId, agentName })
  }

  if (/SIWE capability must include an expiration time/i.test(message)) {
    return `The stored capability for ${agentName} on ${domain} is missing an expiry. Re-authorize the agent with:\n  simplepage auth ${domain} --name ${agentName}`
  }

  return message
}

const getExistingCapability = async ({
  dservice,
  domain,
  didKey,
  agentName,
}) => findMatchingCapability({
  capabilities: await listCapabilities({ dservice, domain }),
  didKey,
  agentName,
})

export async function auth(domain, options) {
  const { client, dservice, chainId, universalResolver } = await createDservice(options)
  const { didKey, agentName, statePath } = resolveAgentIdentity({ agentName: options.name })
  const existingCapability = await getExistingCapability({
    dservice,
    domain,
    didKey,
    agentName,
  })

  if (existingCapability) {
    console.log(`Agent ${agentName} is already authorized for ${domain}.`)
    console.log(`Key: ${didKey}`)
    console.log(`Identity: ${statePath}`)
    return
  }

  const agentsUrl = buildAgentsUrl({
    domain,
    appDomain: await getAppDomain({ client, dservice, domain, universalResolver, fallback: shouldUseFallback(options) }),
    didKey,
    agentName,
    chainId,
  })

  console.log(`Authorize agent ${agentName} for ${domain}:`)
  console.log(agentsUrl.toString())
  console.log(`Identity: ${statePath}`)
}

export async function pushRawRef(domain, refId, path, options) {
  const { dservice } = await createDservice(options)
  const { root, blocks } = await buildContentDag(path)
  const { ref, didKey, agentName, statePath } = await storeSignedRef({
    dservice,
    domain,
    refId,
    contentCid: root,
    blocks,
  })

  printStoredRef({ domain, ref, didKey, agentName, statePath })
}

export async function storeSignedRef({ dservice, domain, refId, contentCid, blocks }) {
  const { privateKey, didKey, agentName, statePath } = resolveAgentIdentity({})
  const refs = await listRefs({ dservice, domain })
  const latestRef = refs.find(entry => entry.refId === refId && entry.latest)
  if (latestRef && latestRef.didKey !== didKey) {
    throw new Error(`Ref ${refId} is already claimed by a different did:key`)
  }

  const sequence = Number(latestRef?.sequence || 0) + 1
  const capability = await getExistingCapability({
    dservice,
    domain,
    didKey,
    agentName,
  })
  if (!capability) {
    throw new Error(`No capability found for ${agentName} on ${domain}. Run:\n  simplepage auth ${domain}`)
  }

  const payload = {
    kind: REF_PAYLOAD_KIND,
    schemaVersion: REF_SCHEMA_VERSION,
    domain,
    refId,
    sequence,
    didKey,
    contentCid,
    siweMessage: capability.siweMessage,
    siweSignature: capability.siweSignature,
  }
  const payloadSignature = `0x${signBytes(null, Buffer.from(encodeRefPayload({
    ...payload,
    contentCid: contentCid.toString(),
  })), privateKey).toString('hex')}`

  const car = emptyCar()
  for (const block of blocks) {
    car.blocks.put(block)
  }
  const payloadCid = car.put(payload)
  car.put({
    kind: REF_ENVELOPE_KIND,
    schemaVersion: REF_SCHEMA_VERSION,
    ref: payloadCid,
    signature: payloadSignature,
  }, { isRoot: true })

  const formData = new FormData()
  formData.append('file', new Blob([car.bytes], {
    type: 'application/vnd.ipld.car',
  }), 'ref.car')

  let response
  try {
    response = await dservice.fetch(`/refs/${encodeURIComponent(domain)}`, {
      method: 'POST',
      body: formData
    })
  } catch (error) {
    throw new Error(getRefUploadErrorMessage(error, { domain, refId, agentName }))
  }

  if (!response.ok) {
    const responsePayload = await response.json().catch(() => null)
    const detail = responsePayload?.detail || response.statusText
    throw new Error(getRefUploadErrorMessage(new Error(detail), { domain, refId, agentName }))
  }

  const { ref } = await response.json()

  return { ref, didKey, agentName, statePath }
}

export function printStoredRef({ domain, ref, didKey, agentName, statePath }) {
  console.log(`\nStored draft \`${ref.refId}\` for ${domain}.`)
  console.log(`Agent: ${agentName} (${didKey})`)
  console.log(`Identity: ${statePath}`)
  console.log(`CID: ipfs://${ref.contentCid}`)
  console.log(`Version: ${ref.sequence}`)
  console.log(`Preview: https://${ref.contentCid}.ipfs.inbrowser.link`)
  console.log('')
}

export async function listRefsCommand(domain, options) {
  const { dservice } = await createDservice(options)
  const response = await dservice.fetch(`/refs/${encodeURIComponent(domain)}`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error(`Could not fetch refs: ${response.statusText}`)
  }

  const { refs } = await response.json()
  if (!Array.isArray(refs) || refs.length === 0) {
    console.log(`No drafts found for ${domain}.`)
    return
  }

  console.log(`Drafts for ${domain}:`)
  for (const ref of refs) {
    const latestLabel = ref.latest ? ' latest' : ''
    console.log(`- ${ref.refId} v${ref.sequence}${latestLabel} ipfs://${ref.contentCid}`)
  }
  console.log('')
}

export async function reviewDrafts(domain, options) {
  const { client, dservice, chainId, universalResolver } = await createDservice(options)
  const appDomain = await getAppDomain({ client, dservice, domain, universalResolver, fallback: shouldUseFallback(options) })
  const draftsUrl = buildDraftsUrl({ domain, appDomain, chainId }).toString()

  console.log(draftsUrl)

  if (options.open) {
    await openUrl(draftsUrl)
  }
}
