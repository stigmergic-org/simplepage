import { IpfsService } from './services/ipfs.js'
import { IndexerService } from './services/indexer.js'
import { createApi } from './api.js'
import packageJson from '../package.json' assert { type: 'json' }

export class DService {
  constructor(config) {
    this.config = config
    if (!this.config.version) {
      this.config.version = packageJson.version
    }
    this.ipfs = null
    this.indexer = null
    this.app = null
    this.server = null
  }

  async start() {
    try {
      // Initialize IPFS service
      this.ipfs = new IpfsService(this.config.ipfs)
      const healthy = await this.ipfs.healthCheck()
      if (!healthy) {
        throw new Error('Cannot connect to IPFS node')
      }

      // Initialize Indexer service
      this.indexer = new IndexerService({ ...this.config.blockchain, ipfsService: this.ipfs })
      if (!this.config.blockchain.disableIndexing) {
        this.indexer.start()
      }
      
      // Create API app
      this.app = createApi({ 
        ipfs: this.ipfs, 
        indexer: this.indexer, 
        version: this.config.version 
      })

      // Start server
      this.serverPromise = new Promise((resolve, reject) => {
        // Ensure we bind to IPv4 by using '0.0.0.0' for all interfaces or '127.0.0.1' for localhost
        const bindHost = this.config.api.host === 'localhost' ? '127.0.0.1' : this.config.api.host
        
        this.server = this.app.listen(this.config.api.port, bindHost, (error) => {
          if (error) {
            reject(error)
            return
          }
          if (!this.config.silent) {
            delete this.config.ipfs.ipfsClient
            console.log(`Server listening at http://${this.config.api.host}:${this.config.api.port}`)
            console.log(`Swagger UI: http://${this.config.api.host}:${this.config.api.port}/docs`)
            console.log(`Config: ${JSON.stringify(this.config, null, 2)}`)
          }
          resolve()
        })
      })
    } catch (error) {
      console.log('error', error)
      console.error('Failed to start DService:', error.message)
      throw error
    }
    await this.serverPromise
  }

  async stop() {
    try {
      if (this.server) {
        await this.serverPromise
        await new Promise((resolve, reject) => {
          this.server.close((err) => {
            if (err) {
              console.error('Error stopping server:', err)
              reject(err)
            } else {
              console.log('Server stopped successfully')
              resolve()
            }
          })
        })
      }
      if (this.indexer) {
        await this.indexer.stop()
      }
    } catch (error) {
      console.error('Failed to stop DService:', error.message)
      throw error
    }
  }
} 