import { IpfsService } from './services/ipfs.js'
import { IndexerService } from './services/indexer.js'
import { createApi } from './api.js'
import { createLogger } from './logger.js'
import packageJson from '../package.json' assert { type: 'json' }
import http from 'http'
import https from 'https'
import fs from 'fs'

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
    this.logger = null
  }

  async initialize() {
    // Create logger instance
    this.logger = await createLogger({
      level: this.config.logLevel || 'info',
      silent: this.config.silent || false,
      logDir: this.config.logDir
    })
  }

  async start() {
    try {
      // Initialize logger if not already done
      if (!this.logger) {
        await this.initialize()
      }
      
      this.logger.info('Starting DService', { version: this.config.version })
      
      // Initialize IPFS service
      this.logger.info('Initializing IPFS service')
      this.ipfs = new IpfsService({ ...this.config.ipfs, logger: this.logger })
      const healthy = await this.ipfs.healthCheck()
      if (!healthy) {
        this.logger.error('IPFS health check failed')
        throw new Error('Cannot connect to IPFS node')
      }
      this.logger.info('IPFS service initialized successfully')

      // Initialize Indexer service
      this.logger.info('Initializing Indexer service')
      this.indexer = new IndexerService({ 
        ...this.config.blockchain, 
        ipfsService: this.ipfs,
        logger: this.logger 
      })
      if (!this.config.blockchain.disableIndexing) {
        this.indexer.start()
        this.logger.info('Indexer service started')
      } else {
        this.logger.info('Indexer service disabled')
      }
      
      // Create API app
      this.logger.info('Creating API application')
      this.app = createApi({ 
        ipfs: this.ipfs, 
        indexer: this.indexer, 
        version: this.config.version,
        logger: this.logger
      })

      // Start server
      this.serverPromise = new Promise((resolve, reject) => {
        // Ensure we bind to IPv4 by using '0.0.0.0' for all interfaces or '127.0.0.1' for localhost
        const bindHost = this.config.api.host === 'localhost' ? '127.0.0.1' : this.config.api.host
        const port = this.config.api.port
        const tls = this.config.api.tls
        let protocol = 'http'
        let server
        let tlsOptions = undefined
        if (tls && tls.key && tls.cert) {
          // Read TLS files from disk
          try {
            tlsOptions = {
              key: fs.readFileSync(tls.key),
              cert: fs.readFileSync(tls.cert)
            }
            protocol = 'https'
            server = https.createServer(tlsOptions, this.app)
          } catch (err) {
            this.logger.error('Failed to read TLS files', { error: err.message })
            process.exit(1)
          }
        } else {
          server = this.app
        }
        const listenFn = (err) => {
          if (err) {
            this.logger.error('Failed to start server', { error: err.message })
            reject(err)
            return
          }
          this.logger.info('Server started successfully', {
            host: this.config.api.host,
            port: port,
            protocol,
            swaggerUrl: `${protocol}://${this.config.api.host}:${port}/docs`
          })
          if (!this.config.silent) {
            const configForLog = { ...this.config }
            delete configForLog.ipfs.ipfsClient
            this.logger.debug('DService configuration', configForLog)
          }
          resolve()
        }
        if (protocol === 'https') {
          this.server = server.listen(port, bindHost, listenFn)
        } else {
          this.server = server.listen(port, bindHost, listenFn)
        }
      })
    } catch (error) {
      this.logger.error('Failed to start DService', { 
        error: error.message, 
        stack: error.stack 
      })
      throw error
    }
    await this.serverPromise
  }

  async stop() {
    try {
      this.logger.info('Stopping DService')
      
      if (this.server) {
        await this.serverPromise
        await new Promise((resolve, reject) => {
          this.server.close((err) => {
            if (err) {
              this.logger.error('Error stopping server', { error: err.message })
              reject(err)
            } else {
              this.logger.info('Server stopped successfully')
              resolve()
            }
          })
        })
      }
      
      if (this.indexer) {
        this.logger.info('Stopping Indexer service')
        await this.indexer.stop()
        this.logger.info('Indexer service stopped')
      }
      
      this.logger.info('DService stopped successfully')
    } catch (error) {
      this.logger.error('Failed to stop DService', { 
        error: error.message, 
        stack: error.stack 
      })
      throw error
    }
  }
} 