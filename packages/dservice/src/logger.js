import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Default logs directory
const defaultLogsDir = path.join(__dirname, '..', 'logs')

const sanitizeBigInts = (_, v) => typeof v === 'bigint' ? v.toString() : v

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, error: _error, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`

    if (meta.stack) {
      log += `\n${meta.stack}`
      delete meta.stack
    }

    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, sanitizeBigInts)}`
    }
    return log
  })
)

// JSON format for file logging
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Create the logger
const createLogger = async (options = {}) => {
  const {
    level = 'info', // Default to debug level
    silent = false,
    logDir = defaultLogsDir
  } = options

  // Ensure log directory exists
  const fs = await import('fs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const transports = []

  // Console transport (always enabled unless silent)
  if (!silent) {
    transports.push(
      new winston.transports.Console({
        level,
        format: consoleFormat
      })
    )
  }

  // File transports
  transports.push(
    // Combined log file
    new DailyRotateFile({
      filename: path.join(logDir, 'dservice-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'debug',
      format: fileFormat
    }),
    // Error log file
    new DailyRotateFile({
      filename: path.join(logDir, 'dservice-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: fileFormat
    })
  )

  const logger = winston.createLogger({
    level: level,
    format: fileFormat,
    transports: transports,
    // Handle uncaught exceptions
    exceptionHandlers: [
      new DailyRotateFile({
        filename: path.join(logDir, 'dservice-exception-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        format: fileFormat
      })
    ],
    // Handle unhandled rejections
    rejectionHandlers: [
      new DailyRotateFile({
        filename: path.join(logDir, 'dservice-rejection-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        format: fileFormat
      })
    ]
  })

  return logger
}

// Export only the createLogger function
export { createLogger } 