import { MfsStore } from '../../src/services/ipfs/mfsStore.js'

const createClient = () => ({
  files: {
    stat: async () => ({ cid: { equals: () => true } }),
    mkdir: async () => {},
    ls: async function * () {
      yield { name: 'example.eth' }
      yield { name: 'sub%2Fexample.eth' }
    },
  },
  pin: {
    ls: async function * () {},
    add: async () => {},
  },
})

describe('MfsStore', () => {
  it('encodes domain path segments and rejects path separators', async () => {
    const store = new MfsStore({
      client: createClient(),
      namespace: 'test',
      rootPinName: 'root',
    })

    await expect(store.getDomainDir('sub.example.eth')).resolves.toBe('/spg-data/test/domains/sub.example.eth')
    await expect(store.getDomainDir('sub/example.eth')).rejects.toThrow('Invalid domain')
    await expect(store.getDomainRefsDir('../example.eth')).rejects.toThrow('Invalid domain')
  })

  it('decodes listed domain path segments', async () => {
    const store = new MfsStore({
      client: createClient(),
      namespace: 'test',
      rootPinName: 'root',
    })

    await expect(store.listDomains()).resolves.toEqual(['example.eth', 'sub/example.eth'])
  })
})
