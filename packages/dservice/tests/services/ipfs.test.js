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

  function stat(cid) {
    return kuboApi.block.stat(cid, { offline: true })
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
    
    // Create a CAR file using cartonne's high-level API
    const factory = new CARFactory()
    // Add required codecs
    factory.codecs.add(dagCbor)
    factory.codecs.add(dagPb)
    factory.codecs.add(raw)
    
    const car = factory.build()
    
    // Create a directory structure
    const dirLinks = {}
    for (const [name, content] of Object.entries(files)) {
      const contentBuffer = Buffer.from(content)
      // Specify raw codec when adding content
      const cid = car.put(contentBuffer, { codec: raw })
      dirLinks[name] = { cid, size: contentBuffer.length }
    }
    
    // Add directory as root with dag-cbor codec
    const rootCid = car.put(dirLinks, { isRoot: true, codec: dagCbor })
    
    // Get the CAR file as bytes
    const carBuffer = car.bytes
    
    // Write content using the service
    const returnedCid = await ipfsService.writeCar(carBuffer, 'test-domain.eth')
    expect(returnedCid).toBeTruthy()
    expect(returnedCid.toString()).toBe(rootCid.toString())

    // Verify the directory block exists in IPFS
    const exists = await kuboApi.block.stat(returnedCid)
    expect(exists).toBeTruthy()

    // Verify all file blocks exist in IPFS
    for (const { cid } of Object.values(dirLinks)) {
      const fileExists = await kuboApi.block.stat(cid.toString())
      expect(fileExists).toBeTruthy()
    }

    // Verify the pin exists with correct label
    const pins = await kuboApi.pin.ls({ name: 'spg_staged_test-domain.eth' })
    const pin = await pins.next()
    expect(pin.value.type).toBe('recursive')
    
    // Get all pins to debug the structure
    const allPins = await kuboApi.pin.ls({ name: 'spg_staged_' })
    for await (const p of allPins) {
      expect(p?.name).toMatch(/^spg_staged_test-domain\.eth_\d+$/)
      expect(p.type).toBe('recursive')
    }

    // Verify all files exist and have correct content
    for (const [name, content] of Object.entries(files)) {
      const fileCid = dirLinks[name].cid
      
      // Verify block exists
      const fileExists = await kuboApi.block.stat(fileCid.toString())
      expect(fileExists).toBeTruthy()
      
      // Verify content
      const retrievedBlock = await kuboApi.block.get(fileCid.toString())
      const retrievedContent = uint8ArrayToString(retrievedBlock)
      expect(retrievedContent).toBe(content)
    }

    // Verify directory structure by decoding block manually
    const block = await kuboApi.block.get(returnedCid)
    const dirData = dagCbor.decode(block)
    const listedFiles = Object.keys(dirData)
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
    expect(blockCount).toBe(4)
    
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
    const cids = []
    
    // Create first version with shared content
    const sharedContent = 'Shared content'
    const oldFiles = {
      'index.html': '<html>Old</html>',
      'shared.txt': sharedContent
    }
    
    const factory = new CARFactory()
    factory.codecs.add(dagCbor)
    factory.codecs.add(dagPb)
    factory.codecs.add(raw)
    
    // Create and finalize first version
    const oldCar = factory.build()
    const oldDirLinks = {}
    for (const [name, content] of Object.entries(oldFiles)) {
      const contentBuffer = Buffer.from(content)
      const cid = oldCar.put(contentBuffer, { codec: raw })
      oldDirLinks[name] = { cid, size: contentBuffer.length }
    }
    const oldRootCid = oldCar.put(oldDirLinks, { isRoot: true, codec: dagCbor })
    
    // Stage and finalize first version
    const oldStagedCid = await ipfsService.writeCar(oldCar.bytes, domain)
    await ipfsService.finalizePage(oldStagedCid, domain, blockNumbers[0])
    cids.push(oldStagedCid)
    
    // Create and finalize additional versions
    for (let i = 1; i < blockNumbers.length; i++) {
      const blockNumber = blockNumbers[i]
      const files = {
        'index.html': `<html>Version ${blockNumber}</html>`,
        'shared.txt': sharedContent, // Keep shared content
        'data.json': `{"version": ${blockNumber}}`
      }
      
      const car = factory.build()
      const dirLinks = {}
      for (const [name, content] of Object.entries(files)) {
        const contentBuffer = Buffer.from(content)
        const cid = car.put(contentBuffer, { codec: raw })
        dirLinks[name] = { cid, size: contentBuffer.length }
      }
      const rootCid = car.put(dirLinks, { isRoot: true, codec: dagCbor })
      
      // Stage and finalize
      const stagedCid = await ipfsService.writeCar(car.bytes, domain)
      await ipfsService.finalizePage(stagedCid, domain, blockNumber)
      cids.push(stagedCid)
    }
    
    // Verify finalizations DAG exists
    const finalizationsPins = await kuboApi.pin.ls({ name: 'spg_finalizations' })
    const finalizationsPinResults = []
    for await (const pin of finalizationsPins) {
      finalizationsPinResults.push(pin)
    }
    expect(finalizationsPinResults.length).toBe(1)
    
    // Get the finalizations DAG
    const finalizationsCid = finalizationsPinResults[0].cid
    const finalizationsNode = await kuboApi.dag.get(finalizationsCid)
    const finalizations = finalizationsNode.value
    
    // Verify domain exists in finalizations
    expect(finalizations[domain]).toBeTruthy()
    expect(finalizations[domain].length).toBe(blockNumbers.length)
    
    // Verify each finalization exists with correct block number and CID
    for (let i = 0; i < blockNumbers.length; i++) {
      const blockNumber = blockNumbers[i]
      const expectedCid = cids[i]
      
      const finalization = finalizations[domain].find(f => f.blockNumber === blockNumber)
      expect(finalization).toBeTruthy()
      expect(finalization.cid).toEqual(expectedCid)
      
      // Verify content is accessible
      const block = await kuboApi.block.get(expectedCid)
      const dirData = dagCbor.decode(block)
      
      // Verify index.html content
      const indexContent = await kuboApi.block.get(dirData['index.html'].cid.toString())
      if (i === 0) {
        expect(uint8ArrayToString(indexContent)).toBe('<html>Old</html>')
      } else {
        expect(uint8ArrayToString(indexContent)).toBe(`<html>Version ${blockNumber}</html>`)
      }
      
      // Verify shared content
      const sharedContent = await kuboApi.block.get(dirData['shared.txt'].cid.toString())
      expect(uint8ArrayToString(sharedContent)).toBe('Shared content')
      
      // Verify data.json for newer versions
      if (i > 0) {
        const dataContent = await kuboApi.block.get(dirData['data.json'].cid.toString())
        expect(uint8ArrayToString(dataContent)).toBe(`{"version": ${blockNumber}}`)
      }
    }
  })

  it('pruneStaged: should remove old staged pins but keep recent ones', async () => {
    const domain1 = 'test-domain1.eth'
    const domain2 = 'test-domain2.eth'
    
    // Create test content
    const factory = new CARFactory()
    factory.codecs.add(dagCbor)
    
    // Create two simple test files with just root objects
    const car1 = factory.build()
    const car2 = factory.build()
    
    // Create simple root objects
    const rootCid1 = car1.put({ test: 'content1' }, { isRoot: true, codec: dagCbor })
    const rootCid2 = car2.put({ test: 'content2' }, { isRoot: true, codec: dagCbor })
    
    // Create service with 1 hour max age
    const ipfsServiceWithPrune = new IpfsService({ 
      ipfsClient: kuboApi,
      maxStagedAge: 60 * 60, // 1 hour in seconds
      logger: mockLogger
    })
    ipfsServiceWithPrune.client = kuboApi
    
    // Stage both files
    const stagedCid1 = await ipfsServiceWithPrune.writeCar(car1.bytes, domain1)
    const stagedCid2 = await ipfsServiceWithPrune.writeCar(car2.bytes, domain2)
    
    // Manually modify the timestamp of first pin to be 2 hours old
    const twoHoursAgo = Math.floor(Date.now() / 1000) - (2 * 60 * 60)
    const oldLabel = `spg_staged_${domain1}_${twoHoursAgo}`
    await kuboApi.pin.rm(stagedCid1, { recursive: true }) // Remove current pin
    await kuboApi.pin.add(stagedCid1, { recursive: true, name: oldLabel }) // Re-add with old timestamp
    
    // Run prune
    await ipfsServiceWithPrune.pruneStaged()
    
    // Verify old pin is removed
    const oldPins = await kuboApi.pin.ls({ name: `spg_staged_${domain1}` })
    const oldResults = []
    for await (const pin of oldPins) {
      oldResults.push(pin)
    }
    expect(oldResults.length).toBe(0)
    
    // Verify recent pin still exists
    const recentPins = await kuboApi.pin.ls({ name: `spg_staged_${domain2}` })
    const recentResults = []
    for await (const pin of recentPins) {
      recentResults.push(pin)
    }
    expect(recentResults.length).toBe(1)
  })

  it('isPageFinalized: should correctly check if a page is finalized', async () => {
    const domain = 'test-domain3.eth'
    const blockNumber = 12345
    
    // Create and stage some test content
    const factory = new CARFactory()
    factory.codecs.add(dagCbor)
    const car = factory.build()
    const rootCid = car.put({ test: 'content' }, { isRoot: true, codec: dagCbor })
    
    // Stage and finalize the content
    const stagedCid = await ipfsService.writeCar(car.bytes, domain)
    await ipfsService.finalizePage(stagedCid, domain, blockNumber)
    
    // Check if page is finalized
    const isFinalized = await ipfsService.isPageFinalized(stagedCid, domain, blockNumber)
    expect(isFinalized).toBe(true)
    
    // Check with wrong CID
    const wrongCid = CID.create(1, 0x55, identity.digest(new Uint8Array([0x01, 0x02, 0x03])))
    const isWrongFinalized = await ipfsService.isPageFinalized(wrongCid, domain, blockNumber)
    expect(isWrongFinalized).toBe(false)
  })

  describe('nukePage', () => {
    it('should remove all finalizations for the given domain', async () => {
      const domain = 'test-prune-domain.eth'
      const blockNumbers = [100, 101, 102]
      
      // Create and finalize multiple versions for the domain
      const factory = new CARFactory()
      factory.codecs.add(dagCbor)
      factory.codecs.add(raw)
      
      const finalizedCids = []
      for (const blockNumber of blockNumbers) {
        const car = factory.build()
        const content = `Content for block ${blockNumber}`
        const contentCid = car.put(Buffer.from(content), { codec: raw })
        const rootCid = car.put({ content: contentCid }, { isRoot: true, codec: dagCbor })
        
        // Stage and finalize
        const stagedCid = await ipfsService.writeCar(car.bytes, domain)
        await ipfsService.finalizePage(stagedCid, domain, blockNumber)
        finalizedCids.push(stagedCid)
      }
      
      // Verify finalizations exist before pruning
      const finalizationsBefore = await ipfsService.finalizations.getAll(domain)
      expect(finalizationsBefore).toBeTruthy()
      expect(finalizationsBefore.length).toBe(blockNumbers.length)
      
      // Prune the page
      await ipfsService.nukePage(domain)
      
      // Verify finalizations are removed
      const finalizationsAfter = await ipfsService.finalizations.getAll(domain)
      expect(finalizationsAfter.length).toBe(0)
    })

    it('should remove all blocks under the finalized CIDs', async () => {
      const domain = 'test-prune-blocks.eth'
      const blockNumber = 200
      
      // Create a multi-level structure with shared content
      const factory = new CARFactory()
      factory.codecs.add(dagCbor)
      factory.codecs.add(raw)
      
      const car = factory.build()
      
      // Create nested structure: root -> dir -> file
      const fileContent = 'Shared file content'
      const fileCid = car.put(Buffer.from(fileContent), { codec: raw })
      
      const dirContent = { 'file.txt': { cid: fileCid, size: fileContent.length } }
      const dirCid = car.put(dirContent, { codec: dagCbor })
      
      const rootContent = { 'directory': { cid: dirCid, size: 0 } }
      const rootCid = car.put(rootContent, { isRoot: true, codec: dagCbor })
      
      // Stage and finalize
      const stagedCid = await ipfsService.writeCar(car.bytes, domain)
      await ipfsService.finalizePage(stagedCid, domain, blockNumber)
      
      // Verify all blocks exist before pruning
      expect(await stat(rootCid)).toBeTruthy()
      expect(await stat(dirCid)).toBeTruthy()
      expect(await stat(fileCid)).toBeTruthy()
      
      // Prune the page
      await ipfsService.nukePage(domain)
      
      // Verify all blocks are removed
      await expect(stat(rootCid)).rejects.toThrow()
      await expect(stat(dirCid)).rejects.toThrow()
      await expect(stat(fileCid)).rejects.toThrow()
    })

    it('should preserve blocks that are pinned by other domains', async () => {
      const domain1 = 'test-shared1.eth'
      const domain2 = 'test-shared2.eth'
      const blockNumber1 = 300
      const blockNumber2 = 301
      
      // Create shared content
      const factory = new CARFactory()
      factory.codecs.add(dagCbor)
      factory.codecs.add(raw)
      
      const sharedContent = 'Shared content between domains'
      const sharedCar = factory.build()
      const sharedCid = sharedCar.put(Buffer.from(sharedContent), { codec: raw })
      
      // Add shared content to IPFS
      await kuboApi.block.put(Buffer.from(sharedContent), { cid: sharedCid })
      
      // Create content for domain1 that references shared content
      const car1 = factory.build()
      const root1Content = { 
        'shared.txt': { cid: sharedCid, size: sharedContent.length },
        'unique1.txt': { cid: car1.put(Buffer.from('Unique to domain1'), { codec: raw }), size: 18 }
      }
      const root1Cid = car1.put(root1Content, { isRoot: true, codec: dagCbor })
      
      // Create content for domain2 that also references shared content
      const car2 = factory.build()
      const root2Content = { 
        'shared.txt': { cid: sharedCid, size: sharedContent.length },
        'unique2.txt': { cid: car2.put(Buffer.from('Unique to domain2'), { codec: raw }), size: 18 }
      }
      const root2Cid = car2.put(root2Content, { isRoot: true, codec: dagCbor })
      
      // Finalize both domains
      const stagedCid1 = await ipfsService.writeCar(car1.bytes, domain1)
      await ipfsService.finalizePage(stagedCid1, domain1, blockNumber1)
      
      const stagedCid2 = await ipfsService.writeCar(car2.bytes, domain2)
      await ipfsService.finalizePage(stagedCid2, domain2, blockNumber2)
      
      // Verify all blocks exist before pruning
      expect(await stat(root1Cid)).toBeTruthy()
      expect(await stat(root2Cid)).toBeTruthy()
      expect(await stat(sharedCid)).toBeTruthy()
      
      // Prune only domain1
      await ipfsService.nukePage(domain1)
      
      // Verify domain1's unique blocks are removed
      await expect(stat(root1Cid)).rejects.toThrow()
      
      // Verify domain2's blocks are preserved
      expect(await stat(root2Cid)).toBeTruthy()
      
      // Verify shared content is preserved (still pinned by domain2)
      expect(await stat(sharedCid)).toBeTruthy()
      
      // Verify domain1's final cids are removed
      const finalizations1 = await ipfsService.finalizations.getAll(domain1)
      expect(finalizations1.length).toBe(0)
      
      // Verify domain2's final cids are preserved
      const finalizations2 = await ipfsService.finalizations.getAll(domain2)
      expect(finalizations2.length).toBe(1)
    })

    it('should handle recursive pins correctly', async () => {
      const domain = 'test-recursive.eth'
      const blockNumber = 400
      
      // Create a deep recursive structure
      const factory = new CARFactory()
      factory.codecs.add(dagCbor)
      factory.codecs.add(raw)
      
      const car = factory.build()
      
      // Create deep nested structure: root -> level1 -> level2 -> level3 -> file
      const fileContent = 'Deep file content'
      const fileCid = car.put(Buffer.from(fileContent), { codec: raw })
      
      const level3Content = { 'deep-file.txt': { cid: fileCid, size: fileContent.length } }
      const level3Cid = car.put(level3Content, { codec: dagCbor })
      
      const level2Content = { 'level3': { cid: level3Cid, size: 0 } }
      const level2Cid = car.put(level2Content, { codec: dagCbor })
      
      const level1Content = { 'level2': { cid: level2Cid, size: 0 } }
      const level1Cid = car.put(level1Content, { codec: dagCbor })
      
      const rootContent = { 'level1': { cid: level1Cid, size: 0 } }
      const rootCid = car.put(rootContent, { isRoot: true, codec: dagCbor })
      
      // Stage and finalize
      const stagedCid = await ipfsService.writeCar(car.bytes, domain)
      await ipfsService.finalizePage(stagedCid, domain, blockNumber)
      
      // Verify all levels exist before pruning
      expect(await stat(rootCid)).toBeTruthy()
      expect(await stat(level1Cid)).toBeTruthy()
      expect(await stat(level2Cid)).toBeTruthy()
      expect(await stat(level3Cid)).toBeTruthy()
      expect(await stat(fileCid)).toBeTruthy()
      
      // Prune the page
      await ipfsService.nukePage(domain)
      
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
      
      // Create shared content
      const factory = new CARFactory()
      factory.codecs.add(dagCbor)
      factory.codecs.add(raw)
      
      const sharedContent = 'Shared content in recursive structure'
      const sharedCar = factory.build()
      const sharedCid = sharedCar.put(Buffer.from(sharedContent), { codec: raw })
      
      // Add shared content to IPFS
      await kuboApi.block.put(Buffer.from(sharedContent), { cid: sharedCid })
      
      // Create recursive structure for domain1
      const car1 = factory.build()
      const unique1Content = 'Unique to domain1'
      const unique1Cid = car1.put(Buffer.from(unique1Content), { codec: raw })
      
      const level1Content1 = { 
        'shared.txt': { cid: sharedCid, size: sharedContent.length },
        'unique1.txt': { cid: unique1Cid, size: unique1Content.length }
      }
      const level1Cid1 = car1.put(level1Content1, { codec: dagCbor })
      
      const root1Content = { 'level1': { cid: level1Cid1, size: 0 } }
      const root1Cid = car1.put(root1Content, { isRoot: true, codec: dagCbor })
      
      // Create recursive structure for domain2
      const car2 = factory.build()
      const unique2Content = 'Unique to domain2'
      const unique2Cid = car2.put(Buffer.from(unique2Content), { codec: raw })
      
      const level1Content2 = { 
        'shared.txt': { cid: sharedCid, size: sharedContent.length },
        'unique2.txt': { cid: unique2Cid, size: unique2Content.length }
      }
      const level1Cid2 = car2.put(level1Content2, { codec: dagCbor })
      
      const root2Content = { 'level1': { cid: level1Cid2, size: 0 } }
      const root2Cid = car2.put(root2Content, { isRoot: true, codec: dagCbor })
      
      // Finalize both domains
      const stagedCid1 = await ipfsService.writeCar(car1.bytes, domain1)
      await ipfsService.finalizePage(stagedCid1, domain1, blockNumber1)
      
      const stagedCid2 = await ipfsService.writeCar(car2.bytes, domain2)
      await ipfsService.finalizePage(stagedCid2, domain2, blockNumber2)
      
      // Verify all blocks exist before pruning
      expect(await stat(root1Cid)).toBeTruthy()
      expect(await stat(root2Cid)).toBeTruthy()
      expect(await stat(level1Cid1)).toBeTruthy()
      expect(await stat(level1Cid2)).toBeTruthy()
      expect(await stat(unique1Cid)).toBeTruthy()
      expect(await stat(unique2Cid)).toBeTruthy()
      expect(await stat(sharedCid)).toBeTruthy()
      
      // Prune only domain1
      await ipfsService.nukePage(domain1)
      
      // Verify domain1's unique blocks are removed
      await expect(stat(root1Cid)).rejects.toThrow()
      await expect(stat(level1Cid1)).rejects.toThrow()
      await expect(stat(unique1Cid)).rejects.toThrow()
      
      // Verify domain2's blocks are preserved
      expect(await stat(root2Cid)).toBeTruthy()
      expect(await stat(level1Cid2)).toBeTruthy()
      expect(await stat(unique2Cid)).toBeTruthy()
      
      // Verify shared content is preserved
      expect(await stat(sharedCid)).toBeTruthy()
    })

    it('should handle empty domain gracefully', async () => {
      // Test pruning a domain that has no finalized pins
      const emptyDomain = 'empty-domain.eth'
      
      // This should not throw an error
      await expect(ipfsService.nukePage(emptyDomain)).resolves.not.toThrow()
      
      // Verify no pins exist for this domain
      const pins = await kuboApi.pin.ls({ name: `spg_final_${emptyDomain}` })
      const pinResults = []
      for await (const pin of pins) {
        pinResults.push(pin)
      }
      expect(pinResults.length).toBe(0)
    })

    it('should handle domain with only staged pins (no finalized pins)', async () => {
      const stagedOnlyDomain = 'staged-only.eth'
      
      // Create staged content but don't finalize
      const factory = new CARFactory()
      factory.codecs.add(dagCbor)
      const car = factory.build()
      const rootCid = car.put({ test: 'staged content' }, { isRoot: true, codec: dagCbor })
      
      const stagedCid = await ipfsService.writeCar(car.bytes, stagedOnlyDomain)
      
      // Verify staged pin exists
      const stagedPins = await kuboApi.pin.ls({ name: `spg_staged_${stagedOnlyDomain}` })
      const stagedPinResults = []
      for await (const pin of stagedPins) {
        stagedPinResults.push(pin)
      }
      expect(stagedPinResults.length).toBeGreaterThan(0)
      
      // Prune the page (should not affect staged pins)
      await ipfsService.nukePage(stagedOnlyDomain)
      
      // Verify staged pins are still there
      const stagedPinsAfter = await kuboApi.pin.ls({ name: `spg_staged_${stagedOnlyDomain}` })
      const stagedPinResultsAfter = []
      for await (const pin of stagedPinsAfter) {
        stagedPinResultsAfter.push(pin)
      }
      expect(stagedPinResultsAfter.length).toBeGreaterThan(0)
      
      // Verify no final pins exist
      const finalPins = await kuboApi.pin.ls({ name: `spg_final_${stagedOnlyDomain}` })
      const finalPinResults = []
      for await (const pin of finalPins) {
        finalPinResults.push(pin)
      }
      expect(finalPinResults.length).toBe(0)
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
          await ipfsService.addToList(listName, 'string', str)
        }
        
        // Get list and verify contents
        const list = await ipfsService.getList(listName, 'string')
        expect(list.sort()).toEqual(testStrings.sort())
        
        // Remove an item
        await ipfsService.removeFromList(listName, 'string', 'test2')
        
        // Verify item was removed
        const updatedList = await ipfsService.getList(listName, 'string')
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
          await ipfsService.addToList(listName, 'address', addr)
        }
        
        // Get list and verify contents
        const list = await ipfsService.getList(listName, 'address')
        expect(list.sort()).toEqual(testAddresses.sort())
        
        // Remove an address
        await ipfsService.removeFromList(listName, 'address', testAddresses[0])
        
        // Verify address was removed
        const updatedList = await ipfsService.getList(listName, 'address')
        expect(updatedList).toEqual([testAddresses[1]])
      })

      it('should handle number lists', async () => {
        const listName = 'test-number-list'
        const testNumbers = [1, 2, 3, 4, 5]
        
        // Add numbers to list
        for (const num of testNumbers) {
          await ipfsService.addToList(listName, 'number', num)
        }
        
        // Get list and verify contents
        const list = await ipfsService.getList(listName, 'number')
        expect(list.sort()).toEqual(testNumbers.sort())
        
        // Remove a number
        await ipfsService.removeFromList(listName, 'number', 3)
        
        // Verify number was removed
        const updatedList = await ipfsService.getList(listName, 'number')
        expect(updatedList.sort()).toEqual([1, 2, 4, 5].sort())
      })

      it('should not add duplicate items', async () => {
        const listName = 'test-duplicate-list'
        const testString = 'test-string'
        
        // Add same string twice
        await ipfsService.addToList(listName, 'string', testString)
        await ipfsService.addToList(listName, 'string', testString)
        
        // Verify only one instance exists
        const list = await ipfsService.getList(listName, 'string')
        expect(list).toEqual([testString])
      })

      it('should handle empty lists', async () => {
        const listName = 'test-empty-list'
        const list = await ipfsService.getList(listName, 'string')
        expect(list).toEqual([])
      })

      it('should throw error for unsupported data types', async () => {
        const listName = 'test-unsupported-list'
        await expect(ipfsService.addToList(listName, 'unsupported', 'test'))
          .rejects.toThrow('Unsupported data type: unsupported')
        
        await expect(ipfsService.getList(listName, 'unsupported'))
          .rejects.toThrow('Unsupported data type: unsupported')
      })
    })
  })
}) 