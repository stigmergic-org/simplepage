import { Files, FILES_ROOT } from '../src/files.js'
import { CHANGE_TYPE } from '../src/constants.js'
import { emptyUnixfs, ls, CidSet } from '@simplepg/common'
import { jest } from '@jest/globals'
import { CID } from 'multiformats/cid'

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

    it('should handle non-cached files', async () => {
      // Add some files and folders
      await files.rm('test.txt')
      await files.add('file1.txt', new TextEncoder().encode('content1'))
      await files.add('file2.txt', new TextEncoder().encode('content2'))
      await files.mkdir('/folder1')
      await files.add('/folder1/file3.txt', new TextEncoder().encode('content3'))
      await files.add('/folder2/file4.txt', new TextEncoder().encode('content4'))
      await files.add('/folder3/subfolder/file6.txt', new TextEncoder().encode('content6'))
      
      // Stage and finalize
      const stagedResult = await files.stage()
      await files.finalizeCommit(stagedResult.cid)
      
      // Create new files instance with new unixfs and blockstore
      const { fs: newFs, blockstore: newBlockstore } = emptyUnixfs()
      const newFiles = new Files(newFs, newBlockstore, mockDservice, mockEnsureRepoData, mockStorage)

      mockDservice.fetch.mockImplementation(async (path) => {
        const cid = path.split('?cid=')[1]
        const block = await blockstore.get(CID.parse(cid))
        return {
          status: 200,
          arrayBuffer: jest.fn().mockResolvedValue(block)
        }
      })
      
      // Copy the staged result blocks from old blockstore to new blockstore
      const rootBlock = await blockstore.get(stagedResult.cid)
      await newBlockstore.put(stagedResult.cid, rootBlock)
      
      // Create a repo root with _files directory containing the committed state
      const emptyDir = await newFs.addDirectory()
      const repoRootWithFiles = await newFs.cp(stagedResult.cid, emptyDir, '_files')
      
      // Set the repo root to the new repo root containing _files
      await newFiles.unsafeSetRepoRoot(repoRootWithFiles)

      await newFiles.add('file1.txt', new TextEncoder().encode('content1-updated'))
      await newFiles.add('/folder2/file5.txt', new TextEncoder().encode('content5'))
      await newFiles.add('/folder3/subfolder/file7.txt', new TextEncoder().encode('content7'))
      
      // Stage again (without changes)
      const newStagedResult = await newFiles.stage()
      
      // Ensure unchangedCids are correct - should contain all the CIDs from the committed state
      expect(Array.from(newStagedResult.unchangedCids.values())).toEqual([
        (await fs.stat(stagedResult.cid, { path: '/file2.txt' })).cid.toString(),
        (await fs.stat(stagedResult.cid, { path: '/folder1' })).cid.toString(),
        (await fs.stat(stagedResult.cid, { path: '/folder2/file4.txt' })).cid.toString(),
        (await fs.stat(stagedResult.cid, { path: '/folder3/subfolder/file6.txt' })).cid.toString()
      ])
      
      // Ensure mockDservice is called as expected (if any fetch calls are made during content loading)
      // The mockDservice.fetch should be called when ensuring content for non-cached CIDs
      expect(mockDservice.fetch).toHaveBeenCalled()
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

  describe('avatar methods', () => {
    beforeEach(async () => {
      await files.unsafeSetRepoRoot(repoRootCid)
    })

    it('should set avatar with correct filename', async () => {
      const avatarContent = new TextEncoder().encode('avatar image data')
      const fileExt = 'png'
      
      await files.setAvatar(avatarContent, fileExt)
      
      // Verify avatar is added to the filesystem
      const lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.png',
        type: 'file',
        change: CHANGE_TYPE.NEW
      }))
      
      // Verify avatar content can be read
      const readContent = await files.cat('/.avatar.png')
      expect(readContent).toEqual(avatarContent)
    })

    it('should replace existing avatar when setting new one', async () => {
      // First set an avatar
      const firstAvatar = new TextEncoder().encode('first avatar')
      await files.setAvatar(firstAvatar, 'jpg')
      
      // Set a different avatar
      const secondAvatar = new TextEncoder().encode('second avatar')
      await files.setAvatar(secondAvatar, 'png')
      
      // Verify only the new avatar exists
      const lsResult = await files.ls('/')
      const avatarFiles = lsResult.filter(f => f.name.startsWith('.avatar.'))
      expect(avatarFiles).toHaveLength(1)
      expect(avatarFiles[0]).toEqual(expect.objectContaining({
        name: '.avatar.png',
        type: 'file',
        change: CHANGE_TYPE.NEW
      }))
      
      // Verify old avatar content is gone
      await expect(files.cat('/.avatar.jpg')).rejects.toThrow()
      
      // Verify new avatar content is correct
      const readContent = await files.cat('/.avatar.png')
      expect(readContent).toEqual(secondAvatar)
    })

    it('should get avatar path with prefix when noPrefix is false', async () => {
      const avatarContent = new TextEncoder().encode('avatar data')
      await files.setAvatar(avatarContent, 'svg')
      
      const avatarPath = await files.getAvatarPath(false)
      expect(avatarPath).toBe(`/${FILES_ROOT}/.avatar.svg`)
    })

    it('should get avatar path without prefix when noPrefix is true', async () => {
      const avatarContent = new TextEncoder().encode('avatar data')
      await files.setAvatar(avatarContent, 'gif')
      
      const avatarPath = await files.getAvatarPath(true)
      expect(avatarPath).toBe('.avatar.gif')
    })

    it('should return undefined when no avatar is set', async () => {
      const avatarPath = await files.getAvatarPath()
      expect(avatarPath).toBeUndefined()
    })

    it('should return undefined when no avatar is set (noPrefix true)', async () => {
      const avatarPath = await files.getAvatarPath(true)
      expect(avatarPath).toBeUndefined()
    })

    it('should handle avatar with different file extensions', async () => {
      const extensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp']
      
      for (const ext of extensions) {
        const avatarContent = new TextEncoder().encode(`avatar ${ext}`)
        await files.setAvatar(avatarContent, ext)
        
        const avatarPath = await files.getAvatarPath()
        expect(avatarPath).toBe(`/${FILES_ROOT}/.avatar.${ext}`)
        
        // Verify content
        const readContent = await files.cat(`/.avatar.${ext}`)
        expect(readContent).toEqual(avatarContent)
      }
    })

    it('should stage avatar changes correctly', async () => {
      const avatarContent = new TextEncoder().encode('staged avatar')
      await files.setAvatar(avatarContent, 'png')
      
      // Stage the changes
      const stagedResult = await files.stage()
      
      // Verify the new root is different
      expect(stagedResult.cid.toString()).not.toBe(filesCid.toString())
      
      // Finalize commit
      await files.finalizeCommit(stagedResult.cid)
      
      // Verify avatar is now part of the committed state
      const lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.png',
        type: 'file'
      }))
      
      // Verify avatar content is accessible
      const readContent = await files.cat('/.avatar.png')
      expect(readContent).toEqual(avatarContent)
    })

    it('should clear avatar changes when clearing all changes', async () => {
      const avatarContent = new TextEncoder().encode('avatar to clear')
      await files.setAvatar(avatarContent, 'jpg')
      
      // Verify avatar is staged
      let lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.jpg',
        change: CHANGE_TYPE.NEW
      }))
      
      // Clear all changes
      await files.clearChanges()
      
      // Verify avatar is no longer in ls
      lsResult = await files.ls('/')
      expect(lsResult).not.toContainEqual(expect.objectContaining({
        name: '.avatar.jpg'
      }))
      
      // Verify avatar is no longer accessible
      await expect(files.cat('/.avatar.jpg')).rejects.toThrow()
    })

    it('should restore avatar to committed state', async () => {
      // First set and commit an avatar
      const originalAvatar = new TextEncoder().encode('original avatar')
      await files.setAvatar(originalAvatar, 'png')
      const stagedResult = await files.stage()
      await files.finalizeCommit(stagedResult.cid)
      
      // Change the avatar
      const newAvatar = new TextEncoder().encode('new avatar')
      await files.setAvatar(newAvatar, 'jpg')
      
      // Verify new avatar is staged
      let lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.jpg',
        change: CHANGE_TYPE.NEW
      }))
      
      // Restore the original avatar
      await files.restore('/.avatar.png')
      
      // Verify original avatar is restored
      lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.png'
      }))
      
      // Verify original content is accessible
      const readContent = await files.cat('/.avatar.png')
      expect(readContent).toEqual(originalAvatar)
    })

    it('should handle avatar removal and restoration', async () => {
      // First set and commit an avatar
      const avatarContent = new TextEncoder().encode('avatar to remove')
      await files.setAvatar(avatarContent, 'png')
      const stagedResult = await files.stage()
      await files.finalizeCommit(stagedResult.cid)
      
      // Remove the avatar
      await files.rm('/.avatar.png')
      
      // Verify avatar is marked for deletion
      let lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.png',
        change: CHANGE_TYPE.DELETE
      }))
      
      // Restore the avatar
      await files.restore('/.avatar.png')
      
      // Verify avatar is no longer marked for deletion
      lsResult = await files.ls('/')
      expect(lsResult).toContainEqual(expect.objectContaining({
        name: '.avatar.png'
      }))
      
      // Verify avatar content is accessible again
      const readContent = await files.cat('/.avatar.png')
      expect(readContent).toEqual(avatarContent)
    })

    it('should handle multiple avatar operations in sequence', async () => {
      // Set first avatar
      const avatar1 = new TextEncoder().encode('avatar 1')
      await files.setAvatar(avatar1, 'png')
      
      // Change to second avatar
      const avatar2 = new TextEncoder().encode('avatar 2')
      await files.setAvatar(avatar2, 'jpg')
      
      // Change to third avatar
      const avatar3 = new TextEncoder().encode('avatar 3')
      await files.setAvatar(avatar3, 'gif')
      
      // Verify only the last avatar exists
      const lsResult = await files.ls('/')
      const avatarFiles = lsResult.filter(f => f.name.startsWith('.avatar.'))
      expect(avatarFiles).toHaveLength(1)
      expect(avatarFiles[0]).toEqual(expect.objectContaining({
        name: '.avatar.gif',
        change: CHANGE_TYPE.NEW
      }))
      
      // Verify content is correct
      const readContent = await files.cat('/.avatar.gif')
      expect(readContent).toEqual(avatar3)
    })
  })
})
