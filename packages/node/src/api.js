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

const allowedOriginLabels = new Set(['eth', 'wei'])

const hasAllowedOriginLabel = (labels) => labels.some(label => allowedOriginLabels.has(label))

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

  return hasAllowedOriginLabel(labels)
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
 * @typedef {object} RefRecord
 * @property {string} domain - ENS name
 * @property {string} refId - Ref identifier
 * @property {number} sequence - Monotonic revision number
 * @property {string} contentCid - CID for the referenced content
 * @property {string} didKey - did:key signer identifier
 * @property {string} signature - Signature for the ref payload
 * @property {string} siweMessage - Signed SIWE message
 * @property {string} siweSignature - Signature for the SIWE message
 * @property {string} ownerAddress - ENS owner address that authorized the ref
 * @property {string} issuedAt - ISO timestamp from the SIWE payload
 * @property {string|null} agentName - Optional agent name authorized by the SIWE
 * @property {boolean} latest - Whether this is the latest revision for the ref id
 */

/**
 * @typedef {object} RefResponse
 * @property {RefRecord} ref - Stored ref record
 */

/**
 * @typedef {object} RefsResponse
 * @property {RefRecord[]} refs - Stored ref records for the ENS name
 */

/**
 * @typedef {object} CapabilityRecord
 * @property {string} domain - ENS name
 * @property {string} key - Authorized did:key
 * @property {string} didKey - Authorized did:key
 * @property {string} siweMessage - Signed SIWE message
 * @property {string} siweSignature - SIWE signature
 * @property {string} ownerAddress - ENS owner address that granted the capability
 * @property {string} issuedAt - ISO timestamp from the SIWE payload
 * @property {string} expiresAt - ISO expiry timestamp
 * @property {string} nonce - SIWE nonce
 * @property {string|null} agentName - Optional agent name authorized by the SIWE
 */

/**
 * @typedef {object} CapabilityBody
 * @property {string} key.required - Authorized did:key
 * @property {string} agentName - Optional agent name to bind into the SIWE capability
 * @property {string} siweMessage.required - Signed SIWE message
 * @property {string} siweSignature.required - SIWE signature
 */

/**
 * @typedef {object} CapabilityResponse
 * @property {CapabilityRecord|null} capability - Stored capability
 */

/**
 * @typedef {object} CapabilitiesResponse
 * @property {CapabilityRecord[]} capabilities - Stored capabilities
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

  const getUploadSubscriptionStatus = async (domain) => {
    let subscriptionStatus = await ipfs.subscriptionIndex.getStatus(domain)
    if (subscriptionStatus.status === 'active') {
      return subscriptionStatus
    }
    if (typeof _indexer?.refreshDomainRegistration !== 'function') {
      return subscriptionStatus
    }
    try {
      const refreshed = await _indexer.refreshDomainRegistration(domain, 'upload')
      if (refreshed) {
        subscriptionStatus = await ipfs.subscriptionIndex.getStatus(domain)
      }
    } catch (error) {
      logger.warn('Error refreshing domain subscription status', {
        domain,
        error: error.message
      })
    }
    return subscriptionStatus
  }

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
      const subscriptionStatus = await getUploadSubscriptionStatus(domain)
      if (subscriptionStatus.status !== 'active') {
        const reason = subscriptionStatus.status
        const detail = subscriptionStatus.status === 'expired'
          ? 'Subscription expired'
          : 'Subscription not found'
        const response = { detail, reason }
        if (subscriptionStatus.expiresAt) {
          response.expiresAt = subscriptionStatus.expiresAt
        }
        logger.warn('Domain subscription not active', { domain, reason })
        res.status(401).json(response)
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
   * POST /refs/{ensName}
   * @tags Ref Operations
   * @summary Store a signed off-chain ref revision
   * @param {string} ensName.path.required - The ENS name for the ref
   * @param {FileUpload} request.body.required - CAR file containing content and signed ref metadata - multipart/form-data
   * @returns {RefResponse} 200 - Successfully stored ref - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   * @returns {ErrorResponse} 401 - Invalid signature or owner authorization - application/json
   * @returns {ErrorResponse} 413 - File too large (max 500MB) - application/json
   */
  app.post('/refs/:ensName', preUploadLimiter, upload.single('file'), postUploadLimiter, async (req, res) => {
    try {
      const { ensName } = req.params
      if (!ensName) {
        logger.warn('Missing ENS name parameter in POST /refs request')
        return res.status(400).json({ detail: 'Missing ENS name parameter' })
      }

      if (!req.file) {
        logger.warn('Missing file upload in POST /refs request', { ensName })
        return res.status(400).json({ detail: 'Missing file upload' })
      }

      const subscriptionStatus = await getUploadSubscriptionStatus(ensName)
      if (subscriptionStatus.status !== 'active') {
        const reason = subscriptionStatus.status
        const detail = subscriptionStatus.status === 'expired'
          ? 'Subscription expired'
          : 'Subscription not found'
        const response = { detail, reason }
        if (subscriptionStatus.expiresAt) {
          response.expiresAt = subscriptionStatus.expiresAt
        }
        logger.warn('Domain subscription not active for ref upload', { ensName, reason })
        return res.status(401).json(response)
      }

      const ref = await ipfs.putRefCar(req.file.buffer, ensName)
      res.json({ ref })
    } catch (error) {
      logger.error('Error storing ref', {
        ensName: req.params.ensName,
        error: error.message,
        stack: error.stack
      })
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ detail: 'File too large. Maximum size is 500MB.' })
      }
      if (/signature|SIWE|owner|did:key/i.test(error.message)) {
        return res.status(401).json({ detail: error.message })
      }
      return res.status(400).json({ detail: error.message })
    }
  })

  /**
   * GET /refs/{ensName}
   * @tags Ref Operations
   * @summary List signed off-chain refs for an ENS name
   * @param {string} ensName.path.required - The ENS name for the refs
   * @returns {RefsResponse} 200 - Ref list - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   */
  app.get('/refs/:ensName', async (req, res) => {
    try {
      const { ensName } = req.params
      if (!ensName) {
        logger.warn('Missing ENS name parameter in GET /refs request')
        return res.status(400).json({ detail: 'Missing ENS name parameter' })
      }

      if (!ipfs?.refIndex) {
        return res.status(503).json({ detail: 'Ref index unavailable' })
      }

      const refs = await ipfs.refIndex.listRefs(ensName)
      return res.json({ refs })
    } catch (error) {
      logger.error('Error listing refs', {
        ensName: req.params.ensName,
        error: error.message,
        stack: error.stack
      })
      return res.status(500).json({ detail: error.message })
    }
  })

  /**
   * POST /capabilities/{ensName}
   * @tags Capability Operations
   * @summary Store a signing capability for an ENS name
   * @param {string} ensName.path.required - ENS name
   * @param {CapabilityBody} request.body.required - Signed SIWE capability payload - application/json
   * @returns {CapabilityResponse} 200 - Stored capability - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   * @returns {ErrorResponse} 401 - Unauthorized capability - application/json
   */
  app.post('/capabilities/:ensName', async (req, res) => {
    try {
      const { ensName } = req.params
      if (!ensName) {
        logger.warn('Missing ENS name parameter in POST /capabilities request')
        return res.status(400).json({ detail: 'Missing ENS name parameter' })
      }

      if (!ipfs?.capabilityStore) {
        return res.status(503).json({ detail: 'Capability store unavailable' })
      }

      const payload = {
        ...req.body,
        domain: ensName,
        didKey: req.body?.didKey || req.body?.key,
      }
      const capability = await ipfs.capabilityStore.putCapability(payload)
      return res.json({ capability })
    } catch (error) {
      logger.error('Error storing capability', {
        ensName: req.params.ensName,
        error: error.message,
        stack: error.stack
      })
      if (/SIWE|owner|did:key/i.test(error.message)) {
        return res.status(401).json({ detail: error.message })
      }
      return res.status(400).json({ detail: error.message })
    }
  })

  /**
   * GET /capabilities/{ensName}
   * @tags Capability Operations
   * @summary Read signing capabilities for an ENS name
   * @param {string} ensName.path.required - ENS name
   * @returns {CapabilitiesResponse} 200 - Capability list - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   */
  app.get('/capabilities/:ensName', async (req, res) => {
    try {
      const { ensName } = req.params
      if (!ensName) {
        logger.warn('Missing ENS name parameter in GET /capabilities request')
        return res.status(400).json({ detail: 'Missing ENS name parameter' })
      }

      if (!ipfs?.capabilityStore) {
        return res.status(503).json({ detail: 'Capability store unavailable' })
      }

      return res.json({ capabilities: ipfs.capabilityStore.listCapabilities(ensName) })
    } catch (error) {
      logger.error('Error listing capabilities', {
        ensName: req.params.ensName,
        error: error.message,
        stack: error.stack
      })
      return res.status(500).json({ detail: error.message })
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
    const startedAt = Date.now()
    try {
      const { domain } = req.query
      if (!domain) {
        logger.warn('Missing domain parameter in GET /history request')
        return res.status(400).json({ detail: 'Missing domain parameter' })
      }

      logger.info('History request received', { domain })
      const car = await ipfs.getHistory(domain)
      res.setHeader('Content-Type', 'application/vnd.ipld.car')
      res.send(car)
      logger.info('History request completed', {
        domain,
        bytes: car.length,
        durationMs: Date.now() - startedAt
      })
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
