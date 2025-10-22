import { unixfs } from '@helia/unixfs'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagJson from '@ipld/dag-json'
import * as dagPb from '@ipld/dag-pb'
import * as raw from 'multiformats/codecs/raw'
import { CARFactory, CarBlock } from "cartonne";
import all from 'it-all'
import { concat } from 'uint8arrays/concat'
import { CID } from 'multiformats/cid'
import { HybridBlockstore } from './blockstore.js'
import { MemoryBlockstore } from 'blockstore-core/memory'


const carFactory = new CARFactory()
carFactory.codecs.add(dagCbor)
carFactory.codecs.add(dagPb)
carFactory.codecs.add(dagJson)
carFactory.codecs.add(raw)

function getCodec(code) {
  switch (code) {
    case dagCbor.code: return dagCbor
    case dagJson.code: return dagJson
    case dagPb.code: return dagPb
    case raw.code: return raw
    default: throw new Error(`Unknown codec: ${code}`)
  }
}

function fsFromBs(blockstore) {
  const fakeHelia = { blockstore, getCodec }
  return { fs: unixfs(fakeHelia), blockstore }
}

export function browserUnixfs(storage) {
  const blockstore = new HybridBlockstore(storage)
  return fsFromBs(blockstore)
}

export function emptyUnixfs() {
  const blockstore = new MemoryBlockstore()
  return fsFromBs(blockstore)
}

export async function addFile(fs, root, path, content) {
  if (path.startsWith('/')) {
    path = path.slice(1)
  }
  // Split the path into parts to handle intermediate directories
  const pathParts = path.split('/')
  let fileName = pathParts.pop() // Remove the filename from the path parts

  let bytes
  if (typeof content === 'string') {
    bytes = new TextEncoder().encode(content)
  } else if (content instanceof Uint8Array) {
    bytes = content
  } else {
    throw new Error('Content must be a string or Uint8Array')
  }
  let pointer = await fs.addBytes(bytes)

  // Create intermediate directories if needed
  while (pathParts.length > 0) {
    try {
      const { cid } = await fs.stat(root, { path: pathParts.join('/') })
      // we found an existing directory, we need to move the contents into it
      pointer = await fs.cp(pointer, cid, fileName, { force: true })
      fileName = pathParts.pop()
    } catch (error) {
      if (error.code === 'ERR_NOT_FOUND') {
        const dirCid = await fs.addDirectory()
        pointer = await fs.cp(pointer, dirCid, fileName)
        fileName = pathParts.pop()
      } else {
        throw error
      }
    }
  }
  // Copy the file to the final location
  return fs.cp(pointer, root, fileName, { force: true })
}

/**
 * Checks if a directory has children by examining its links.
 * Files are considered to not have children.
 * @param {UnixFs} fs - The ipld unixfs filesystem
 * @param {CID} cid - The CID of the directory to check
 * @returns {boolean} - True if the directory is empty, false otherwise
 */
async function hasChildren(fs, cid) {
  const stat = await fs.stat(cid)
  if (stat.type !== 'directory') {
    return false
  }
  const links = await all(fs.ls(cid))
  return links.length > 0
}

/**
 * Removes a file or directory from an ipld unixfs tree.
 * If the parent directory is empty, it will also be removed.
 * @param {UnixFs} fs - The ipld unixfs filesystem
 * @param {CID} root - The root cid of the tree
 * @param {string} path - The path of the file or directory to remove
 * @param {Object} options - The options for the rm function
 * @param {boolean} options.recursive - Whether to remove empty parent directories (default: true)
 * @returns {CID} - The new root cid of the tree
 */
export async function rm(fs, root, path, { recursive = true } = {}) {
  const pathParts = path.split('/').filter(Boolean)
  // If removing from root directory
  if (pathParts.length === 0) {
    return fs.rm(root, path)
  }
  let { cid: changePointer } = await fs.stat(root, { path: pathParts.join('/') })
  let currentName // The name of the file/directory to remove

  let isTarget = true
  do {
    currentName = pathParts.pop()
    const parentPath = pathParts.join('/')
    const { cid: parentCid } = await fs.stat(root, { path: parentPath })
    const children = await hasChildren(fs, changePointer)
    if (children || !isTarget) {
      changePointer = await fs.cp(changePointer, parentCid, currentName, { force: true })
    } else {
      changePointer = await fs.rm(parentCid, currentName)
      if (!recursive) {
        isTarget = false
      }
    }
  } while (pathParts.length > 0)
  return changePointer
}

export async function cp(fs, itemCid, root, path, { force = true } = {}) {
  const pathParts = path.split('/').filter(Boolean)
  let changePointer = itemCid

  while (pathParts.length > 0) {
    const fileName = pathParts.pop()
    const { cid: parentCid } = await fs.stat(root, { path: pathParts.join('/') })
    changePointer = await fs.cp(changePointer, parentCid, fileName, { force })
  }
  return changePointer
}

export async function cat(fs, root, path) {
  const chunks = await all(fs.cat(root, { path }))
  return new TextDecoder().decode(concat(chunks));
}

export async function lsFull(blockstore, cid) {
  if (cid.code !== dagPb.code) {
    return []
  }
  const bytes = await blockstore.get(cid)
  const node = dagPb.decode(bytes)
  return node.Links
}

/**
 * Lists the contents of a directory.
 * @param {Blockstore} blockstore - The blockstore to use
 * @param {CID} cid - The CID of the directory to list
 * @returns {Promise<[string, CID][]>} Array of [name, CID] tuples for directory contents.
 */
export async function ls(blockstore, cid) {
  return (await lsFull(blockstore, cid)).map(link => [link.Name, link.Hash])
}


export async function cidInFs(fs, cid) {
  try {
    const node = await fs.stat(cid)
    return Boolean(node.cid)
  } catch (error) {
    if (error.code === 'ERR_NOT_FOUND') {
      return false
    }
    throw error
  }
}

export function emptyCar() {
  return carFactory.build()
}

export function carFromBytes(bytes, { verify = true } = {}) {
  return carFactory.fromBytes(bytes, { verify })
}

export class CidSet extends Set {
  constructor(iterable) {
    super()
    if (iterable) {
      for (const item of iterable) {
        this.add(item)
      }
    }
  }
  #v1(cid) {
    if (typeof cid === 'string') {
      cid = CID.parse(cid)
    }
    return cid.toV1().toString()
  }
  add(cid) { 
    cid = this.#v1(cid)
    return super.add(cid)
  }
  has(cid) {
    cid = this.#v1(cid)
    return super.has(cid)
  }
  delete(cid) { 
    cid = this.#v1(cid)
    super.delete(cid)
    return this
  }
}

export async function walkDag(blockstore, cid, seen = new CidSet()) {
  if (seen.has(cid)) return []
  seen.add(cid)

  const bytes = await blockstore.get(cid)
  const blocks = [new CarBlock(cid, new Uint8Array(bytes))]

  // If it's a directory (dag-pb), walk its links
  if (cid.code === dagPb.code) {
    const node = dagPb.decode(bytes)
    for (const link of node.Links) {
      const childBlocks = await walkDag(blockstore, link.Hash, seen)
      blocks.push(...childBlocks)
    }
  }
  return blocks
}

// return an output similar to tree unix command
export async function tree(blockstore, cid, path = '/') {
  let bytes
  try {
    bytes = await blockstore.get(cid)
  } catch (_error) {
    return [path + ' (not found)']
  }
  const output = [path]

  // If it's a directory (dag-pb), walk its links
  if (cid.code === dagPb.code) {
    const node = dagPb.decode(bytes)
    for (const link of node.Links) {
      const childPath = (path !== '/' ? (path + '/') : '/') + link.Name
      const childOutput = await tree(blockstore, link.Hash, childPath)
      output.push(...childOutput)
    }
  }

  return output
}

// returns all child cids of a DAG
export async function getChildCids(blockstore, cid) {
  let cids = new CidSet([cid])
  // If it's a directory (dag-pb), walk its links
  if (cid.code === dagPb.code) {
    const bytes = await blockstore.get(cid)
    const node = dagPb.decode(bytes)
    for (const link of node.Links) {
      const childCids = await getChildCids(blockstore, link.Hash)
      cids = new CidSet([...cids, ...childCids])
    }
  }
  return cids
}