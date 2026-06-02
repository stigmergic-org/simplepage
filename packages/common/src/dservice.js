import { resolveEnsTextRecord } from './ens.js'
import { contracts } from './contracts.js'

/**
 * DService is a library for interacting with dservices,
 * given only an ENS domain.
 * @param {string} domain - The domain to fetch dservice endpoints from.
 * @param {object} options - The options object.
 * @param {string} options.apiEndpoint - A hardcoded dservice api endpoint.
 */
export class DService {
  #initPromise = null
  #resolveInitPromise = null
  #viemClient = null

  constructor(domain, options = {}) {
    this.domain = domain;
    this.dserviceEndpoints = []
    if (options.apiEndpoint) {
      this.dserviceEndpoints.push(options.apiEndpoint)
    }
    this.#initPromise = new Promise((resolve) => {
      this.#resolveInitPromise = resolve;
    });
  }

  #cloneRequestInit(requestInit = {}) {
    const cloned = {
      ...requestInit,
      headers: requestInit.headers ? new Headers(requestInit.headers) : undefined,
    }

    const { body } = requestInit
    if (body instanceof FormData) {
      const formData = new FormData()
      for (const [key, value] of body.entries()) {
        formData.append(key, value)
      }
      cloned.body = formData
    } else if (body instanceof URLSearchParams) {
      cloned.body = new URLSearchParams(body)
    } else if (body instanceof Blob) {
      cloned.body = body.slice(0, body.size, body.type)
    }

    return cloned
  }

  async #fetchEndpoint(endpoint, path, requestInit) {
    const url = `${endpoint}${path}`
    return fetch(url, this.#cloneRequestInit(requestInit))
  }

  async #formatResponseError(response) {
    let detail = ''
    try {
      const text = await response.clone().text()
      if (text) {
        try {
          const payload = JSON.parse(text)
          detail = payload?.detail || payload?.error || text
        } catch (_error) {
          detail = text
        }
      }
    } catch (_error) {
      // ignore response body read failures
    }

    return `HTTP ${response.status}: ${response.statusText}${detail ? `: ${detail}` : ''}`
  }

  /**
   * Initializes the DService with viem client and chain configuration.
   * @param {ViemClient} viemClient - The viem client.
   * @param {object} options - The options object.
   * @param {number} options.chainId - The chain id.
   * @param {string} options.universalResolver - The universal resolver address.
   */
  async init(viemClient, options = {}) {
    this.#viemClient = viemClient
    this.chainId = options.chainId || await this.#viemClient.getChainId()
    this.universalResolver = options.universalResolver || contracts.universalResolver[this.chainId]
    
    // Only fetch from ENS if no apiEndpoint was provided
    if (this.dserviceEndpoints.length === 0) {
      await this.#fetchDServiceEndpoints()
    }
    
    // Throw error if no endpoints are available
    if (this.dserviceEndpoints.length === 0) {
      throw new Error(`No dservice endpoints found for domain: ${this.domain}`)
    }
    
    // randomize endpoint order
    this.dserviceEndpoints = this.dserviceEndpoints.sort(() => Math.random() - 0.5)
    this.#resolveInitPromise()
  }


  async #fetchDServiceEndpoints() {
    if (!this.#viemClient) {
      throw new Error('DService must be initialized with viemClient before fetching endpoints')
    }

    const result = await resolveEnsTextRecord(
      this.#viemClient,
      this.domain,
      this.universalResolver,
      'dservice'
    )
    
    // Check if no resolver or text record value was found
    if (!result.resolverAddress || !result.value) {
      throw new Error(`No dservice endpoints found for domain: ${this.domain}`)
    }
    
    // Parse newline-separated URLs
    const endpoints = result.value.split('\n').map(url => url.trim()).filter(url => url.length > 0)
    this.dserviceEndpoints.push(...endpoints)
  }

  /**
   * Fetches a network resource from the dservice.
   * @param {string} path - The path to fetch.
   * @param {RequestInit} requestInit - The request init object.
   * @param {object} options - Additional fetch options.
   * @param {boolean} options.allEndpoints - Post to every discovered endpoint.
   * @returns {Promise<Response|Array<{ endpoint: string, response?: Response, error?: Error }>>} The response.
   */
  async fetch(path, requestInit, options = {}) {
    // Ensure we have endpoints to try
    await this.#initPromise
    
    if (this.dserviceEndpoints.length === 0) {
      throw new Error('No dservice endpoints available');
    }

    if (options.allEndpoints) {
      const results = await Promise.all(this.dserviceEndpoints.map(async (endpoint) => {
        try {
          const response = await this.#fetchEndpoint(endpoint, path, requestInit)
          return { endpoint, response }
        } catch (error) {
          return { endpoint, error }
        }
      }))

      if (!results.some(result => result.response?.ok)) {
        const lastFailure = [...results].reverse().find(result => result.error || result.response)
        if (lastFailure?.error) {
          throw new Error(`All dservice endpoints failed. Last error: ${lastFailure.error.message}`)
        }
        if (lastFailure?.response) {
          throw new Error(`All dservice endpoints failed. Last response: HTTP ${lastFailure.response.status}: ${lastFailure.response.statusText}`)
        }
        throw new Error('All dservice endpoints failed.')
      }

      return results
    }

    // Try each endpoint sequentially until one succeeds
    const numEndpoints = this.dserviceEndpoints.length
    for (let i = 0; i < numEndpoints; i++) {
      const endpoint = this.dserviceEndpoints[i]
      try {
        const response = await this.#fetchEndpoint(endpoint, path, requestInit)
        
        // If the response is successful, return it
        if (response.ok) {
          return response;
        }
        // If response is not ok but not a network error, throw it
        // This prevents retrying on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(await this.#formatResponseError(response));
        }
        // For 5xx errors or other issues, continue to next endpoint
        console.warn(`Endpoint ${endpoint} failed with status ${response.status}, trying next endpoint...`);
        if (i === numEndpoints - 1) {
          return response
        }
      } catch (error) {
        // Log the error but continue to next endpoint
        console.warn(`Endpoint ${endpoint} failed:`, error.message);
        
        // If this is the last endpoint, throw the error
        if (endpoint === this.dserviceEndpoints[this.dserviceEndpoints.length - 1]) {
          throw new Error(`All dservice endpoints failed. Last error: ${error.message}`);
        }
      }
    }
  }
}
