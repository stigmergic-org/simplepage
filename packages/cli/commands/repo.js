import nodeFs from 'node:fs'
import path from 'node:path'

import { JSDOM } from 'jsdom'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

import {
  contracts,
  resolveEnsDomain,
  DService,
  carFromBytes,
  CID,
  emptyCar,
  emptyUnixfs,
  isSimplePageSiteEns,
  cat,
  tree
} from '@simplepg/common'
import { Repo, renderMarkdownBody } from '@simplepg/repo'
import { listRefs, printStoredRef, storeSignedRef } from './drafts.js'

if (typeof globalThis.DOMParser === 'undefined') {
  const dom = new JSDOM()
  globalThis.DOMParser = dom.window.DOMParser
}


const TEMPLATE_DOMAIN = 'new.simplepage.eth'
const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com'
const SIMPLEPAGE_DIR = '.simplepage'
const BLOCKS_FILE = 'blocks.car'
const STATE_FILE = 'state.json'
const STATE_SCHEMA_VERSION = 1
const UPSTREAM_STATUS_UNKNOWN = 'unknown (upstream might be out of date)'

const normalizeRelativePath = (value) => value.replace(/\\/g, '/').split(path.sep).join('/')
const getRepoDataDir = (repoRoot) => path.join(repoRoot, SIMPLEPAGE_DIR)
const getBlocksPath = (repoRoot) => path.join(getRepoDataDir(repoRoot), BLOCKS_FILE)
const getStatePath = (repoRoot) => path.join(getRepoDataDir(repoRoot), STATE_FILE)

class MemoryStorage {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null
  }

  setItem(key, value) {
    this[key] = String(value)
  }

  removeItem(key) {
    delete this[key]
  }
}

const createInitialState = ({ domain, trackedRootCid, sourceDomain = domain }) => ({
  schemaVersion: STATE_SCHEMA_VERSION,
  domain,
  sourceDomain,
  trackedRootCid: trackedRootCid.toString(),
  activeDraft: null,
  drafts: {},
})

async function readRepoState(repoRoot) {
  const statePath = getStatePath(repoRoot)
  const state = JSON.parse(await nodeFs.promises.readFile(statePath, 'utf8'))
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported SimplePage repo state schema version: ${state.schemaVersion}`)
  }
  if (!state.domain || !state.trackedRootCid) {
    throw new Error('Invalid SimplePage repo state')
  }
  return {
    ...state,
    sourceDomain: state.sourceDomain || state.baseDomain || state.domain,
    drafts: state.drafts || {},
    activeDraft: state.activeDraft || null,
  }
}

async function writeRepoState(repoRoot, state) {
  await nodeFs.promises.mkdir(getRepoDataDir(repoRoot), { recursive: true })
  await nodeFs.promises.writeFile(getStatePath(repoRoot), `${JSON.stringify({
    schemaVersion: STATE_SCHEMA_VERSION,
    ...state,
    drafts: state.drafts || {},
    activeDraft: state.activeDraft || null,
  }, null, 2)}\n`, 'utf8')
}

const splitLines = (text) => {
  if (text === null || text === undefined) return []
  if (text === '') return ['']
  return text.split('\n')
}

const changeTypeLabel = (change) => {
  if (change.before === null) return 'A'
  if (change.after === null) return 'D'
  return 'M'
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function getChainId(options) {
  const chainId = Number(options.chainId ?? mainnet.id)
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('Invalid chain ID')
  }
  return chainId
}

function getMetaContent(html, name) {
  const escaped = escapeRegex(name)
  const nameFirst = new RegExp(`<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i')
  const contentFirst = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${escaped}["'][^>]*>`, 'i')
  return html.match(nameFirst)?.[1] || html.match(contentFirst)?.[1] || null
}

function buildLineDiff(beforeText, afterText) {
  const before = splitLines(beforeText)
  const after = splitLines(afterText)
  const dp = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0))

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      if (before[i] === after[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const operations = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      operations.push({ type: 'context', line: before[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      operations.push({ type: 'delete', line: before[i] })
      i += 1
    } else {
      operations.push({ type: 'add', line: after[j] })
      j += 1
    }
  }

  while (i < before.length) {
    operations.push({ type: 'delete', line: before[i] })
    i += 1
  }

  while (j < after.length) {
    operations.push({ type: 'add', line: after[j] })
    j += 1
  }

  return operations
}

function formatDiff(change) {
  const lines = [
    `diff -- ${change.path}`,
    `--- ${change.before === null ? '/dev/null' : `a/${change.path}`}`,
    `+++ ${change.after === null ? '/dev/null' : `b/${change.path}`}`,
  ]

  if (change.before === null) {
    splitLines(change.after).forEach(line => lines.push(`+${line}`))
    return lines.join('\n')
  }

  if (change.after === null) {
    splitLines(change.before).forEach(line => lines.push(`-${line}`))
    return lines.join('\n')
  }

  buildLineDiff(change.before, change.after).forEach((operation) => {
    if (operation.type === 'context') {
      lines.push(` ${operation.line}`)
    } else if (operation.type === 'delete') {
      lines.push(`-${operation.line}`)
    } else {
      lines.push(`+${operation.line}`)
    }
  })

  return lines.join('\n')
}

function collectErrorText(error, seen = new Set()) {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return String(error)
  if (seen.has(error)) return ''
  seen.add(error)

  const parts = []
  for (const key of ['name', 'shortMessage', 'message', 'details']) {
    const value = error[key]
    if (typeof value === 'string' && value.trim()) {
      parts.push(value)
    }
  }

  if (error.cause) {
    parts.push(collectErrorText(error.cause, seen))
  }

  return parts.filter(Boolean).join('\n')
}

function isUpstreamUnavailableError(error) {
  const text = collectErrorText(error)
  return /(fetch failed|http request failed|failed to fetch|econnrefused|enotfound|eai_again|timed out|timeout|network error|socket hang up|connection refused)/i.test(text)
}

function toFriendlyUpstreamError(error) {
  if (isUpstreamUnavailableError(error)) {
    return new Error('Unable to reach upstream. Upstream might be out of date.')
  }

  return error
}

function normalizeMarkdownPathInput(value) {
  let normalized = normalizeRelativePath(String(value || '').trim())
  normalized = normalized.replace(/^\.\//, '').replace(/^\/+/, '')

  if (normalized === '' || normalized === '.') {
    return 'index.md'
  }

  if (normalized.endsWith('/')) {
    normalized = `${normalized}index.md`
  } else if (path.posix.basename(normalized) !== 'index.md') {
    if (path.posix.extname(normalized)) {
      throw new Error(`Only markdown page paths can be reset: ${value}`)
    }
    normalized = `${normalized}/index.md`
  }

  normalized = path.posix.normalize(normalized)
  if (normalized === '' || normalized === '.') {
    return 'index.md'
  }

  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Invalid file path: ${value}`)
  }

  if (path.posix.basename(normalized) !== 'index.md') {
    throw new Error(`Only markdown page paths can be reset: ${value}`)
  }

  return normalized
}

async function pathExists(targetPath) {
  try {
    await nodeFs.promises.access(targetPath)
    return true
  } catch (_error) {
    return false
  }
}

async function createChainContext(options) {
  const chainId = getChainId(options)
  const rpcUrl = options.rpc || DEFAULT_RPC
  const universalResolver = options.universalResolver || contracts.universalResolver[chainId]
  const client = createPublicClient({
    transport: http(rpcUrl)
  })

  return { chainId, rpcUrl, universalResolver, client }
}

async function createRepoDService(client, options, chainId, universalResolver) {
  const dservice = new DService(TEMPLATE_DOMAIN, {
    apiEndpoint: options.dservice
  })

  await dservice.init(client, { chainId, universalResolver })
  return dservice
}

async function fetchRemoteRepoCarBytes(domain, options) {
  try {
    const { chainId, client, universalResolver } = await createChainContext(options)
    const { cid } = await resolveEnsDomain(client, domain, universalResolver)

    if (!cid) {
      throw new Error(`No upstream contenthash found for ${domain}`)
    }

    const dservice = await createRepoDService(client, options, chainId, universalResolver)
    const response = await dservice.fetch(`/page?cid=${encodeURIComponent(cid.toString())}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch upstream repo: ${response.status} ${response.statusText}`)
    }

    return {
      cid,
      carBytes: new Uint8Array(await response.arrayBuffer())
    }
  } catch (error) {
    throw toFriendlyUpstreamError(error)
  }
}

async function importCarBytes(carBytes, rootCid = null) {
  const car = carFromBytes(carBytes)
  const { fs, blockstore } = emptyUnixfs()

  for (const block of car.blocks) {
    await blockstore.put(block.cid, block.payload)
  }

  return {
    car,
    fs,
    blockstore,
    root: rootCid || car.roots[0]
  }
}

async function readMarkdownMapFromCarBytes(carBytes, rootCid = null) {
  const { car, fs, blockstore, root } = await importCarBytes(carBytes, rootCid)
  const allFiles = await tree(blockstore, root)
  const markdownPaths = allFiles
    .filter(name => name.endsWith('/index.md'))
    .filter(name => !name.startsWith('/_'))
    .map(name => name.slice(1))
    .sort()

  const markdownEntries = await Promise.all(markdownPaths.map(async filePath => [
    filePath,
    await cat(fs, root, filePath)
  ]))

  let domain = null
  try {
    const indexHtml = await cat(fs, root, 'index.html')
    domain = getMetaContent(indexHtml, 'ens-domain')
  } catch (_error) {
    domain = null
  }

  return {
    car,
    root,
    domain,
    markdownMap: new Map(markdownEntries)
  }
}

async function readLocalMarkdownMap(repoRoot) {
  const markdownMap = new Map()

  async function walk(currentDir) {
    const entries = await nodeFs.promises.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue

      const absolutePath = path.join(currentDir, entry.name)
      const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath))

      if (entry.isDirectory()) {
        if (entry.name.startsWith('_')) continue
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile() || entry.name !== 'index.md') continue
      if (relativePath.startsWith('_')) continue

      markdownMap.set(relativePath, await nodeFs.promises.readFile(absolutePath, 'utf8'))
    }
  }

  await walk(repoRoot)
  return markdownMap
}

function compareMarkdownMaps(baseMap, currentMap) {
  const paths = [...new Set([...baseMap.keys(), ...currentMap.keys()])].sort()
  const changes = []

  for (const filePath of paths) {
    const before = baseMap.has(filePath) ? baseMap.get(filePath) : null
    const after = currentMap.has(filePath) ? currentMap.get(filePath) : null
    if (before === after) continue
    changes.push({ path: filePath, before, after })
  }

  return changes
}

async function ensureParentDirectory(filePath) {
  await nodeFs.promises.mkdir(path.dirname(filePath), { recursive: true })
}

async function removeEmptyParents(startDirectory, repoRoot) {
  let currentDirectory = startDirectory
  while (currentDirectory !== repoRoot) {
    const entries = await nodeFs.promises.readdir(currentDirectory)
    if (entries.length > 0) return
    await nodeFs.promises.rmdir(currentDirectory)
    currentDirectory = path.dirname(currentDirectory)
  }
}

async function applyMarkdownState(repoRoot, filePath, content) {
  const absolutePath = path.join(repoRoot, filePath)

  if (content === null) {
    if (!(await pathExists(absolutePath))) return false
    await nodeFs.promises.rm(absolutePath, { force: true })
    await removeEmptyParents(path.dirname(absolutePath), repoRoot)
    return true
  }

  if (await pathExists(absolutePath)) {
    const currentContent = await nodeFs.promises.readFile(absolutePath, 'utf8')
    if (currentContent === content) return false
  }

  await ensureParentDirectory(absolutePath)
  await nodeFs.promises.writeFile(absolutePath, content, 'utf8')
  return true
}

function mergeCarBytes(existingBytes, nextBytes, roots = []) {
  const mergedCar = emptyCar()
  const seen = new Set()
  const rootStrings = new Set()

  const addBlocks = (carBytes) => {
    if (!carBytes || carBytes.length === 0) return
    const parsedCar = carFromBytes(carBytes)
    for (const block of parsedCar.blocks) {
      const cid = block.cid.toString()
      if (seen.has(cid)) continue
      seen.add(cid)
      mergedCar.blocks.put(block)
    }
  }

  addBlocks(existingBytes)
  addBlocks(nextBytes)

  const rootSourceBytes = nextBytes && nextBytes.length > 0 ? nextBytes : existingBytes
  const carRoots = roots.length > 0
    ? roots
    : (rootSourceBytes ? carFromBytes(rootSourceBytes).roots : [])
  for (const root of carRoots) {
    const cid = typeof root === 'string' ? CID.parse(root) : root
    const rootString = cid.toString()
    if (!rootStrings.has(rootString)) {
      rootStrings.add(rootString)
      mergedCar.roots.push(cid)
    }
  }
  return mergedCar.bytes
}

async function findRepoRoot(startDirectory) {
  let currentDirectory = path.resolve(startDirectory)
  while (true) {
    if (await pathExists(getBlocksPath(currentDirectory)) && await pathExists(getStatePath(currentDirectory))) {
      return currentDirectory
    }
    const parentDirectory = path.dirname(currentDirectory)
    if (parentDirectory === currentDirectory) return null
    currentDirectory = parentDirectory
  }
}

async function loadTrackedRepo(startDirectory = process.cwd()) {
  const repoRoot = await findRepoRoot(startDirectory)
  if (!repoRoot) {
    throw new Error('No SimplePage repo found from the current directory')
  }

  const carPath = getBlocksPath(repoRoot)
  const state = await readRepoState(repoRoot)
  const carBytes = await nodeFs.promises.readFile(carPath)
  const snapshot = await readMarkdownMapFromCarBytes(carBytes, CID.parse(state.trackedRootCid))

  return {
    repoRoot,
    carPath,
    state,
    carBytes,
    ...snapshot,
    domain: state.domain || snapshot.domain || path.basename(repoRoot)
  }
}

async function resolveUpstreamStatus(domain, options) {
  try {
    const { client, universalResolver } = await createChainContext(options)
    const upstream = await resolveEnsDomain(client, domain, universalResolver)
    return {
      root: upstream.cid ? upstream.cid.toString() : null,
      unavailable: false
    }
  } catch (error) {
    if (!isUpstreamUnavailableError(error)) {
      throw error
    }

    return {
      root: null,
      unavailable: true
    }
  }
}

function markdownPathToPagePath(filePath) {
  if (filePath === 'index.md') return '/'
  return `/${filePath.replace(/\/index\.md$/, '')}/`
}

function buildDraftsUrl({ domain, chainId }) {
  const gatewaySuffix = Number(chainId) === 11155111 ? '.sepoliaens.eth.link' : '.link'
  const url = new URL(`https://${domain}${gatewaySuffix}/spg-drafts`)
  url.searchParams.set('domain', domain)
  return url.toString()
}

function printChangeSummary(title, changes) {
  if (changes.length === 0) {
    console.log(`${title}: none`)
    return
  }

  console.log(`${title}:`)
  changes.forEach(change => {
    console.log(`${changeTypeLabel(change)} ${change.path}`)
  })
}

async function buildStagedRepoFromMarkdownChanges({ trackedRepo, changes, options }) {
  const { chainId, client, universalResolver } = await createChainContext(options)
  const repo = new Repo(trackedRepo.state.sourceDomain || trackedRepo.domain, new MemoryStorage(), {
    apiEndpoint: options.dservice,
    unixfs: emptyUnixfs(),
  })

  try {
    await repo.init(client, { chainId, universalResolver })
    for (const change of changes) {
      const pagePath = markdownPathToPagePath(change.path)
      if (change.after === null) {
        await repo.deletePage(pagePath)
      } else {
        await repo.setPageEdit(pagePath, change.after, renderMarkdownBody(change.after))
      }
    }

    return await repo.buildStagedCommit(trackedRepo.domain, false, { prepareTx: false })
  } finally {
    await repo.close()
  }
}

async function fetchRepoCarBytesForCid(cid, options) {
  try {
    const { chainId, client, universalResolver } = await createChainContext(options)
    const dservice = await createRepoDService(client, options, chainId, universalResolver)
    const response = await dservice.fetch(`/page?cid=${encodeURIComponent(cid.toString())}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch repo: ${response.status} ${response.statusText}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    throw toFriendlyUpstreamError(error)
  }
}

async function createRepoDserviceFromOptions(options) {
  const { chainId, client, universalResolver } = await createChainContext(options)
  return {
    chainId,
    dservice: await createRepoDService(client, options, chainId, universalResolver),
  }
}

async function writeRepoDirectory({ targetDirectory, domain, sourceDomain = domain, cid, carBytes, markdownMap }) {
  await nodeFs.promises.mkdir(targetDirectory, { recursive: true })
  for (const [filePath, content] of markdownMap.entries()) {
    const absolutePath = path.join(targetDirectory, filePath)
    await ensureParentDirectory(absolutePath)
    await nodeFs.promises.writeFile(absolutePath, content, 'utf8')
  }
  await nodeFs.promises.mkdir(getRepoDataDir(targetDirectory), { recursive: true })
  await nodeFs.promises.writeFile(getBlocksPath(targetDirectory), carBytes)
  await writeRepoState(targetDirectory, createInitialState({ domain, sourceDomain, trackedRootCid: cid }))
}

async function cloneRepoInternal(domain, options) {
  const targetDirectory = path.resolve(process.cwd(), domain)
  if (await pathExists(targetDirectory)) {
    throw new Error(`Target directory already exists: ${targetDirectory}`)
  }

  const { cid, carBytes } = await fetchRemoteRepoCarBytes(domain, options)
  const { markdownMap } = await readMarkdownMapFromCarBytes(carBytes)

  await writeRepoDirectory({ targetDirectory, domain, cid, carBytes, markdownMap })

  console.log(`Cloned ${domain} into ${targetDirectory}`)
  console.log(`Fetched ${markdownMap.size} markdown file${markdownMap.size === 1 ? '' : 's'} at ${cid}`)
}

async function newRepoInternal(domain, options) {
  const targetDirectory = path.resolve(process.cwd(), domain)
  if (await pathExists(targetDirectory)) {
    throw new Error(`Target directory already exists: ${targetDirectory}`)
  }

  const { chainId, client, universalResolver } = await createChainContext(options)
  const dservice = await createRepoDService(client, options, chainId, universalResolver)
  const isExistingSimplePageDeployment = await isSimplePageSiteEns({
    viemClient: client,
    dservice,
    domain,
    universalResolver,
  })
  if (isExistingSimplePageDeployment) {
    throw new Error(`${domain} is already a SimplePage deployment. Use simplepage repo clone ${domain} instead.`)
  }

  const template = await fetchRemoteRepoCarBytes(TEMPLATE_DOMAIN, options)
  const { markdownMap } = await readMarkdownMapFromCarBytes(template.carBytes)
  await writeRepoDirectory({
    targetDirectory,
    domain,
    sourceDomain: TEMPLATE_DOMAIN,
    cid: template.cid,
    carBytes: template.carBytes,
    markdownMap,
  })

  console.log(`Created ${domain} in ${targetDirectory}`)
  console.log(`Based on ${TEMPLATE_DOMAIN} at ${template.cid}`)
  console.log(`Fetched ${markdownMap.size} markdown file${markdownMap.size === 1 ? '' : 's'}`)
}

async function diffRepoInternal() {
  const trackedRepo = await loadTrackedRepo()
  const localMarkdownMap = await readLocalMarkdownMap(trackedRepo.repoRoot)
  const changes = compareMarkdownMaps(trackedRepo.markdownMap, localMarkdownMap)

  if (changes.length === 0) {
    console.log('No local markdown changes.')
    return
  }

  console.log(changes.map(formatDiff).join('\n\n'))
}

async function resetRepoInternal(fileInputs = [], options = {}) {
  const trackedRepo = await loadTrackedRepo()
  const localMarkdownMap = await readLocalMarkdownMap(trackedRepo.repoRoot)
  const changes = compareMarkdownMaps(trackedRepo.markdownMap, localMarkdownMap)
  const changesByPath = new Map(changes.map(change => [change.path, change]))

  if (options.hard) {
    if (fileInputs.length > 0) {
      throw new Error('repo reset --hard cannot be combined with file paths')
    }
    if (changes.length === 0 && !trackedRepo.state.activeDraft) {
      console.log('Already at tracked root.')
      return
    }

    let resetCount = 0
    for (const change of changes) {
      const trackedContent = trackedRepo.markdownMap.has(change.path) ? trackedRepo.markdownMap.get(change.path) : null
      const didReset = await applyMarkdownState(trackedRepo.repoRoot, change.path, trackedContent)
      if (didReset) resetCount += 1
    }
    await writeRepoState(trackedRepo.repoRoot, {
      ...trackedRepo.state,
      activeDraft: null,
    })

    console.log(`Reset working tree to tracked root (${trackedRepo.root.toString()}).`)
    console.log(`Reset ${resetCount} markdown file${resetCount === 1 ? '' : 's'}.`)
    return
  }

  let targetPaths
  if (fileInputs.length === 0) {
    targetPaths = changes.map(change => change.path)
    if (targetPaths.length === 0) {
      console.log('No local markdown changes to reset.')
      return
    }
  } else {
    const knownPaths = new Set([...trackedRepo.markdownMap.keys(), ...localMarkdownMap.keys()])
    targetPaths = [...new Set(fileInputs.map(normalizeMarkdownPathInput))]

    const unknownPaths = targetPaths.filter(filePath => !knownPaths.has(filePath))
    if (unknownPaths.length > 0) {
      throw new Error(`No markdown page found for ${unknownPaths[0]}`)
    }

    targetPaths = targetPaths.filter(filePath => changesByPath.has(filePath))
    if (targetPaths.length === 0) {
      console.log('Specified files already match the tracked root.')
      return
    }
  }

  let resetCount = 0
  for (const filePath of targetPaths) {
    const trackedContent = trackedRepo.markdownMap.has(filePath) ? trackedRepo.markdownMap.get(filePath) : null
    const didReset = await applyMarkdownState(trackedRepo.repoRoot, filePath, trackedContent)
    if (didReset) resetCount += 1
  }

  console.log(`Reset ${resetCount} markdown file${resetCount === 1 ? '' : 's'} to tracked root.`)
  targetPaths.forEach(filePath => {
    console.log(filePath)
  })
}

async function statusRepoInternal(options) {
  const trackedRepo = await loadTrackedRepo()
  const localMarkdownMap = await readLocalMarkdownMap(trackedRepo.repoRoot)
  const localChanges = compareMarkdownMaps(trackedRepo.markdownMap, localMarkdownMap)

  const upstream = await resolveUpstreamStatus(trackedRepo.domain, options)
  const upstreamRoot = upstream.root
  const trackedRoot = trackedRepo.root.toString()
  const activeDraft = trackedRepo.state.activeDraft
    ? trackedRepo.state.drafts?.[trackedRepo.state.activeDraft]
    : null

  console.log(`Domain: ${trackedRepo.domain}`)
  console.log(`Tracked root: ${trackedRoot}`)
  console.log(`Upstream root: ${upstream.unavailable ? 'unavailable' : (upstreamRoot || 'missing')}`)
  console.log(`Upstream changes: ${upstream.unavailable ? UPSTREAM_STATUS_UNKNOWN : (upstreamRoot && upstreamRoot !== trackedRoot ? 'available' : 'none')}`)

  if (activeDraft) {
    console.log(`Active draft: ${activeDraft.refId} v${activeDraft.sequence} ${activeDraft.contentCid}`)
    if (activeDraft.baseRootCid && activeDraft.baseRootCid !== trackedRoot) {
      console.log(`Draft base root: ${activeDraft.baseRootCid} (differs from tracked root)`)
    }

    let draftSnapshot = null
    try {
      draftSnapshot = await readMarkdownMapFromCarBytes(trackedRepo.carBytes, CID.parse(activeDraft.contentCid))
    } catch (_error) {
      console.log('Draft blocks: missing from local block archive')
    }

    if (draftSnapshot) {
      printChangeSummary('Changes pushed as draft', compareMarkdownMaps(trackedRepo.markdownMap, draftSnapshot.markdownMap))
      printChangeSummary('Changes not pushed as draft', compareMarkdownMaps(draftSnapshot.markdownMap, localMarkdownMap))
      return
    }
  }

  if (localChanges.length === 0) {
    console.log('Local markdown changes: none')
    return
  }

  console.log('Local markdown changes:')
  localChanges.forEach(change => {
    console.log(`${changeTypeLabel(change)} ${change.path}`)
  })
}

async function pullRepoInternal(options) {
  const trackedRepo = await loadTrackedRepo()
  const { cid: upstreamCid, carBytes: upstreamCarBytes } = await fetchRemoteRepoCarBytes(trackedRepo.domain, options)
  const upstreamRoot = upstreamCid.toString()
  const trackedRoot = trackedRepo.root.toString()

  if (upstreamRoot === trackedRoot) {
    console.log('Already up to date.')
    return
  }

  const upstreamSnapshot = await readMarkdownMapFromCarBytes(upstreamCarBytes)
  const localMarkdownMap = await readLocalMarkdownMap(trackedRepo.repoRoot)
  const upstreamChanges = compareMarkdownMaps(trackedRepo.markdownMap, upstreamSnapshot.markdownMap)

  let appliedCount = 0
  const conflicts = []

  for (const change of upstreamChanges) {
    const baseContent = trackedRepo.markdownMap.has(change.path) ? trackedRepo.markdownMap.get(change.path) : null
    const localContent = localMarkdownMap.has(change.path) ? localMarkdownMap.get(change.path) : null
    const remoteContent = upstreamSnapshot.markdownMap.has(change.path) ? upstreamSnapshot.markdownMap.get(change.path) : null
    const localChanged = localContent !== baseContent

    if (localChanged && localContent !== remoteContent) {
      conflicts.push(change.path)
      continue
    }

    const didApply = await applyMarkdownState(trackedRepo.repoRoot, change.path, remoteContent)
    if (didApply) appliedCount += 1
  }

  const mergedCarBytes = mergeCarBytes(trackedRepo.carBytes, upstreamCarBytes, [upstreamCid])
  await nodeFs.promises.writeFile(trackedRepo.carPath, mergedCarBytes)
  const nextState = {
    ...trackedRepo.state,
    trackedRootCid: upstreamRoot,
  }
  const activeDraft = nextState.activeDraft ? nextState.drafts?.[nextState.activeDraft] : null
  if (activeDraft?.contentCid === upstreamRoot) {
    nextState.activeDraft = null
  }
  await writeRepoState(trackedRepo.repoRoot, nextState)

  console.log(`Updated tracked root from ${trackedRoot} to ${upstreamRoot}`)
  console.log(`Applied ${appliedCount} upstream markdown change${appliedCount === 1 ? '' : 's'}`)

  if (conflicts.length === 0) {
    console.log('No conflicts.')
    return
  }

  console.log('Conflicts left as local changes:')
  conflicts.forEach(filePath => {
    console.log(`M ${filePath}`)
  })
}

async function pushRepoDraftInternal(refId, options) {
  const trackedRepo = await loadTrackedRepo()
  const localMarkdownMap = await readLocalMarkdownMap(trackedRepo.repoRoot)
  const changes = compareMarkdownMaps(trackedRepo.markdownMap, localMarkdownMap)

  if (changes.length === 0) {
    console.log('No local markdown changes to push as a draft.')
    return
  }

  const upstream = await resolveUpstreamStatus(trackedRepo.domain, options)
  if (upstream.unavailable) {
    throw new Error('Unable to verify upstream root. Try again when upstream is reachable.')
  }
  const isTemplateBasedRepo = trackedRepo.state.sourceDomain === TEMPLATE_DOMAIN
  if (!upstream.root && !isTemplateBasedRepo) {
    throw new Error(`No upstream contenthash found for ${trackedRepo.domain}`)
  }
  if (upstream.root && upstream.root !== trackedRepo.root.toString()) {
    let allowMismatchedUpstream = false
    if (isTemplateBasedRepo) {
      const { chainId, client, universalResolver } = await createChainContext(options)
      const dservice = await createRepoDService(client, options, chainId, universalResolver)
      const existingSimplePageDeployment = await isSimplePageSiteEns({
        viemClient: client,
        dservice,
        domain: trackedRepo.domain,
        universalResolver,
      })
      if (!existingSimplePageDeployment) {
        allowMismatchedUpstream = true
      }
    }
    if (!allowMismatchedUpstream) {
      throw new Error(`Tracked root is behind upstream. Run simplepage repo pull before pushing a draft.`)
    }
  }

  const staged = await buildStagedRepoFromMarkdownChanges({ trackedRepo, changes, options })
  const { chainId, dservice } = await createRepoDserviceFromOptions(options)
  const { ref, didKey, agentName, statePath } = await storeSignedRef({
    dservice,
    domain: trackedRepo.domain,
    refId,
    contentCid: staged.cid,
    blocks: staged.car.blocks,
  })

  const mergedCarBytes = mergeCarBytes(trackedRepo.carBytes, staged.car.bytes, [staged.cid])
  await nodeFs.promises.writeFile(trackedRepo.carPath, mergedCarBytes)
  await writeRepoState(trackedRepo.repoRoot, {
    ...trackedRepo.state,
    activeDraft: ref.refId,
    drafts: {
      ...(trackedRepo.state.drafts || {}),
      [ref.refId]: {
        refId: ref.refId,
        sequence: ref.sequence,
        contentCid: ref.contentCid,
        baseRootCid: trackedRepo.root.toString(),
        createdAt: new Date().toISOString(),
        agentName,
        didKey,
      },
    },
  })

  printStoredRef({ domain: trackedRepo.domain, ref, didKey, agentName, statePath })
  console.log(`Review: ${buildDraftsUrl({ domain: trackedRepo.domain, chainId })}`)
}

async function checkoutRepoDraftInternal(refId, options) {
  const trackedRepo = await loadTrackedRepo()
  const { dservice } = await createRepoDserviceFromOptions(options)
  const refs = await listRefs({ dservice, domain: trackedRepo.domain })
  const draft = refs
    .filter(entry => entry.refId === refId)
    .sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0))[0]

  if (!draft) {
    throw new Error(`No draft named ${refId} found for ${trackedRepo.domain}`)
  }

  const draftCid = CID.parse(draft.contentCid)
  const draftCarBytes = await fetchRepoCarBytesForCid(draftCid, options)
  const draftSnapshot = await readMarkdownMapFromCarBytes(draftCarBytes, draftCid)
  if (!draftSnapshot.markdownMap.has('index.md')) {
    throw new Error(`Draft ${refId} is not a SimplePage repo root`)
  }

  const localMarkdownMap = await readLocalMarkdownMap(trackedRepo.repoRoot)
  const paths = [...new Set([...localMarkdownMap.keys(), ...draftSnapshot.markdownMap.keys()])].sort()
  let appliedCount = 0
  for (const filePath of paths) {
    const nextContent = draftSnapshot.markdownMap.has(filePath) ? draftSnapshot.markdownMap.get(filePath) : null
    const didApply = await applyMarkdownState(trackedRepo.repoRoot, filePath, nextContent)
    if (didApply) appliedCount += 1
  }

  const mergedCarBytes = mergeCarBytes(trackedRepo.carBytes, draftCarBytes, [draftCid])
  await nodeFs.promises.writeFile(trackedRepo.carPath, mergedCarBytes)
  await writeRepoState(trackedRepo.repoRoot, {
    ...trackedRepo.state,
    activeDraft: draft.refId,
    drafts: {
      ...(trackedRepo.state.drafts || {}),
      [draft.refId]: {
        refId: draft.refId,
        sequence: draft.sequence,
        contentCid: draft.contentCid,
        baseRootCid: trackedRepo.state.drafts?.[draft.refId]?.baseRootCid || trackedRepo.root.toString(),
        createdAt: draft.issuedAt || new Date().toISOString(),
        agentName: draft.agentName,
        didKey: draft.didKey,
      },
    },
  })

  console.log(`Checked out draft ${draft.refId} v${draft.sequence} (${draft.contentCid}).`)
  console.log(`Applied ${appliedCount} markdown file${appliedCount === 1 ? '' : 's'}.`)
}

async function runCommand(handler) {
  try {
    await handler()
  } catch (error) {
    console.error('Error:', error.message)
    process.exitCode = 1
  }
}

export async function cloneRepo(domain, options) {
  await runCommand(() => cloneRepoInternal(domain, options))
}

export async function newRepo(domain, options) {
  await runCommand(() => newRepoInternal(domain, options))
}

export async function diffRepo() {
  await runCommand(() => diffRepoInternal())
}

export async function resetRepo(files, options) {
  await runCommand(() => resetRepoInternal(files, options))
}

export async function statusRepo(options) {
  await runCommand(() => statusRepoInternal(options))
}

export async function pullRepo(options) {
  await runCommand(() => pullRepoInternal(options))
}

export async function pushRepoDraft(refId, options) {
  await runCommand(() => pushRepoDraftInternal(refId, options))
}

export async function checkoutRepoDraft(refId, options) {
  await runCommand(() => checkoutRepoDraftInternal(refId, options))
}
