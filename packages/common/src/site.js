import * as dagPb from '@ipld/dag-pb'
import { CID } from 'multiformats/cid'

import { resolveEnsDomain } from './ens.js'

export const SIMPLEPAGE_SITE_FILES = [
  'index.md',
  'index.html',
  '_template.html',
  '_redirects',
]

const normalizeCid = (cid) => {
  if (typeof cid === 'string') {
    return CID.parse(cid)
  }
  const normalizedCid = CID.asCID(cid)
  if (!normalizedCid) {
    throw new Error('Input must be a valid CID')
  }
  return normalizedCid
}

const getRootLinks = async ({ dservice, cid }) => {
  const root = normalizeCid(cid)
  if (root.code !== dagPb.code) {
    return null
  }

  const response = await dservice.fetch(`/file?cid=${encodeURIComponent(root.toString())}`)
  if (!response.ok) {
    return null
  }

  return dagPb.decode(new Uint8Array(await response.arrayBuffer())).Links
}

export async function isSimplePageSiteCid({ dservice, cid }) {
  try {
    const rootLinks = await getRootLinks({ dservice, cid })
    if (!rootLinks) {
      return false
    }

    const rootFileNames = new Set(rootLinks.map(link => link.Name))
    return SIMPLEPAGE_SITE_FILES.every(path => rootFileNames.has(path))
  } catch (_error) {
    return false
  }
}

export async function isSimplePageSiteEns({ viemClient, dservice, domain, universalResolver }) {
  try {
    const result = await resolveEnsDomain(viemClient, domain, universalResolver)
    if (!result.cid) {
      return false
    }
    return isSimplePageSiteCid({ dservice, cid: result.cid })
  } catch (_error) {
    return false
  }
}
