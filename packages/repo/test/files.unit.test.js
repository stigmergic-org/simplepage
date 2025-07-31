import 'fake-indexeddb/auto'
import { Files, FILES_ROOT } from '../src/files.js'
import { CHANGE_TYPE } from '../src/constants.js'
import { emptyUnixfs, ls } from '@simplepg/common'
import { keys, del } from 'idb-keyval'
import { jest } from '@jest/globals'

describe('Files', () => {
  let files
  let mockDservice
  let mockEnsureRepoData
  let fs
  let blockstore
  let repoRootCid
  let filesCid

  beforeEach(async () => {
    // Create actual filesystem
    ({ fs, blockstore } = emptyUnixfs())
    
    // Create a real repository root with _files directory
    const emptyDir = await fs.addDirectory()
    const filesDir = await fs.addDirectory()
    const testFile = await fs.addBytes(new TextEncoder().encode('test content'))
    
    // Add test file to files directory
    filesCid = await fs.cp(testFile, filesDir, 'test.txt')
    
    // Add _files directory to repo root
    repoRootCid = await fs.cp(filesCid, emptyDir, '_files')

    
    // Mock dservice
    mockDservice = {
      fetch: jest.fn()
    }
    
    // Mock ensureRepoData function
    mockEnsureRepoData = jest.fn().mockResolvedValue(undefined)
    
    files = new Files(fs, blockstore, mockDservice, mockEnsureRepoData)
  })

  afterEach(async () => {
    // Clear all IndexedDB data between tests
    const allKeys = await keys()
    for (const key of allKeys) {
      await del(key)
    }
  })

  describe('initialization', () => {
    it('should set root when /_files exists', async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
      expect(await files.tree()).toEqual([
        { path: '/' },
        { path: '/test.txt' }
      ])
      expect((await files.stage()).cid.toString()).toBe(filesCid.toString())
    })

    it('should create empty directory when /_files does not exist', async () => {
      // Create a repo root without _files directory
      const emptyRepoRoot = await fs.addDirectory()
      await files.unsafeSetRepoRoot(emptyRepoRoot)
      expect(await files.tree()).toEqual([
        { path: '/' }
      ])
      // even though it's a different folder, all empty folders have the same CID in unixfs
      expect((await files.stage()).cid.toString()).toBe(emptyRepoRoot.toString())
    })
  })

  describe('tree method', () => {
    it('should throw error if unsafeSetRepoRoot is not called yet', async () => {
      await expect(files.tree()).rejects.toThrow('Root not set. Call unsafeSetRoot() first.')
    })
  })

  describe('add, rm, cat, restore, clearChanges with tree verification', () => {
    beforeEach(async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
    })

    it('should add new file and verify with tree', async () => {
      const content = new TextEncoder().encode('new file content')
      await files.add('newfile.txt', content)
      
      const treeResult = await files.tree()
      expect(treeResult).toEqual([
        { path: '/' },
        { path: '/test.txt' },
        { path: '/newfile.txt', type: CHANGE_TYPE.NEW }
      ])
      
      // Verify content can be read via cat
      const readContent = await files.cat('newfile.txt')
      expect(readContent).toEqual(content)
    })

    it('should add edit to existing file and verify with tree', async () => {
      const content = new TextEncoder().encode('updated content')
      await files.add('test.txt', content)
      
      const treeResult = await files.tree()
      expect(treeResult).toEqual([
        { path: '/' },
        { path: '/test.txt', type: CHANGE_TYPE.EDIT }
      ])
      
      // Verify content can be read via cat
      const readContent = await files.cat('test.txt')
      expect(readContent).toEqual(content)
    })

    it('should remove file and verify with tree', async () => {
      await files.rm('test.txt')
      
      const treeResult = await files.tree()
      expect(treeResult).toEqual([
        { path: '/' },
        { path: '/test.txt', type: CHANGE_TYPE.DELETE }
      ])
    })

    it('should read staged content with cat', async () => {
      const content = new TextEncoder().encode('staged content')
      await files.add('test.txt', content)
      
      const result = await files.cat('/test.txt')
      expect(result).toEqual(content)
    })

    it('should read filesystem content with cat when no staged content', async () => {
      const result = await files.cat('/test.txt')
      expect(result).toEqual(new TextEncoder().encode('test content'))
    })

    it('should fetch from dservice when file not in filesystem', async () => {
      // First, add a file and commit it
      const content = new TextEncoder().encode('remote file content')
      await files.add('remote.txt', content)
      
      // Stage the changes
      const stagedResult = await files.stage()
      
      // Finalize the commit - this updates the root
      await files.finalizeCommit(stagedResult.cid)
      console.log('stagedResult', stagedResult)
      
      // remove the remote.txt file from the blockstore
      const remoteTxtCid = (await ls(blockstore, stagedResult.cid)).find(([name]) => name === 'remote.txt')[1]
      await blockstore.delete(remoteTxtCid)
      
      const newFiles = new Files(fs, blockstore, mockDservice, mockEnsureRepoData)
      // Create root directory with _files folder containing staged result
      const rootDir = await fs.cp(stagedResult.cid, await fs.addDirectory(), '_files') 
      await newFiles.unsafeSetRepoRoot(rootDir)
      
      // Mock dservice response
      const mockResponse = {
        status: 200,
        arrayBuffer: jest.fn().mockResolvedValue(content.buffer)
      }
      mockDservice.fetch.mockResolvedValue(mockResponse)
      
      // Try to cat the file - this should trigger dservice fetch
      const result = await newFiles.cat('remote.txt')
      
      expect(result).toEqual(content)
      expect(mockDservice.fetch).toHaveBeenCalledWith('/file?cid=' + remoteTxtCid.toString())
    })

    it('should restore staged change', async () => {
      const content = new TextEncoder().encode('content to restore')
      await files.add('restore.txt', content)
      
      // Verify it's staged
      let treeResult = await files.tree()
      expect(treeResult).toContainEqual( { path: '/restore.txt', type: CHANGE_TYPE.NEW })
      
      // Restore it
      await files.restore('restore.txt')
      
      // Verify it's removed from tree
      treeResult = await files.tree()
      expect(treeResult).not.toContainEqual({ path: '/restore.txt', type: CHANGE_TYPE.NEW })
      
      // Verify it's no longer accessible via cat
      await expect(files.cat('restore.txt')).rejects.toThrow()
    })

    it('should restore file deletion', async () => {
      await files.rm('test.txt')
      // Verify it's staged
      let treeResult = await files.tree()
      expect(treeResult).toContainEqual( { path: '/test.txt', type: CHANGE_TYPE.DELETE })

      await files.restore('test.txt')
      treeResult = await files.tree()
      expect(treeResult).not.toContainEqual({ path: '/test.txt', type: CHANGE_TYPE.DELETE })
    })

    it('should clear all changes', async () => {
      // Add multiple staged changes
      await files.add('file1.txt', new TextEncoder().encode('content1'))
      await files.add('file2.txt', new TextEncoder().encode('content2'))
      await files.rm('test.txt')
      
      // Verify they're staged
      let treeResult = await files.tree()
      expect(treeResult).toHaveLength(4) // '/' + '/test.txt' (deleted) + '/file1.txt' + '/file2.txt'
      
      // Clear all changes
      await files.clearChanges()
      
      // Verify they're all removed from tree
      treeResult = await files.tree()
      expect(treeResult).toEqual([
        { path: '/' },
        { path: '/test.txt' } // Only filesystem files remain
      ])
      
      // Verify files are no longer accessible via cat
      await expect(files.cat('/file1.txt')).rejects.toThrow()
      await expect(files.cat('/file2.txt')).rejects.toThrow()
      // test.txt should still be accessible since it was restored
      const testContent = await files.cat('/test.txt')
      expect(testContent).toEqual(new TextEncoder().encode('test content'))
    })
  })

  describe('stage', () => {
    beforeEach(async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
    })

    it('should return original _files CID when no changes', async () => {
      const result = await files.stage()
      expect(result.cid.toString()).toBe(filesCid.toString())
    })

    it('should return empty _files CID when folder did not exist', async () => {
      // Create a repo root without _files directory
      const emptyRepoRoot = await fs.addDirectory()
      
      await files.unsafeSetRepoRoot(emptyRepoRoot)
      
      const result = await files.stage()
      expect(result).toBeDefined()
      expect(result.toString()).not.toBe(filesCid.toString())
    })

    it('should create files properly in filesystem', async () => {
      const content1 = new TextEncoder().encode('content1')
      const content2 = new TextEncoder().encode('content2')
      
      await files.add('/newfile1.txt', content1)
      await files.add('/newfile2.txt', content2)
      await files.rm('/test.txt')
      
      const result = await files.stage()
      
      // Verify the new root is different
      expect(result.cid.toString()).not.toBe(filesCid.toString())
      
      // Verify files were actually created in filesystem
      await files.finalizeCommit(result.cid)
      const newTree = await files.tree()
      expect(newTree).toEqual([
        { path: '/' },
        { path: '/newfile1.txt' },
        { path: '/newfile2.txt' }
        // test.txt should be deleted
      ])
      
      // Verify we can read the new files
      const readContent1 = await files.cat('/newfile1.txt')
      const readContent2 = await files.cat('/newfile2.txt')
      expect(readContent1).toEqual(content1)
      expect(readContent2).toEqual(content2)
    })
  })

  describe('finalizeCommit', () => {
    beforeEach(async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
    })

    it('should update root and clear changes', async () => {
      // Add some staged changes
      await files.add('file1.txt', new TextEncoder().encode('content1'))
      await files.add('file2.txt', new TextEncoder().encode('content2'))
      
      // Verify changes exist
      let treeResult = await files.tree()
      expect(treeResult).toHaveLength(4) // '/' + '/test.txt' (deleted) + '/file1.txt' + '/file2.txt'
      
      // Stage the changes to get a new root
      const newRoot = await files.stage()
      
      // Finalize commit
      await files.finalizeCommit(newRoot.cid)
      
      // Verify changes are cleared
      treeResult = await files.tree()
      expect(treeResult).toEqual([
        { path: '/' },
        { path: '/file1.txt' },
        { path: '/file2.txt' },
        { path: '/test.txt' }
      ])
    })
  })
})
