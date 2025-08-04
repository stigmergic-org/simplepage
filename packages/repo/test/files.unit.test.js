import { Files, FILES_ROOT } from '../src/files.js'
import { CHANGE_TYPE } from '../src/constants.js'
import { emptyUnixfs, ls } from '@simplepg/common'
import { jest } from '@jest/globals'

describe('Files', () => {
  let files
  let mockDservice
  let mockEnsureRepoData
  let mockStorage
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
    
    // Mock storage
    mockStorage = {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined)
    }
    
    files = new Files(fs, blockstore, mockDservice, mockEnsureRepoData, mockStorage)
  })

  describe('initialization', () => {
    it('should set root when /_files exists', async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' }
      ])
      expect((await files.stage()).cid.toString()).toBe(filesCid.toString())
    })

    it('should create empty directory when /_files does not exist', async () => {
      // Create a repo root without _files directory
      const emptyRepoRoot = await fs.addDirectory()
      await files.unsafeSetRepoRoot(emptyRepoRoot)
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([])
      // even though it's a different folder, all empty folders have the same CID in unixfs
      expect((await files.stage()).cid.toString()).toBe(emptyRepoRoot.toString())
    })
  })

  describe('ls method', () => {
    it('should throw error if unsafeSetRepoRoot is not called yet', async () => {
      await expect(files.ls('/')).rejects.toThrow('Root not set. Call unsafeSetRoot() first.')
    })
  })

  describe('add, rm, cat, restore, clearChanges with ls verification', () => {
    beforeEach(async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
    })

    it('should add new file and verify with ls', async () => {
      const content = new TextEncoder().encode('new file content')
      await files.add('newfile.txt', content)
      
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' },
        { name: 'newfile.txt', cid: expect.any(Object), size: expect.any(Number), path: 'newfile.txt', type: 'file', change: CHANGE_TYPE.NEW }
      ])
      
      // Verify content can be read via cat
      const readContent = await files.cat('newfile.txt')
      expect(readContent).toEqual(content)
    })

    it('should add edit to existing file and verify with ls', async () => {
      const content = new TextEncoder().encode('updated content')
      await files.add('test.txt', content)
      
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file', change: CHANGE_TYPE.EDIT }
      ])
      
      // Verify content can be read via cat
      const readContent = await files.cat('test.txt')
      expect(readContent).toEqual(content)
    })

    it('should remove file and verify with ls', async () => {
      await files.rm('test.txt')
      
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file', change: CHANGE_TYPE.DELETE }
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
      
      // remove the remote.txt file from the blockstore
      const remoteTxtCid = (await ls(blockstore, stagedResult.cid)).find(([name]) => name === 'remote.txt')[1]
      await blockstore.delete(remoteTxtCid)
      
      const newFiles = new Files(fs, blockstore, mockDservice, mockEnsureRepoData, mockStorage)
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
      let lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({ name: 'restore.txt', change: CHANGE_TYPE.NEW }))
      
      // Restore it
      await files.restore('restore.txt')
      
      // Verify it's removed from ls
      lsResult = await files.ls('/')
      expect(lsResult).not.toContainEqual(expect.objectContaining({ name: 'restore.txt', change: CHANGE_TYPE.NEW }))
      
      // Verify it's no longer accessible via cat
      await expect(files.cat('restore.txt')).rejects.toThrow()
    })

    it('should restore file deletion', async () => {
      await files.rm('test.txt')
      // Verify it's staged
      let lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({ name: 'test.txt', change: CHANGE_TYPE.DELETE }))

      await files.restore('test.txt')
      lsResult = await files.ls('/')
      expect(lsResult).not.toContainEqual(expect.objectContaining({ name: 'test.txt', change: CHANGE_TYPE.DELETE }))
    })

    it('should clear all changes', async () => {
      // Add multiple staged changes
      await files.add('file1.txt', new TextEncoder().encode('content1'))
      await files.add('file2.txt', new TextEncoder().encode('content2'))
      await files.rm('test.txt')
      
      // Verify they're staged
      let lsResult = await files.ls('/')
      expect(lsResult).toHaveLength(3) // 'test.txt' (deleted) + 'file1.txt' + 'file2.txt'
      
      // Clear all changes
      await files.clearChanges()
      
      // Verify they're all removed from ls
      lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' }
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
      const newLs = await files.ls('/')
      expect(newLs).toEqual([
        { name: 'newfile1.txt', cid: expect.any(Object), size: expect.any(Number), path: 'newfile1.txt', type: 'file' },
        { name: 'newfile2.txt', cid: expect.any(Object), size: expect.any(Number), path: 'newfile2.txt', type: 'file' }
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
      let lsResult = await files.ls('/')
      expect(lsResult).toHaveLength(3) // 'test.txt' (original) + 'file1.txt' + 'file2.txt'
      
      // Stage the changes to get a new root
      const newRoot = await files.stage()
      
      // Finalize commit
      await files.finalizeCommit(newRoot.cid)
      
      // Verify changes are cleared
      lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'file1.txt', cid: expect.any(Object), size: expect.any(Number), path: 'file1.txt', type: 'file' },
        { name: 'file2.txt', cid: expect.any(Object), size: expect.any(Number), path: 'file2.txt', type: 'file' },
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' }
      ])
    })
  })

  describe('mkdir', () => {
    beforeEach(async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
    })

    it('should list folder in ls when mkdir is called', async () => {
      await files.mkdir('/newfolder')
      
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' },
        { name: 'newfolder', cid: expect.any(Object), size: expect.any(Number), path: 'newfolder', type: 'directory', change: CHANGE_TYPE.NEW }
      ])
    })

    it('should create folder if commit without any files in the folder', async () => {
      await files.mkdir('/emptyfolder')
      
      // Stage the changes
      const stagedResult = await files.stage()
      
      // Finalize the commit
      await files.finalizeCommit(stagedResult.cid)
      
      // Verify the folder is not in the ls after commit
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'emptyfolder', cid: expect.any(Object), size: expect.any(Number), path: 'emptyfolder', type: 'directory' },
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' }
      ])
    })

    it('should create folder if files are added to the folder', async () => {
      await files.mkdir('/newfolder')
      await files.add('/newfolder/file.txt', new TextEncoder().encode('file content'))
      
      // Stage the changes
      const stagedResult = await files.stage()
      
      // Finalize the commit
      await files.finalizeCommit(stagedResult.cid)
      
      // Verify the folder and file are in the ls after commit
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'newfolder', cid: expect.any(Object), size: expect.any(Number), path: 'newfolder', type: 'directory' },
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' }
      ])
      
      // Check the folder contents
      const folderLs = await files.ls('/newfolder')
      expect(folderLs).toEqual([
        { name: 'file.txt', cid: expect.any(Object), size: expect.any(Number), path: 'newfolder/file.txt', type: 'file' }
      ])
    })

    it('should not create duplicate mkdir changes for same folder', async () => {
      await files.mkdir('/newfolder')
      await expect(files.mkdir('/newfolder')).rejects.toThrow('Directory or file already exists: /newfolder')
      
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' },
        { name: 'newfolder', cid: expect.any(Object), size: expect.any(Number), path: 'newfolder', type: 'directory', change: CHANGE_TYPE.NEW }
      ])
    })

    it('should not create mkdir change if folder already exists', async () => {
      // First create the folder with a file
      await files.mkdir('/newfolder')
      await files.add('/newfolder/file.txt', new TextEncoder().encode('file content'))
      
      // Stage and commit to create the folder
      const stagedResult = await files.stage()
      await files.finalizeCommit(stagedResult.cid)
      
      // Try to mkdir the same folder again
      await expect(files.mkdir('/newfolder')).rejects.toThrow('Directory or file already exists: /newfolder')
      
      const lsResult = await files.ls('/')
      expect(lsResult).toEqual([
        { name: 'newfolder', cid: expect.any(Object), size: expect.any(Number), path: 'newfolder', type: 'directory' },
        { name: 'test.txt', cid: expect.any(Object), size: expect.any(Number), path: 'test.txt', type: 'file' }
      ])
      const lsFolder = await files.ls('/newfolder')
      expect(lsFolder).toEqual([
        { name: 'file.txt', cid: expect.any(Object), size: expect.any(Number), path: 'newfolder/file.txt', type: 'file' }
      ])
    })
  })
})
