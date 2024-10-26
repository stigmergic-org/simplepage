import express from 'express'
import expressJSDocSwagger from 'express-jsdoc-swagger'
import swaggerUi from 'swagger-ui-express'
import multer from 'multer'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Get current file's directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

export function createApi({ ipfs, indexer, version }) {
  const app = express()
  const upload = multer()

  // Setup CORS middleware
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true)
      
      // Allow localhost
      if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
        return callback(null, true)
      }
      // allow ipfs gateway like *.ipfs.localhost:8082 where * is an arbitrary cid
      const ipfsGatewayPattern = /\.ipfs\.localhost:8082$/
      if (ipfsGatewayPattern.test(origin)) {
        return callback(null, true)
      }
      const ipfsGatewayPattern2 = /\.ipfs\.inbrowser\.link$/
      if (ipfsGatewayPattern2.test(origin)) {
        return callback(null, true)
      }
      
      // Allow ENS domains
      const ensPatterns = [
        /\.eth\.link$/,
        /\.eth\.limo$/,
        /\.eth$/,
        /\.eth\.ac$/,
        /\.eth\.sucks$/
      ]
      
      const isEnsDomain = ensPatterns.some(pattern => pattern.test(origin))
      if (isEnsDomain) {
        return callback(null, true)
      }
      
      // Reject other origins
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
  
  app.use(cors(corsOptions))

  // Setup middleware
  app.use(express.json())
  
  // Setup Swagger generation
  const options = {
    info: {
      version: version,
      title: 'SimplePage API',
      description: 'API for the SimplePage application',
    },
    baseDir: __dirname,
    // Use absolute path pattern
    filesPattern: [join(__dirname, 'api.js')],
    // Enable serving UI and JSON
    exposeApiDocs: true,
    apiDocsPath: '/openapi.json',
    // Additional options to ensure proper scanning
    multiple: true
  }

  // Generate OpenAPI spec
  const instance = expressJSDocSwagger(app)(options)

  // Wait for the spec to be generated
  instance.on('finish', (swaggerDef) => {
    // Setup Swagger UI with custom title and hidden header
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDef, {
      customSiteTitle: 'SimplePage API',
      customCss: '.swagger-ui .topbar { display: none }'
    }))
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
  app.get('/page', async (req, res, next) => {
    try {
      const { cid } = req.query
      if (!cid) {
        throw new HTTPError(400, 'Missing cid parameter')
      }

      const carFile = await ipfs.readCarLite(cid)
      res.setHeader('Content-Type', 'application/vnd.ipld.car')
      res.send(carFile)
    } catch (err) {
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
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
   * @param {FileUpload} request.body.required - CAR file - multipart/form-data
   * @returns {PageResponse} 200 - Successfully uploaded page - application/json
   * @returns {ErrorResponse} 400 - Bad request error - application/json
   * @returns {ErrorResponse} 500 - Server error - application/json
   */
  app.post('/page', upload.single('file'), async (req, res, next) => {
    try {
      const { domain } = req.query
      const file = req.file

      if (!domain) {
        return res.status(400).json({ detail: 'Missing domain parameter' })
      }
      if (!file) {
        return res.status(400).json({ detail: 'Missing file upload' }) 
      }

      console.log('writing car')
      const cid = await ipfs.writeCar(file.buffer, domain)
      console.log('wrote car', cid)
      res.json({ cid: cid.toString() })
    } catch (err) {
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ detail: err.message })
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
  
  return app
}