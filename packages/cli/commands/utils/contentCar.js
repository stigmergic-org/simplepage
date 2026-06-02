import { globSource } from '@helia/unixfs'
import all from 'it-all'
import nodeFs from 'fs'

import { emptyUnixfs, walkDag } from '@simplepg/common'

export async function buildContentDag(path) {
  const { fs, blockstore } = emptyUnixfs()
  const isFile = nodeFs.statSync(path).isFile()

  let root
  if (isFile) {
    root = await fs.addBytes(nodeFs.readFileSync(path))
  } else {
    const entries = await all(globSource(path, '**/*'))
    if (entries.length === 0) {
      throw new Error('No files found')
    }

    root = await fs.addDirectory()
    for await (const entry of fs.addAll(entries)) {
      entry.path = entry.path.startsWith('/') ? entry.path.slice(1) : entry.path
      if (entry.path.split('/').length === 1) {
        root = await fs.cp(entry.cid, root, entry.path)
      }
    }
  }

  return {
    root,
    blocks: await walkDag(blockstore, root)
  }
}
