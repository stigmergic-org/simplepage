import express from 'express'
import expressJSDocSwagger from 'express-jsdoc-swagger'
import swaggerUi from 'swagger-ui-express'
import multer from 'multer'
import cors from 'cors'
import { CID } from 'multiformats/cid'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createUploadRateLimiters, getClientIp, resolveUploadRateLimits } from './rateLimit.js'

// Get current file's directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const localhostHosts = new Set(['localhost', '127.0.0.1', '::1'])

const isCidLabel = (label) => {
  try {
    CID.parse(label)
    return true
  } catch {
    return false
  }
}

const hasEthLabel = (labels) => labels.includes('eth')

const isBlockedIpfsOrigin = (labels) => {
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i] === 'ipfs' && isCidLabel(labels[i - 1])) {
      return true
    }
  }
  return false
}

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  if (typeof origin !== 'string' || origin === 'null') return false

  let hostname
  try {
    hostname = new URL(origin).hostname.toLowerCase()
  } catch {
    return false
  }

  if (localhostHosts.has(hostname)) return true

  const labels = hostname.split('.').filter(Boolean)
  if (labels.length === 0) return false
  if (isBlockedIpfsOrigin(labels)) return false

  return hasEthLabel(labels)
}

// Move error class into api.js
class HTTPError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
    this.name = 'HTTPError'
  }
}

/**
 * @typedef {object} ErrorResponse
 * @property {string} detail - Error message details
 */

/**
 * @typedef {object} PageResponse
 * @property {string} cid - The CID of the uploaded content
 */

/**
 * @typedef {object} InfoResponse
 * @property {string} version - API version
 */

/**
 * @typedef {object} FileUpload
 * @property {string} file.required - The CAR file to upload - binary
 */

export function createApi({ ipfs, _indexer, version, logger, rateLimits = {}, trustProxy = false }) {
  const app = express()
  app.set('trust proxy', Boolean(trustProxy))
  const upload = multer({
    limits: {
      fileSize: 500 * 1024 * 1024 // 500MB limit
    }
  })

  // Setup CORS middleware
  const corsOptions = {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
  app.use(cors(corsOptions))

  // Setup middleware
  app.use(express.json())
  
  // Request logging middleware
  app.use((req, res, next) => {
    const clientIP = getClientIp(req)
    const userAgent = req.get('User-Agent') || 'unknown'
    const startTime = Date.now()
    
    logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      ip: clientIP,
      userAgent: userAgent,
      timestamp: new Date().toISOString()
    })
    
    // Log response when it completes
    res.on('finish', () => {
      const duration = Date.now() - startTime
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        ip: clientIP,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      })
    })
    
    next()
  })
  
  // Setup Swagger generation
  logger.info('Setting up OpenAPI generation', {
    __dirname,
    __filename,
    baseDir: __dirname,
    filesPattern: [__filename]
  })
  
  const options = {
    info: {
      version: version,
      title: 'SimplePage API',
      description: 'API for the SimplePage application',
    },
    baseDir: __dirname,
    // Use the current file directly - this should work regardless of global vs local install
    filesPattern: [__filename],
    // Enable serving UI and JSON
    exposeApiDocs: true,
    apiDocsPath: '/openapi.json',
    // Additional options to ensure proper scanning
    multiple: true
  }

  // Generate OpenAPI spec
  const instance = expressJSDocSwagger(app)(options)

  // Add error handling for OpenAPI generation
  instance.on('error', (error) => {
    logger.error('OpenAPI generation error', { error: error.message, stack: error.stack })
  })

  // Wait for the spec to be generated
  instance.on('finish', (swaggerDef) => {
    logger.info('OpenAPI spec generated successfully', { 
      paths: Object.keys(swaggerDef.paths || {}),
      pathCount: Object.keys(swaggerDef.paths || {}).length
    })
    
    // Setup Swagger UI with custom title and hidden header
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDef, {
      customSiteTitle: 'SimplePage API',
      customCss: '.swagger-ui .topbar { display: none }'
    }))
    
    logger.info('Swagger UI setup complete at /docs')
  })

  const maxStagedAgeSeconds = Number.isFinite(ipfs?.maxStagedAge) ? ipfs.maxStagedAge : 60 * 60
  const uploadRateLimits = resolveUploadRateLimits({ rateLimits, maxStagedAgeSeconds })
  const { preUploadLimiter, postUploadLimiter } = createUploadRateLimiters({
    logger,
    ...uploadRateLimits
  })

  /**
   * GET /page
   * @tags Page Operations
   * @summary Get page by CID
   * @param {string} cid.query.required - The CID of the page to retrieve
   * @produces application/vnd.ipld.car
   * @returns {string} 200 - CAR file containing the page data - application/vnd.ipld.car
   * @returns {ErrorResponse} 404 - Not found error - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   */
  app.get('/page', async (req, res, _next) => {
    try {
      const { cid } = req.query
      if (!cid) {
        logger.warn('Missing CID parameter in GET /page request')
        throw new HTTPError(400, 'Missing cid parameter')
      }

      logger.info('Retrieving page', { cid })
      const carFile = await ipfs.readCarLite(cid)
      logger.info('Page CAR retrieved successfully', { cid, fileSize: carFile.length })
      res.setHeader('Content-Type', 'application/vnd.ipld.car')
      res.send(carFile)
    } catch (err) {
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        logger.error('Error retrieving page', { 
          cid: req.query.cid, 
          error: err.message,
          stack: err.stack 
        })
        if (err instanceof HTTPError) {
          res.status(err.statusCode).json({ detail: err.message })
        } else {
          res.status(404).json({ detail: err.message })
        }
      }
    }
  })

  /**
   * GET /file
   * @tags File Operations
   * @summary Get raw IPFS block by CID
   * @param {string} cid.query.required - The CID of the IPFS block to retrieve
   * @produces application/vnd.ipld.raw
   * @returns {string} 200 - Raw IPFS block data - application/vnd.ipld.raw
   * @returns {ErrorResponse} 404 - Not found error - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   */
  app.get('/file', async (req, res, _next) => {
    try {
      const { cid } = req.query
      if (!cid) {
        logger.warn('Missing CID parameter in GET /file request')
        throw new HTTPError(400, 'Missing cid parameter')
      }

      logger.debug('Retrieving raw IPFS block', { cid })
      const blockData = await ipfs.readBlock(cid)
      logger.debug('Raw IPFS block retrieved successfully', { cid, blockSize: blockData.length })
      res.setHeader('Content-Type', 'application/vnd.ipld.raw')
      res.send(blockData)
    } catch (err) {
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        logger.error('Error retrieving raw IPFS block', {
          cid: req.query.cid,
          error: err.message,
          stack: err.stack
        })
        if (err instanceof HTTPError) {
          res.status(err.statusCode).json({ detail: err.message })
        } else {
          res.status(404).json({ detail: err.message })
        }
      }
    }
  })

  /**
   * POST /page
   * @tags Page Operations
   * @summary Upload a new page
   * @param {string} domain.query.required - The domain for the page
   * @param {FileUpload} request.body.required - CAR file (max 500MB) - multipart/form-data
   * @returns {PageResponse} 200 - Successfully uploaded page - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   * @returns {ErrorResponse} 401 - Unauthorized (domain not subscribed) - application/json
   * @returns {ErrorResponse} 413 - File too large (max 500MB) - application/json
   * @returns {ErrorResponse} 500 - Server error - application/json
   */
  app.post('/page', preUploadLimiter, upload.single('file'), postUploadLimiter, async (req, res, _next) => {
    try {
      const { domain } = req.query
      if (!domain) {
        logger.warn('Missing domain parameter in POST /page request')
        return res.status(400).json({ detail: 'Missing domain parameter' })
      }
      const hasSubscription = await ipfs.mfs.domainExists(domain)
      if (!hasSubscription) {
        logger.warn('Domain does not have a subscription', { domain })
        res.status(401).json({ detail: `Domain ${domain} does not have a subscription` })
        return
      }

      const file = req.file

      if (!file) {
        logger.warn('Missing file upload in POST /page request')
        return res.status(400).json({ detail: 'Missing file upload' }) 
      }

      logger.info('Uploading CAR file', { domain, fileSize: file.buffer.length })
      const cid = await ipfs.stageCar(file.buffer, domain)
      logger.info('CAR file uploaded successfully', { domain, cid: cid.toString() })
      res.json({ cid: cid.toString() })
    } catch (err) {
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        logger.error('Error uploading page', { 
          domain: req.query.domain, 
          error: err.message,
          stack: err.stack 
        })
        // Handle multer file size limit error
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ detail: 'File too large. Maximum size is 500MB.' })
        } else if (err.message?.includes('CAR root must be UnixFS')) {
          res.status(400).json({ detail: err.message })
        } else {
          res.status(500).json({ detail: err.message })
        }
      }
    }
  })

  /**
   * GET /info
   * @tags System
   * @summary Get API information
   * @produces application/json
   * @returns {InfoResponse} 200 - Version information - application/json
   */
  app.get('/info', (req, res) => {
    res.json({
      version: version
    })
  })

  app.get('/history', async (req, res) => {
    try {
      const { domain } = req.query
      if (!domain) {
        logger.warn('Missing domain parameter in GET /history request')
        return res.status(400).json({ detail: 'Missing domain parameter' })
      }

      const car = await ipfs.getHistory(domain)
      res.setHeader('Content-Type', 'application/vnd.ipld.car')
      res.send(car)
    } catch (error) {
      logger.error('Error retrieving history', { domain: req.query.domain, error: error.message, stack: error.stack })
      res.status(500).json({ detail: error.message })
    }
  })

  // Add a fallback route to manually serve OpenAPI spec
  app.get('/openapi.json', (req, res) => {
    logger.info('OpenAPI JSON requested')
    if (instance && instance.swaggerObject) {
      logger.info('Serving OpenAPI spec', { 
        pathCount: Object.keys(instance.swaggerObject.paths || {}).length 
      })
      res.json(instance.swaggerObject)
    } else {
      logger.warn('OpenAPI spec not ready yet')
      res.status(503).json({ error: 'OpenAPI spec not ready' })
    }
  })
  
  return app
}
