import { decodeEventLog, namehash } from 'viem'
import { CID } from 'multiformats/cid'
import { 
  carFromBytes, 
  contracts,
  CidSet,
  CID_CODES,
  assert
} from '@simplepg/common'
import { cidToENSContentHash } from '@simplepg/common'

/**
 * @typedef {Object} HistoryEntry
 * @property {string} blockNumber - The block number of the transaction
 * @property {CID} cid - The CID of the content
 * @property {CID[]} parents - The parents of the content
 * @property {string} tx - The transaction hash
 * @property {string} version - The version from the HTML metadata
 * @property {string} domain - The domain from the HTML metadata
 */

/**
 * A class for managing and verifying SimplePage repository history.
 * Used internally by the Repo class to provide history functionality.
 */
export class History {
  #domain
  #dservice
  #viemClient
  #repoRoot

  constructor(domain, dservice) {
    this.#domain = domain
    this.#dservice = dservice
  }

  /**
   * Sets the viem client and chain configuration for history operations.
   * @param {ViemClient} viemClient - The viem client.
   * @param {CID} repoRootCid - The root CID of the repository.
   */
  init(viemClient, repoRootCid) {
    this.#viemClient = viemClient
    this.#repoRoot = repoRootCid
  }

  /**
   * Retrieves the history for the repository domain.
   * @returns {Promise<HistoryEntry[]>} Array of history entries
   */
  async get() {
    if (!this.#viemClient) {
      throw new Error('History class must be initialized with viem client before use')
    }

    try {
      // Fetch history from the API endpoint
      const response = await this.#dservice.fetch(`/history?domain=${encodeURIComponent(this.#domain)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`)
      }

      const carBytes = new Uint8Array(await response.arrayBuffer())
      const car = carFromBytes(carBytes, { verify: true })
      
      // Parse the history entries from the CAR file
      const entries = await this.#parseHistoryEntries(car)
      
      return entries
    } catch (error) {
      const wrappedError = new Error(`Failed to retrieve history for domain ${this.#domain}: ${error.message}`)
      wrappedError.cause = error
      wrappedError.domain = this.#domain
      throw wrappedError
    }
  }

  /**
   * Parses history entries from a CAR file.
   * @private
   * @param {Object} car - The CAR file object
   * @returns {Promise<HistoryEntry[]>} Parsed history entries
   */
  async #parseHistoryEntries(car) {
    const { metadata } = car.get(car.roots[0])
    assert(metadata[this.#repoRoot.toString()], `Repo root CID not part of history`)
    const versionsToCover = new CidSet(Object.keys(metadata))
    const entries = []

    const validateVersionHistory = async (versionPointer) => {
      const node = car.get(versionPointer)
      // check if entry already processed
      if (entries.find(e => e.cid.equals(versionPointer))) return

      versionsToCover.delete(versionPointer)
      const meta = metadata[versionPointer.toString()]
      const { txValid, blockNumber } = await this.#validateTx(meta.tx, versionPointer)
      assert(txValid, `Transaction ${meta.tx} is not valid for version ${versionPointer}`)

      const indexCid = node.Links.find(link => link.Name === 'index.html').Hash
      const indexNode = car.get(indexCid)
      let indexBytes = indexNode
      if (indexCid.code === CID_CODES.dagPb) {
        indexBytes = indexNode.Data
      }
      const indexContent = new TextDecoder().decode(indexBytes)
      const { version, domain } = this.#getIndexMeta(indexContent)

      const entry = {
        cid: versionPointer,
        ...meta,
        blockNumber,
        parents: [],
        version,
        domain
      }
      const prev = node.Links.find(link => link.Name === '_prev')
      if (prev) {
        const prevNode = car.get(prev.Hash)
        for (const link of prevNode.Links) {
          await validateVersionHistory(link.Hash, versionPointer)
          entry.parents.push(link.Hash)
        }
      }
      entries.push(entry)
    }

    while (versionsToCover.size > 0) {
      const versionPointer = CID.parse(versionsToCover.values().next().value)
      await validateVersionHistory(versionPointer)
    }

    // Sort entries by block number
    entries.sort((a, b) => parseInt(b.blockNumber) - parseInt(a.blockNumber))
    return entries
  }

  async #validateTx(tx, cid) {
    const { blockNumber, logs, status } = await this.#viemClient.getTransactionReceipt({ hash: tx })
    assert(status === 'success', `Transaction ${tx} is not valid`)

    const abiName = 'ContenthashChanged'
    let eventName, hash, node
    for (const log of logs) {
      try {
        const result = decodeEventLog({
          abi: contracts.abis.EnsResolver,
          data: log.data,
          topics: log.topics
        })
        eventName = result.eventName
        hash = result.args.hash
        node = result.args.node
        break
      } catch (error) {
        continue
      }
    }
    assert(eventName === abiName, `Transaction ${tx} does not contain a ${abiName} log`)
    assert(hash === cidToENSContentHash(cid), `Contenthash mismatch for transaction ${tx}`)
    assert(node === namehash(this.#domain), `Node mismatch for transaction ${tx}`)
    return { blockNumber, txValid: true }
  }

  #getIndexMeta(indexContent) {
    assert(indexContent, `Index content is required`)
    const doc = new DOMParser().parseFromString(indexContent, 'text/html')
    const versionMeta = doc.querySelector('meta[name="version"]')
    const domainMeta = doc.querySelector('meta[name="ens-domain"]')
    return {
      version: versionMeta.getAttribute('content'),
      domain: domainMeta.getAttribute('content')
    }
  }
}
