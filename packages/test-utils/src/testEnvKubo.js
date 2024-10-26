import { createNode } from 'ipfsd-ctl'
import { path } from 'kubo'
import { create } from 'kubo-rpc-client'
import Path from 'path'
import os from 'os'
import fs from 'fs'

export class TestEnvironmentKubo {
  constructor() {
    this.node = null;
    this.testRepoPath = Path.join(os.tmpdir(), `ipfs-test-${Date.now()}`)
  }

  async start() {
    const port = 45001
    console.log('Starting Kubo node...', path())
    this.node = await createNode({
      type: 'kubo',
      test: true,
      disposable: true,
      bin: path(),
      rpc: create,
      args: [
        '--api', `/ip4/127.0.0.1/tcp/${port}`,
        '--gateway', `/ip4/127.0.0.1/tcp/${port + 1}`,
        '--offline',
        '--repo', this.testRepoPath
      ]
    })
    this.url = `http://localhost:${port}`
    this.kuboApi = this.node.api
    return this.kuboApi
  }

  async stop() {
    if (this.node) {
      await this.node.stop()
    }
    // clean up test repo
    if (fs.existsSync(this.testRepoPath)) {
      fs.rmSync(this.testRepoPath, { recursive: true, force: true });
    }
  }
}