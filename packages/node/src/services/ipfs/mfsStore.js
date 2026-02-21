import all from 'it-all'
import * as u8a from 'uint8arrays'

const DEFAULT_SPG_DATA_ROOT = '/spg-data'

export class MfsStore {
  #client
  #rootPinName
  #dataRoot
  #domainsDir
  #pinFailuresDir
  #rootEnsured
  #rootPinCid
  #domainsCache

  constructor({ client, namespace, rootPinName }) {
    this.#client = client
    this.#rootPinName = rootPinName
    const normalizedNamespace = String(namespace)
    this.#dataRoot = `${DEFAULT_SPG_DATA_ROOT}/${normalizedNamespace}`
    this.#domainsDir = `${this.#dataRoot}/domains`
    this.#pinFailuresDir = `${this.#dataRoot}/pin-failures`
    this.#rootEnsured = false
    this.#rootPinCid = null
    this.#domainsCache = null
  }

  get dataRoot() {
    return this.#dataRoot
  }

  get domainsDir() {
    return this.#domainsDir
  }

  get pinFailuresDir() {
    return this.#pinFailuresDir
  }

  resetDomainCache() {
    this.#domainsCache = null
  }

  async ensureDir(path) {
    try {
      await this.#client.files.stat(path)
    } catch (_error) {
      await this.#client.files.mkdir(path, { parents: true })
    }
  }

  async ensureRootDir() {
    if (this.#rootEnsured) {
      return
    }
    await this.ensureDir(this.#dataRoot)
    await this.ensureDir(this.#domainsDir)
    await this.ensureDir(this.#pinFailuresDir)
    this.#rootEnsured = true
  }

  async pathExists(path) {
    try {
      await this.#client.files.stat(path)
      return true
    } catch (_error) {
      return false
    }
  }

  async listDir(path) {
    try {
      return await all(await this.#client.files.ls(path))
    } catch (_error) {
      return []
    }
  }

  async readFile(path) {
    try {
      const chunks = await all(await this.#client.files.read(path))
      return u8a.toString(Buffer.concat(chunks), 'utf8')
    } catch (_error) {
      return null
    }
  }

  async writeFile(path, content, { updateRootPin = true } = {}) {
    await this.#client.files.write(path, new TextEncoder().encode(content), {
      create: true,
      truncate: true,
      parents: true
    })
    if (updateRootPin) {
      await this.updateRootPin()
    }
  }

  async removePath(path, { recursive = false } = {}) {
    try {
      await this.#client.files.rm(path, { recursive })
      await this.updateRootPin()
    } catch (_error) {
      return
    }
  }

  async copyCidToMfs(cid, path) {
    await this.removePath(path, { recursive: true })
    await this.#client.files.cp(`/ipfs/${cid.toString()}`, path, { parents: true })
  }

  async readCidFromMfs(path) {
    try {
      const stat = await this.#client.files.stat(path)
      return stat?.cid || null
    } catch (_error) {
      return null
    }
  }

  async #getRootPinCid() {
    const pins = await all(await this.#client.pin.ls({ name: this.#rootPinName }))
    if (pins.length > 1) {
      const [keep, ...rest] = pins
      for (const pin of rest) {
        try {
          await this.#client.pin.rm(pin.cid, { name: pin.name })
        } catch (_error) {
          // ignore
        }
      }
      return keep?.cid || null
    }
    return pins[0]?.cid || null
  }

  async updateRootPin() {
    await this.ensureRootDir()
    const stat = await this.#client.files.stat(this.#dataRoot)
    const newCid = stat.cid
    if (!this.#rootPinCid) {
      this.#rootPinCid = await this.#getRootPinCid()
    }
    if (!this.#rootPinCid) {
      await this.#client.pin.add(newCid, { recursive: false, name: this.#rootPinName })
      this.#rootPinCid = newCid
      return
    }
    if (!this.#rootPinCid.equals(newCid)) {
      try {
        await this.#client.pin.update(this.#rootPinCid, newCid, { recursive: false })
      } catch (_error) {
        await this.#client.pin.add(newCid, { recursive: false, name: this.#rootPinName })
      }
      this.#rootPinCid = newCid
    }
  }

  async getDomainDir(domain) {
    return `${this.#domainsDir}/${domain}`
  }

  async getStagedDir(domain) {
    return `${await this.getDomainDir(domain)}/staged`
  }

  async getFinalizedDir(domain) {
    return `${await this.getDomainDir(domain)}/finalized`
  }

  async getResolverPath(domain) {
    return `${await this.getDomainDir(domain)}/resolver`
  }

  async ensureDomain(domain) {
    await this.ensureRootDir()
    await this.ensureDir(await this.getDomainDir(domain))
    await this.updateRootPin()
    if (this.#domainsCache && !this.#domainsCache.includes(domain)) {
      this.#domainsCache.push(domain)
    }
  }

  async domainExists(domain) {
    return this.pathExists(await this.getDomainDir(domain))
  }

  async listDomains() {
    await this.ensureRootDir()
    if (this.#domainsCache) {
      return this.#domainsCache
    }
    const entries = await this.listDir(this.#domainsDir)
    const domains = entries.map(entry => entry.name)
    this.#domainsCache = domains
    return domains
  }
}
