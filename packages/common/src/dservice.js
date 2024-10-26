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
   * @returns {Promise<Response>} The response.
   */
  async fetch(path, requestInit) {
    // Ensure we have endpoints to try
    await this.#initPromise
    
    if (this.dserviceEndpoints.length === 0) {
      throw new Error('No dservice endpoints available');
    }

    // Try each endpoint sequentially until one succeeds
    const numEndpoints = this.dserviceEndpoints.length
    for (let i = 0; i < numEndpoints; i++) {
      const endpoint = this.dserviceEndpoints[i]
      try {
        const url = `${endpoint}${path}`;
        const response = await fetch(url, requestInit);
        
        // If the response is successful, return it
        if (response.ok) {
          return response;
        }
        // If response is not ok but not a network error, throw it
        // This prevents retrying on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
