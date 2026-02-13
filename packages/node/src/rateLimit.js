import { RateLimiterMemory } from 'rate-limiter-flexible'

const toNumber = (value, fallback) => {
  if (value === null || value === undefined) return fallback
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return Number.isFinite(parsed) ? parsed : fallback
}

const isPositive = (value) => Number.isFinite(value) && value > 0

const normalizeKeyPart = (value) => encodeURIComponent(String(value ?? 'unknown').toLowerCase())

const createLimiter = ({ points, duration, keyPrefix }) => {
  if (!isPositive(points) || !isPositive(duration)) return null
  return new RateLimiterMemory({ points, duration, keyPrefix })
}

const sendRateLimit = (res, retryMs, detail) => {
  if (Number.isFinite(retryMs) && retryMs > 0) {
    res.set('Retry-After', Math.ceil(retryMs / 1000))
  }
  res.status(429).json({ detail })
}

const logLimit = (logger, data) => {
  if (logger?.warn) {
    logger.warn('Rate limit exceeded', data)
  }
}

export const getClientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown'

const getDomain = (req) => {
  const domain = req?.query?.domain
  if (typeof domain !== 'string') return 'unknown'
  const trimmed = domain.trim().toLowerCase()
  return trimmed.length ? trimmed : 'unknown'
}

const consumeLimiter = async ({ limiter, key, points, name }) => {
  if (!limiter) return { allowed: true }
  try {
    await limiter.consume(key, points)
    return { allowed: true }
  } catch (rateLimitRes) {
    return {
      allowed: false,
      retryMs: rateLimitRes?.msBeforeNext || 0,
      name
    }
  }
}

export const resolveUploadRateLimits = ({ rateLimits, maxStagedAgeSeconds }) => {
  const upload = rateLimits?.upload || {}
  const enabled = upload.enabled !== false
  if (!enabled) {
    return {
      enabled: false,
      requestPerIpDomain: 0,
      requestPerIp: 0,
      requestWindowSeconds: 0,
      bytesPerIpDomain: 0,
      bytesPerIp: 0,
      byteWindowSeconds: 0,
      concurrentPerIp: 0
    }
  }
  return {
    enabled: true,
    requestPerIpDomain: toNumber(upload.requestsPerIpDomain, 3),
    requestPerIp: toNumber(upload.requestsPerIp, 8),
    requestWindowSeconds: toNumber(upload.requestWindowSeconds, 5 * 60),
    bytesPerIpDomain: toNumber(upload.bytesPerIpDomain, 1024 * 1024 * 1024),
    bytesPerIp: toNumber(upload.bytesPerIp, 2 * 1024 * 1024 * 1024),
    byteWindowSeconds: toNumber(upload.byteWindowSeconds, maxStagedAgeSeconds),
    concurrentPerIp: toNumber(upload.concurrentPerIp, 1)
  }
}

export const createUploadRateLimiters = ({
  logger,
  enabled,
  requestPerIpDomain,
  requestPerIp,
  requestWindowSeconds,
  bytesPerIpDomain,
  bytesPerIp,
  byteWindowSeconds,
  concurrentPerIp
}) => {
  if (!enabled) {
    return {
      preUploadLimiter: (_req, _res, next) => next(),
      postUploadLimiter: (_req, _res, next) => next()
    }
  }
  const requestPerIpDomainLimiter = createLimiter({
    points: requestPerIpDomain,
    duration: requestWindowSeconds,
    keyPrefix: 'upload:req:ipdomain'
  })
  const requestPerIpLimiter = createLimiter({
    points: requestPerIp,
    duration: requestWindowSeconds,
    keyPrefix: 'upload:req:ip'
  })
  const bytesPerIpDomainLimiter = createLimiter({
    points: bytesPerIpDomain,
    duration: byteWindowSeconds,
    keyPrefix: 'upload:bytes:ipdomain'
  })
  const bytesPerIpLimiter = createLimiter({
    points: bytesPerIp,
    duration: byteWindowSeconds,
    keyPrefix: 'upload:bytes:ip'
  })

  const inFlightByIp = new Map()

  const consumeRequestLimits = async ({ ipKey, ipDomainKey }) => {
    const limits = [
      { limiter: requestPerIpDomainLimiter, key: ipDomainKey, points: 1, name: 'upload-requests-ip-domain' },
      { limiter: requestPerIpLimiter, key: ipKey, points: 1, name: 'upload-requests-ip' }
    ]
    for (const entry of limits) {
      const result = await consumeLimiter(entry)
      if (!result.allowed) return result
    }
    return { allowed: true }
  }

  const consumeByteLimits = async ({ ipKey, ipDomainKey, bytes }) => {
    const limits = [
      { limiter: bytesPerIpDomainLimiter, key: ipDomainKey, points: bytes, name: 'upload-bytes-ip-domain' },
      { limiter: bytesPerIpLimiter, key: ipKey, points: bytes, name: 'upload-bytes-ip' }
    ]
    for (const entry of limits) {
      const result = await consumeLimiter(entry)
      if (!result.allowed) return result
    }
    return { allowed: true }
  }

  const preUploadLimiter = async (req, res, next) => {
    const ip = getClientIp(req)
    const domain = getDomain(req)
    const ipKey = normalizeKeyPart(ip)
    const ipDomainKey = `${ipKey}:${normalizeKeyPart(domain)}`

    req.rateLimitState = {
      ip,
      domain,
      ipKey,
      ipDomainKey,
      bytesConsumed: false
    }

    const requestResult = await consumeRequestLimits({ ipKey, ipDomainKey })
    if (!requestResult.allowed) {
      logLimit(logger, { ip, domain, limit: requestResult.name, retryMs: requestResult.retryMs })
      sendRateLimit(res, requestResult.retryMs, 'Upload request rate limit exceeded')
      return
    }

    const contentLengthHeader = req.get('content-length')
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null
    if (Number.isFinite(contentLength) && contentLength > 0) {
      const byteResult = await consumeByteLimits({ ipKey, ipDomainKey, bytes: contentLength })
      if (!byteResult.allowed) {
        logLimit(logger, { ip, domain, limit: byteResult.name, retryMs: byteResult.retryMs })
        sendRateLimit(res, byteResult.retryMs, 'Upload byte limit exceeded')
        return
      }
      req.rateLimitState.bytesConsumed = true
    }

    if (isPositive(concurrentPerIp)) {
      const current = inFlightByIp.get(ipKey) || 0
      if (current >= concurrentPerIp) {
        logLimit(logger, { ip, domain, limit: 'upload-concurrency-ip' })
        sendRateLimit(res, 1000, 'Too many concurrent uploads')
        return
      }
      inFlightByIp.set(ipKey, current + 1)
      let released = false
      const release = () => {
        if (released) return
        released = true
        const nextCount = (inFlightByIp.get(ipKey) || 1) - 1
        if (nextCount <= 0) {
          inFlightByIp.delete(ipKey)
        } else {
          inFlightByIp.set(ipKey, nextCount)
        }
      }
      res.once('finish', release)
      res.once('close', release)
      req.rateLimitState.release = release
    }

    next()
  }

  const postUploadLimiter = async (req, res, next) => {
    const state = req.rateLimitState || {}
    if (state.bytesConsumed) {
      next()
      return
    }

    const ipKey = state.ipKey || normalizeKeyPart(getClientIp(req))
    const ipDomainKey = state.ipDomainKey || `${ipKey}:${normalizeKeyPart(getDomain(req))}`
    const bytes = req.file?.buffer?.length
    if (!Number.isFinite(bytes) || bytes <= 0) {
      next()
      return
    }

    const byteResult = await consumeByteLimits({ ipKey, ipDomainKey, bytes })
    if (!byteResult.allowed) {
      const ip = state.ip || getClientIp(req)
      const domain = state.domain || getDomain(req)
      logLimit(logger, { ip, domain, limit: byteResult.name, retryMs: byteResult.retryMs })
      sendRateLimit(res, byteResult.retryMs, 'Upload byte limit exceeded')
      return
    }
    state.bytesConsumed = true
    next()
  }

  return { preUploadLimiter, postUploadLimiter }
}
