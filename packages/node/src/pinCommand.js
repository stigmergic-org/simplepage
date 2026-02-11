import { IpfsService } from './services/ipfs.js'

export async function handlePinCommand(ipfsApiUrl, chainId) {
  const logger = { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }
  const ipfs = new IpfsService({ api: ipfsApiUrl, logger, namespace: chainId })
  const healthy = await ipfs.healthCheck()
  if (!healthy) {
    console.error('Cannot connect to IPFS node, exiting...')
    process.exit(1)
  }

  try {
    const failures = await ipfs.listFailedPins()
    console.log('Failed pins:', failures)
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
  process.exit(0)
}
