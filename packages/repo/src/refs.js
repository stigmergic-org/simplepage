export class Refs {
  constructor(domain, dservice) {
    this.domain = domain
    this.dservice = dservice
  }

  async list(domain = this.domain) {
    const response = await this.dservice.fetch(`/refs/${encodeURIComponent(domain)}`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error(`Could not fetch refs: ${response.statusText}`)
    }

    const payload = await response.json()
    return Array.isArray(payload?.refs) ? payload.refs : []
  }

  async listCapabilities(domain = this.domain) {
    const response = await this.dservice.fetch(`/capabilities/${encodeURIComponent(domain)}`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error(`Could not fetch capabilities: ${response.statusText}`)
    }

    const payload = await response.json()
    return Array.isArray(payload?.capabilities) ? payload.capabilities : []
  }

  async storeCapability(domain = this.domain, capability) {
    return this.dservice.fetch(`/capabilities/${encodeURIComponent(domain)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(capability),
    }, {
      allEndpoints: true,
    })
  }
}
