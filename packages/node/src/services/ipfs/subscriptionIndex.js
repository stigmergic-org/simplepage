const DEFAULT_UNITS = []

const normalizeUnit = (unit) => {
  if (typeof unit === 'bigint') {
    return Number(unit)
  }
  if (typeof unit === 'number') {
    return unit
  }
  if (typeof unit === 'string' && unit.trim()) {
    const parsed = Number(unit)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const normalizeUnits = (units) => {
  if (!Array.isArray(units)) return [...DEFAULT_UNITS]
  return units.map(normalizeUnit)
}

const getCanonicalExpiry = (units) => {
  const expiresAt = units?.[0]
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return null
  }
  return expiresAt
}

export class SubscriptionIndex {
  #mfs
  #logger

  constructor({ mfs, logger }) {
    this.#mfs = mfs
    this.#logger = logger || { warn: () => {} }
  }

  async readSubscription(domain) {
    const path = await this.#getSubscriptionPath(domain)
    const content = await this.#mfs.readFile(path)
    if (content === null) {
      return { exists: false, units: null }
    }
    try {
      const parsed = JSON.parse(content)
      const units = normalizeUnits(parsed?.units)
      return { exists: true, units }
    } catch (_error) {
      return { exists: true, units: null }
    }
  }

  async writeSubscription(domain, units) {
    const normalizedUnits = normalizeUnits(units)
    await this.#mfs.ensureDomain(domain)
    const path = await this.#getSubscriptionPath(domain)
    const payload = { units: normalizedUnits }
    await this.#mfs.writeFile(path, JSON.stringify(payload), { updateRootPin: true })
    return normalizedUnits
  }

  async getStatus(domain, { nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
    const { exists, units } = await this.readSubscription(domain)
    if (!exists || !units || units.length === 0) {
      return { status: 'missing', expiresAt: null, units: units || null }
    }
    const expiresAt = getCanonicalExpiry(units)
    if (!expiresAt) {
      return { status: 'missing', expiresAt: null, units }
    }
    if (expiresAt <= nowSeconds) {
      return { status: 'expired', expiresAt, units }
    }
    return { status: 'active', expiresAt, units }
  }

  async listExpiringDomains({ withinSeconds = 0, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
    const domains = await this.#mfs.listDomains()
    const expiring = []
    for (const domain of domains) {
      try {
        const status = await this.getStatus(domain, { nowSeconds })
        if (status.status !== 'active') continue
        if (status.expiresAt === null) continue
        if (status.expiresAt - nowSeconds <= withinSeconds) {
          expiring.push(domain)
        }
      } catch (error) {
        this.#logger.warn('Error reading subscription status', {
          domain,
          error: error.message
        })
      }
    }
    return expiring
  }

  async #getSubscriptionPath(domain) {
    return `${await this.#mfs.getDomainDir(domain)}/subscription.json`
  }
}
