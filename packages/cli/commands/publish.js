import { globSource } from '@helia/unixfs'
import { createPublicClient, http, keccak256, toHex } from 'viem'
import { mainnet } from 'viem/chains'
import all from 'it-all'
import nodeFs from 'fs'

import { contracts, emptyUnixfs, emptyCar, walkDag, DService } from '@simplepg/common'


const SIMPLEPAGE_DSERVICE = 'new.simplepage.eth'
const CHAIN_ID = 1
const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com'


async function checkSubscription(domain, rpcUrl, simplepage) {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl)
  })

  try {
    // Try to get page data
    const pageId = BigInt(keccak256(toHex(domain)))
    const pageData = await client.readContract({
      address: simplepage,
      abi: contracts.abis.SimplePage,
      functionName: 'getPageData',
      args: [pageId]
    })

    // Check if any subscription units are still active
    const now = Math.floor(Date.now() / 1000)
    const hasActiveUnit = pageData.units.some(unit => Number(unit) > now)
    
    if (!hasActiveUnit) {
      throw new Error('Subscription expired')
    }

    return true
  } catch (error) {
    console.error('\nNo active subscription found.')
    console.error(`\nTo subscribe, visit:`)
    console.error(`https://simplepage.eth.link/spg-subscription/?domain=${domain}`)
    process.exit(1)
  }
}

export async function publish(domain, path, options) {
  const chainId = options.chainId || CHAIN_ID
  const rpcUrl = options.rpc || DEFAULT_RPC
  const dserviceUrl = options.dservice
  const simplepage = options.simplepage || contracts.deployments[chainId].SimplePage
  const universalResolver = options.universalResolver || contracts.universalResolver[chainId]

  // Create viem client
  const client = createPublicClient({
    transport: http(rpcUrl)
  })

  // Initialize DService
  const dservice = new DService(SIMPLEPAGE_DSERVICE, {
    apiEndpoint: dserviceUrl
  })
  
  await dservice.init(client, { chainId, universalResolver })

  // Check subscription first
  await checkSubscription(domain, rpcUrl, simplepage)
  
  // Setup blockstore and unixfs
  const { fs, blockstore } = emptyUnixfs()

  // check if path is a file
  const isFile = nodeFs.statSync(path).isFile()
  
  let root
  if (isFile) {
    // For single file, read the file content directly
    const fileContent = nodeFs.readFileSync(path)
    
    // Add the file content as raw bytes - this creates a CID that resolves directly to the content
    const cid = await fs.addBytes(fileContent)
    root = cid
  } else {
    // Multiple files - create directory structure
    // Use globSource to add files
    const glob = globSource(path, '**/*')
    
    // Collect all entries
    const entries = await all(glob)
    const firstEntry = entries[0]

    if (entries.length === 0) {
      throw new Error('No files found')
    }

    // Multiple files - create directory structure
    root = await fs.addDirectory()
    for await (const entry of fs.addAll(entries)) {
      entry.path = entry.path.startsWith('/') ? entry.path.slice(1) : entry.path
      if (entry.path.split('/').length === 1) {
        root = await fs.cp(entry.cid, root, entry.path)
      }
    }
  }

  // Create CAR file
  const car = emptyCar()
  car.roots.push(root)

  // Walk the DAG and add all blocks to CAR
  const blocks = await walkDag(blockstore, root)
  for (const block of blocks) {
    car.blocks.put(block)
  }
  
  // Upload to API using DService
  const formData = new FormData()
  formData.append('file', new Blob([car.bytes], {
    type: 'application/vnd.ipld.car',
  }), 'site.car');
  
  const response = await dservice.fetch(`/page?domain=${domain}`, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`)
  }
  
  const { cid } = await response.json()
  
  console.log(`\nSuccessfully published content for ${domain}!`)
  console.log(`Preview: https://${cid}.ipfs.inbrowser.link`)
  console.log(`Explore: https://explore.ipld.io/#/explore/${cid}`)
  console.log(`\nTo update your ENS name, set your contenthash to this url within 1 hour:`)
  console.log(`ipfs://${cid}`)
  console.log(`\n`)
  console.log(`You can update your ENS name here:`)
  console.log(`https://app.ens.domains${domain}?tab=records`)
  console.log(`\n`)
} 