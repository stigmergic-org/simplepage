import { IpfsService } from './services/ipfs.js'

// ENS domain validation regex
const ENS_DOMAIN_REGEX = /^[a-z0-9-]+\.eth$/

export async function handleListCommand(type, action, name, ipfsApiUrl) {
  const logger = { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} };
  const ipfs = new IpfsService({ api: ipfsApiUrl, logger });
  const healthy = await ipfs.healthCheck()
  if (!healthy) {
    console.error('Cannot connect to IPFS node, exiting...')
    process.exit(1)
  }

  try {
    switch (action) {
      case 'show':
        const list = await ipfs.getList(type, 'string')
        console.log(`${type} list:`, list || [])
        break
      case 'add':
        if (!name) {
          console.error('Name is required for add action')
          process.exit(1)
        }
        if (!ENS_DOMAIN_REGEX.test(name)) {
          console.error('Name must be a valid ENS domain (e.g., example.eth)')
          process.exit(1)
        }
        await ipfs.addToList(type, 'string', name)
        console.log(`Added ${name} to ${type} list`)
        break
      case 'rm':
        if (!name) {
          console.error('Name is required for rm action')
          process.exit(1)
        }
        await ipfs.removeFromList(type, 'string', name)
        console.log(`Removed ${name} from ${type} list`)
        break
      default:
        console.error('Invalid action. Use show, add, or rm')
        process.exit(1)
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
  process.exit(0)
} 