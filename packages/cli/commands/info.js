import { createPublicClient, http, keccak256, toHex } from 'viem'
import { mainnet } from 'viem/chains'
import { contracts, resolveEnsDomain } from '@simplepg/common'

const MAINNET_RPC = 'https://ethereum-rpc.publicnode.com'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'


export async function info(domain, options) {
  const chainId = options.chainId || mainnet.id
  const rpcUrl = options.rpc || (chainId === mainnet.id ? MAINNET_RPC : SEPOLIA_RPC)
  const universalResolver = options.universalResolver || contracts.universalResolver[chainId]
  const simplepage = options.simplepage || contracts.deployments[chainId]?.SimplePage

  const client = createPublicClient({
    transport: http(rpcUrl)
  })

  try {
    // Calculate page ID
    const pageId = BigInt(keccak256(toHex(domain)))

    const result = await resolveEnsDomain(client, domain, universalResolver)
    const { cid } = result

    console.log(`\n=== ${domain} ===`)

    // Get page data and owner
    const [pageData, owner] = await Promise.all([
      client.readContract({
        address: simplepage,
        abi: contracts.abis.SimplePage,
        functionName: 'getPageData',
        args: [pageId]
      }).catch(() => null),
      client.readContract({
        address: simplepage,
        abi: contracts.abis.SimplePage,
        functionName: 'ownerOf',
        args: [pageId]
      }).catch(() => null)
    ])

    
    if (!pageData || !owner) {
      console.log('No existing subscription...')
    } else {
      pageData.units.forEach((unit, index) => {
        const expiryDate = new Date(Number(unit) * 1000)
        const isExpired = expiryDate < new Date()
        const status = isExpired ? 'EXPIRED' : 'ACTIVE'
        const localTime = expiryDate.toLocaleString('sv-SE', { 
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone 
        })
        console.log(`Unit #${index} - ${status}${isExpired ? '' : ', until ' + localTime}`)
      })
      console.log(`\nLatest sponsor: ${owner}`)
    }
    if (cid) {
      console.log(`Content hash: ipfs://${cid.toString()}`)
    }
    console.log(`\n`)

  } catch (error) {
    console.error('Error:', error.message)
  }
} 