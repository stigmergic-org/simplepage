import { SubscriptionIndex } from '../../src/services/ipfs/subscriptionIndex.js'

const createMfs = (content) => ({
  readFile: async () => content,
  ensureDomain: async () => {},
  writeFile: async () => {},
  getDomainDir: async (domain) => `/domains/${domain}`,
  listDomains: async () => []
})

describe('SubscriptionIndex', () => {
  it('treats a missing subscription file as absent', async () => {
    const index = new SubscriptionIndex({ mfs: createMfs(null) })

    const result = await index.readSubscription('example.eth')

    expect(result).toEqual({ exists: false, units: null })
  })
})
