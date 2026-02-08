import { IpfsService } from '../../src/services/ipfs.js'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { CARFactory } from 'cartonne'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagPb from '@ipld/dag-pb'
import * as raw from 'multiformats/codecs/raw'
import { CID } from 'multiformats/cid'
import { identity } from 'multiformats/hashes/identity'
import { TestEnvironmentKubo } from '@simplepg/test-utils'
import all from 'it-all'


describe('IpfsService', () => {
  let testEnvKubo
  let ipfsService
  let kuboApi

  const mockLogger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: () => {},
  }

  const txHashFor = value => `0x${value.toString(16).padStart(64, '0')}`

  function stat(cid) {
    return kuboApi.block.stat(cid, { offline: true })
  }

  async function readUnixFsFile(cid) {
    const chunks = await all(kuboApi.cat(cid))
    return uint8ArrayToString(Buffer.concat(chunks))
  }

  async function collectUnixFsCids(rootCid) {
    const map = new Map()
    async function walk(cid, basePath) {
      map.set(basePath, cid)
      for await (const entry of kuboApi.ls(cid)) {
        const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name
        map.set(entryPath, entry.cid)
        if (entry.type === 'dir') {
          await walk(entry.cid, entryPath)
        }
      }
    }
    await walk(rootCid, '')
    return map
  }

  async function createUnixFsCar(files) {
    const entries = Object.entries(files).map(([path, content]) => ({
      path,
      content: Buffer.from(content)
    }))
    let rootCid
    for await (const result of kuboApi.addAll(entries, {
      wrapWithDirectory: true,
      cidVersion: 1,
      rawLeaves: true,
      mtime: { secs: 0, nsecs: 0 }
    })) {
      if (result.path === '') {
        rootCid = result.cid
      }
    }
    const carBuffer = Buffer.concat(await all(kuboApi.dag.export(rootCid)))
    const pathToCid = await collectUnixFsCids(rootCid)
    return { rootCid, carBuffer, pathToCid }
  }

  beforeAll(async () => {
    testEnvKubo = new TestEnvironmentKubo()
    kuboApi = await testEnvKubo.start()
    
    ipfsService = new IpfsService({ ipfsClient: kuboApi, logger: mockLogger })
    // ipfsService.client = kuboApi
  }, 30000)

  afterAll(async () => {
    await testEnvKubo.stop()
  })

  it('healthCheck: should return true when IPFS node is running', async () => {
    const result = await ipfsService.healthCheck()
    expect(result).toBe(true)
  })

  it('writeCar: should write multiple files and verify them', async () => {
    const files = {
      'index.html': '<html>Test</html>',
      'index.md': '# Test',
      'data.json': '{"hello": "world"}',
      '_template.html': '<template>Test</template>'
    }
    
    const { rootCid, carBuffer, pathToCid } = await createUnixFsCar(files)
    
    // Write content using the service
    const returnedCid = await ipfsService.stageCar(carBuffer, 'test-domain.eth')
    expect(returnedCid).toBeTruthy()
    expect(returnedCid.toString()).toBe(rootCid.toString())

    // Verify the directory block exists in IPFS
    const exists = await kuboApi.block.stat(returnedCid)
    expect(exists).toBeTruthy()

    // Verify all file blocks exist in IPFS
    for (const name of Object.keys(files)) {
      const fileCid = pathToCid.get(name)
      const fileExists = await kuboApi.block.stat(fileCid.toString())
      expect(fileExists).toBeTruthy()
    }

    const stagedEntries = await ipfsService.listStaged('test-domain.eth')
    expect(stagedEntries.length).toBe(1)
    expect(stagedEntries[0].cid).toBe(returnedCid.toString())

    // Verify all files exist and have correct content
    for (const [name, content] of Object.entries(files)) {
      const fileCid = pathToCid.get(name)
      const fileExists = await kuboApi.block.stat(fileCid.toString())
      expect(fileExists).toBeTruthy()
      const retrievedContent = await readUnixFsFile(fileCid)
      expect(retrievedContent).toBe(content)
    }

    const listedFiles = []
    for await (const entry of kuboApi.ls(returnedCid)) {
      listedFiles.push(entry.name)
    }
    expect(listedFiles.sort()).toEqual(Object.keys(files).sort())
  })

  it('readCarLite: should read only index files from a directory', async () => {
    // Create a test directory structure
    const files = {
      'index.html': '<html>Test</html>',
      'index.md': '# Test',
      'ignored.txt': 'Should not be included',
      '_template.html': '<template>Test</template>'
    }

    // Add files to IPFS
    const entries = []
    for (const [name, content] of Object.entries(files)) {
      entries.push({
        path: name,
        content: Buffer.from(content)
      })
    }

    // Add directory to IPFS
    let dirCid
    for await (const result of kuboApi.addAll(entries, { wrapWithDirectory: true, cidVersion: 1 })) {
      if (result.path === '') { // This is the root directory
        dirCid = result.cid.toString()
      }
    }

    // Read using readCarLite
    const carBuffer = await ipfsService.readCarLite(dirCid)
    expect(carBuffer).toBeTruthy()
    
    // Create a new CAR reader to verify contents
    const factory = new CARFactory()
    factory.codecs.add(dagCbor)
    factory.codecs.add(dagPb)
    factory.codecs.add(raw)
    
    const car = await factory.fromBytes(carBuffer)
    expect(car.roots[0].toString()).toBe(dirCid)
    expect(car.roots.length).toBe(1)
    let blockCount = 0
    for (const block of car.blocks) {
      blockCount++
    }
    expect(blockCount).toBe(5)
    
    // Get the root block
    const rootData = await car.get(car.roots[0])
    
    // Verify only index files are in the directory
    const fileNames = []
    for (const link of rootData.Links) {
      fileNames.push(link.Name)
    }
    expect(fileNames.sort()).toEqual(['index.html', 'index.md', 'ignored.txt', '_template.html'].sort())
    
    // Verify each file's content
    for (const link of rootData.Links) {
      if (['index.html', 'index.md', '_template.html'].includes(link.Name)) {
        const fileBlock = await car.get(link.Hash)
        const content = uint8ArrayToString(fileBlock)
        expect(content).toBe(files[link.Name])
      }
    }
  })

  it('finalizePage: should create and preserve finalizations for each block number', async () => {
    const domain = 'test-domain2.eth'
    const blockNumbers = [12345, 12346, 12347]
    const versions = []
    
    // Create first version with shared content
    const sharedContent = 'Shared content'
    const oldFiles = {
      'index.html': '<html>Old</html>',
      'shared.txt': sharedContent
    }
    
    const oldCarData = await createUnixFsCar(oldFiles)
    const oldStagedCid = await ipfsService.stageCar(oldCarData.carBuffer, domain)
    expect(oldStagedCid.toString()).toBe(oldCarData.rootCid.toString())
    await ipfsService.finalizePage(oldStagedCid, domain, blockNumbers[0], txHashFor(blockNumbers[0]))
    versions.push({
      blockNumber: blockNumbers[0],
      cid: oldStagedCid,
      pathToCid: oldCarData.pathToCid
    })
    
    // Create and finalize additional versions
    for (let i = 1; i < blockNumbers.length; i++) {
      const blockNumber = blockNumbers[i]
      const files = {
        'index.html': `<html>Version ${blockNumber}</html>`,
        'shared.txt': sharedContent, // Keep shared content
        'data.json': `{"version": ${blockNumber}}`
      }
      
      const carData = await createUnixFsCar(files)
      const stagedCid = await ipfsService.stageCar(carData.carBuffer, domain)
      expect(stagedCid.toString()).toBe(carData.rootCid.toString())
      await ipfsService.finalizePage(stagedCid, domain, blockNumber, txHashFor(blockNumber))
      versions.push({ blockNumber, cid: stagedCid, pathToCid: carData.pathToCid })
    }
    
    const finalizations = await ipfsService.getFinalizations(domain)
    expect(finalizations.length).toBe(blockNumbers.length)
    
    // Verify each finalization exists with correct block number and CID
    for (const version of versions) {
      const blockNumber = version.blockNumber
      const expectedCid = version.cid
      
      const finalization = finalizations.find(f => f.blockNumber === blockNumber)
      expect(finalization).toBeTruthy()
      expect(finalization.cid.toString()).toEqual(expectedCid.toString())
      
      const indexCid = version.pathToCid.get('index.html')
      const indexContent = await readUnixFsFile(indexCid)
      if (blockNumber === blockNumbers[0]) {
        expect(indexContent).toBe('<html>Old</html>')
      } else {
        expect(indexContent).toBe(`<html>Version ${blockNumber}</html>`)
      }

      const sharedCid = version.pathToCid.get('shared.txt')
      const sharedContentText = await readUnixFsFile(sharedCid)
      expect(sharedContentText).toBe('Shared content')

      if (blockNumber !== blockNumbers[0]) {
        const dataCid = version.pathToCid.get('data.json')
        const dataContent = await readUnixFsFile(dataCid)
        expect(dataContent).toBe(`{"version": ${blockNumber}}`)
      }
    }
  })

  it('pruneStaged: should remove old staged pins but keep recent ones', async () => {
    const domain1 = 'prune-domain1.eth'
    const domain2 = 'prune-domain2.eth'
    
    const carData1 = await createUnixFsCar({ 'file.txt': 'content1' })
    const carData2 = await createUnixFsCar({ 'file.txt': 'content2' })
    const rootCid1 = carData1.rootCid
    const rootCid2 = carData2.rootCid
    
    // Create service with 1 hour max age
    const ipfsServiceWithPrune = new IpfsService({ 
      ipfsClient: kuboApi,
      maxStagedAge: 60 * 60, // 1 hour in seconds
      logger: mockLogger
    })
    ipfsServiceWithPrune.client = kuboApi
    
    const now = Math.floor(Date.now() / 1000)
    const twoHoursAgo = now - (2 * 60 * 60)
    const recentTimestamp = now - (30 * 60)
    await ipfsServiceWithPrune.recordStaged({ domain: domain1, timestamp: twoHoursAgo, cid: rootCid1 })
    await ipfsServiceWithPrune.recordStaged({ domain: domain2, timestamp: recentTimestamp, cid: rootCid2 })
    
    // Run prune
    await ipfsServiceWithPrune.pruneStaged()
    
    const oldEntries = await ipfsServiceWithPrune.listStaged(domain1)
    expect(oldEntries.length).toBe(0)

    const recentEntries = await ipfsServiceWithPrune.listStaged(domain2)
    expect(recentEntries.length).toBe(1)
  }, 30000)

  it('isPageFinalized: should correctly check if a page is finalized', async () => {
    const domain = 'test-domain3.eth'
    const blockNumber = 12345
    
    const carData = await createUnixFsCar({ 'file.txt': 'content' })
    const stagedCid = await ipfsService.stageCar(carData.carBuffer, domain)
    await ipfsService.finalizePage(stagedCid, domain, blockNumber, txHashFor(blockNumber))
    
    // Check if page is finalized
    const isFinalized = await ipfsService.isPageFinalized(stagedCid, domain, txHashFor(blockNumber))
    expect(isFinalized).toBe(true)
    
    // Check with wrong CID
    const wrongCid = CID.create(1, 0x55, identity.digest(new Uint8Array([0x01, 0x02, 0x03])))
    const isWrongFinalized = await ipfsService.isPageFinalized(wrongCid, domain, txHashFor(blockNumber))
    expect(isWrongFinalized).toBe(false)
  })

  describe('nukePage', () => {
    it('should remove all finalizations for the given domain', async () => {
      const domain = 'test-prune-domain.eth'
      const blockNumbers = [100, 101, 102]
      
      for (const blockNumber of blockNumbers) {
        const carData = await createUnixFsCar({
          'content.txt': `Content for block ${blockNumber}`
        })
        const stagedCid = await ipfsService.stageCar(carData.carBuffer, domain)
        await ipfsService.finalizePage(stagedCid, domain, blockNumber, txHashFor(blockNumber))
      }
      
      // Verify finalizations exist before pruning
      const finalizationsBefore = await ipfsService.getFinalizations(domain)
      expect(finalizationsBefore.length).toBe(blockNumbers.length)
      
      // Prune the page
      await ipfsService.nukePage(domain)
      
      // Verify finalizations are removed
      const finalizationsAfter = await ipfsService.getFinalizations(domain)
      expect(finalizationsAfter.length).toBe(0)
    })

    it('should remove finalized and staged entries for the domain', async () => {
      const domain = 'test-prune-blocks.eth'
      const blockNumber = 200
      
      const carData = await createUnixFsCar({
        'directory/file.txt': 'Shared file content'
      })

      const stagedCid = await ipfsService.stageCar(carData.carBuffer, domain)
      await ipfsService.finalizePage(stagedCid, domain, blockNumber, txHashFor(blockNumber))
      
      // Prune the page
      await ipfsService.nukePage(domain)

      const finalizations = await ipfsService.getFinalizations(domain)
      expect(finalizations.length).toBe(0)

      const stagedEntries = await ipfsService.listStaged(domain)
      expect(stagedEntries.length).toBe(0)
    })

    it('should preserve blocks that are pinned by other domains', async () => {
      const domain1 = 'test-shared1.eth'
      const domain2 = 'test-shared2.eth'
      const blockNumber1 = 300
      const blockNumber2 = 301
      
      const sharedContent = 'Shared content between domains'
      const carData1 = await createUnixFsCar({
        'shared.txt': sharedContent,
        'unique1.txt': 'Unique to domain1'
      })
      const carData2 = await createUnixFsCar({
        'shared.txt': sharedContent,
        'unique2.txt': 'Unique to domain2'
      })
      const sharedCid1 = carData1.pathToCid.get('shared.txt')
      const sharedCid2 = carData2.pathToCid.get('shared.txt')
      expect(sharedCid1.toString()).toBe(sharedCid2.toString())
      
      // Finalize both domains
      const stagedCid1 = await ipfsService.stageCar(carData1.carBuffer, domain1)
      await ipfsService.finalizePage(stagedCid1, domain1, blockNumber1, txHashFor(blockNumber1))
      
      const stagedCid2 = await ipfsService.stageCar(carData2.carBuffer, domain2)
      await ipfsService.finalizePage(stagedCid2, domain2, blockNumber2, txHashFor(blockNumber2))
      
      // Prune only domain1
      await ipfsService.nukePage(domain1)

      const finalizations1 = await ipfsService.getFinalizations(domain1)
      expect(finalizations1.length).toBe(0)

      const finalizations2 = await ipfsService.getFinalizations(domain2)
      expect(finalizations2.length).toBe(1)
    })

    it('should handle recursive pins correctly', async () => {
      const domain = 'test-recursive.eth'
      const blockNumber = 400
      
      const carData = await createUnixFsCar({
        'level1/level2/level3/deep-file.txt': 'Deep file content'
      })
      const rootCid = carData.rootCid
      const level1Cid = carData.pathToCid.get('level1')
      const level2Cid = carData.pathToCid.get('level1/level2')
      const level3Cid = carData.pathToCid.get('level1/level2/level3')
      const fileCid = carData.pathToCid.get('level1/level2/level3/deep-file.txt')
      
      // Stage and finalize
      const stagedCid = await ipfsService.stageCar(carData.carBuffer, domain)
      await ipfsService.finalizePage(stagedCid, domain, blockNumber, txHashFor(blockNumber))

      // Verify all levels exist before pruning
      expect(await stat(rootCid)).toBeTruthy()
      expect(await stat(level1Cid)).toBeTruthy()
      expect(await stat(level2Cid)).toBeTruthy()
      expect(await stat(level3Cid)).toBeTruthy()
      expect(await stat(fileCid)).toBeTruthy()
      
      // Prune the page
      await ipfsService.nukePage(domain)

      const finalizations = await ipfsService.getFinalizations(domain)
      expect(finalizations.length).toBe(0)

      // Verify all levels are removed
      await expect(stat(rootCid)).rejects.toThrow()
      await expect(stat(level1Cid)).rejects.toThrow()
      await expect(stat(level2Cid)).rejects.toThrow()
      await expect(stat(level3Cid)).rejects.toThrow()
      await expect(stat(fileCid)).rejects.toThrow()
    })

    it('should handle mixed shared and unique content in recursive structures', async () => {
      const domain1 = 'test-mixed1.eth'
      const domain2 = 'test-mixed2.eth'
      const blockNumber1 = 500
      const blockNumber2 = 501
      
      const sharedContent = 'Shared content in recursive structure'
      const unique1Content = 'Unique to domain1'
      const unique2Content = 'Unique to domain2'

      const carData1 = await createUnixFsCar({
        'level1/shared.txt': sharedContent,
        'level1/unique1.txt': unique1Content
      })
      const carData2 = await createUnixFsCar({
        'level1/shared.txt': sharedContent,
        'level1/unique2.txt': unique2Content
      })

      const root1Cid = carData1.rootCid
      const root2Cid = carData2.rootCid
      const level1Cid1 = carData1.pathToCid.get('level1')
      const level1Cid2 = carData2.pathToCid.get('level1')
      const unique1Cid = carData1.pathToCid.get('level1/unique1.txt')
      const unique2Cid = carData2.pathToCid.get('level1/unique2.txt')
      const sharedCid1 = carData1.pathToCid.get('level1/shared.txt')
      const sharedCid2 = carData2.pathToCid.get('level1/shared.txt')
      expect(sharedCid1.toString()).toBe(sharedCid2.toString())
      
      // Finalize both domains
      const stagedCid1 = await ipfsService.stageCar(carData1.carBuffer, domain1)
      await ipfsService.finalizePage(stagedCid1, domain1, blockNumber1, txHashFor(blockNumber1))
      
      const stagedCid2 = await ipfsService.stageCar(carData2.carBuffer, domain2)
      await ipfsService.finalizePage(stagedCid2, domain2, blockNumber2, txHashFor(blockNumber2))

      // Verify all blocks exist before pruning
      expect(await stat(root1Cid)).toBeTruthy()
      expect(await stat(root2Cid)).toBeTruthy()
      expect(await stat(level1Cid1)).toBeTruthy()
      expect(await stat(level1Cid2)).toBeTruthy()
      expect(await stat(unique1Cid)).toBeTruthy()
      expect(await stat(unique2Cid)).toBeTruthy()
      expect(await stat(sharedCid1)).toBeTruthy()
      
      // Prune only domain1
      await ipfsService.nukePage(domain1)

      const finalizations1 = await ipfsService.getFinalizations(domain1)
      expect(finalizations1.length).toBe(0)

      const finalizations2 = await ipfsService.getFinalizations(domain2)
      expect(finalizations2.length).toBe(1)

      // Verify domain1's unique blocks are removed
      await expect(stat(root1Cid)).rejects.toThrow()
      await expect(stat(level1Cid1)).rejects.toThrow()
      await expect(stat(unique1Cid)).rejects.toThrow()

      // Verify domain2's blocks are preserved
      expect(await stat(root2Cid)).toBeTruthy()
      expect(await stat(level1Cid2)).toBeTruthy()
      expect(await stat(unique2Cid)).toBeTruthy()

      // Verify shared content is preserved
      expect(await stat(sharedCid1)).toBeTruthy()
    })

    it('should handle empty domain gracefully', async () => {
      // Test pruning a domain that has no finalized pins
      const emptyDomain = 'empty-domain.eth'
      
      // This should not throw an error
      await expect(ipfsService.nukePage(emptyDomain)).resolves.not.toThrow()
      
      const finalizations = await ipfsService.getFinalizations(emptyDomain)
      expect(finalizations.length).toBe(0)
    })

    it('should handle domain with only staged pins (no finalized pins)', async () => {
      const stagedOnlyDomain = 'staged-only.eth'
      
      const carData = await createUnixFsCar({ 'file.txt': 'staged content' })
      const stagedCid = await ipfsService.stageCar(carData.carBuffer, stagedOnlyDomain)
      
      const stagedEntries = await ipfsService.listStaged(stagedOnlyDomain)
      expect(stagedEntries.length).toBeGreaterThan(0)
      
      // Prune the page (should not affect staged pins)
      await ipfsService.nukePage(stagedOnlyDomain)
      
      const stagedEntriesAfter = await ipfsService.listStaged(stagedOnlyDomain)
      expect(stagedEntriesAfter.length).toBe(0)

      const finalizations = await ipfsService.getFinalizations(stagedOnlyDomain)
      expect(finalizations.length).toBe(0)
    })
  })

  describe('Label based ephemeral storage', () => {
    it('getLatestBlockNumber and setLatestBlockNumber: should manage latest block number', async () => {
      // Initially should be 0
      const initialBlock = await ipfsService.getLatestBlockNumber()
      expect(initialBlock).toBe(0)
      
      // Set new block number
      const newBlockNumber = 12345
      await ipfsService.setLatestBlockNumber(newBlockNumber)
      
      // Verify it was set
      const currentBlock = await ipfsService.getLatestBlockNumber()
      expect(currentBlock).toBe(newBlockNumber)
      
      // Update to new block number
      const newerBlockNumber = 12346
      await ipfsService.setLatestBlockNumber(newerBlockNumber)
      
      // Verify it was updated
      const updatedBlock = await ipfsService.getLatestBlockNumber()
      expect(updatedBlock).toBe(newerBlockNumber)
    })

    describe('List Operations', () => {
      it('should handle string lists', async () => {
        const listName = 'test-string-list'
        const testStrings = ['test1', 'test2', 'test3']
        
        // Add items to list
        for (const str of testStrings) {
          await ipfsService.addToList(listName, str)
        }
        
        // Get list and verify contents
        const list = await ipfsService.getList(listName)
        expect(list.sort()).toEqual(testStrings.sort())
        
        // Remove an item
        await ipfsService.removeFromList(listName, 'test2')
        
        // Verify item was removed
        const updatedList = await ipfsService.getList(listName)
        expect(updatedList.sort()).toEqual(['test1', 'test3'].sort())
      })

      it('should handle address lists', async () => {
        const listName = 'test-address-list'
        const testAddresses = [
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        ]
        
        // Add addresses to list
        for (const addr of testAddresses) {
          await ipfsService.addToList(listName, addr)
        }
        
        // Get list and verify contents
        const list = await ipfsService.getList(listName)
        expect(list.sort()).toEqual(testAddresses.sort())
        
        // Remove an address
        await ipfsService.removeFromList(listName, testAddresses[0])
        
        // Verify address was removed
        const updatedList = await ipfsService.getList(listName)
        expect(updatedList).toEqual([testAddresses[1]])
      })

      it('should handle number lists', async () => {
        const listName = 'test-number-list'
        const testNumbers = ['1', '2', '3', '4', '5']
        
        // Add numbers to list
        for (const num of testNumbers) {
          await ipfsService.addToList(listName, num)
        }
        
        // Get list and verify contents
        const list = await ipfsService.getList(listName)
        expect(list.sort()).toEqual(testNumbers.sort())
        
        // Remove a number
        await ipfsService.removeFromList(listName, '3')
        
        // Verify number was removed
        const updatedList = await ipfsService.getList(listName)
        expect(updatedList.sort()).toEqual(['1', '2', '4', '5'].sort())
      })

      it('should not add duplicate items', async () => {
        const listName = 'test-duplicate-list'
        const testString = 'test-string'
        
        // Add same string twice
        await ipfsService.addToList(listName, testString)
        await ipfsService.addToList(listName, testString)
        
        // Verify only one instance exists
        const list = await ipfsService.getList(listName)
        expect(list).toEqual([testString])
      })

      it('should handle empty lists', async () => {
        const listName = 'test-empty-list'
        const list = await ipfsService.getList(listName)
        expect(list).toEqual([])
      })

      it('should handle unknown lists', async () => {
        const listName = 'test-unknown-list'
        const list = await ipfsService.getList(listName)
        expect(list).toEqual([])
      })
    })
  })
}) 
