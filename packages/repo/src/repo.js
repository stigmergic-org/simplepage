import { namehash } from 'viem/ens';
import all from 'it-all';
import { CID } from 'multiformats/cid'

import {
  contracts,
  resolveEnsDomain,
  DService,
  carFromBytes,
  emptyUnixfs,
  cidInFs,
  cat,
  emptyCar,
  cidToENSContentHash,
  addFile,
  walkDag,
  ls,
  CidSet,
  tree,
  rm,
  assert,
} from '@simplepg/common'

import { populateTemplate, populateManifest, parseFrontmatter, populateRedirects } from './template.js'


const TEMPLATE_DOMAIN = 'new.simplepage.eth'
export const CHANGE_TYPE = Object.freeze({
  EDIT: 'edit',
  DELETE: 'delete',
  NEW: 'new',
  UPGRADE: 'upgrade'
})

/**
 * A class for managing a SimplePage repository.
 * Keeps track of all canonical markdown and html pages in the repo,
 * as well as edits that are yet to be committed.
 * 
 * @param {string} domain - The domain of the repository.
 * @param {Storage} storage - The storage object.
 * @param {object} options - The options object.
 * @param {string} options.apiEndpoint - The api endpoint.
 */
export class Repo {
  #initPromise = null
  #resolveInitPromise = null

  constructor(domain, storage, options = {}) {
    this.domain = domain;
    this.storage = storage;
    this.dservice = new DService(TEMPLATE_DOMAIN, options)


    const { fs, blockstore } = emptyUnixfs()
    this.blockstore = blockstore;
    this.unixfs = fs;
    
    this.#initPromise = new Promise((resolve) => {
      this.#resolveInitPromise = resolve;
    });
  }

  /**
   * Initializes the repo.
   * @param {ViemClient} viemClient - The viem client.
   * @param {object} options - The options object.
   * @param {number} options.chainId - The chain id.
   * @param {string} options.universalResolver - The universal resolver.
   */
  async init(viemClient, options = {}) {
    if (this.initialized) return;

    this.viemClient = viemClient
    this.chainId = options.chainId || await this.viemClient.getChainId()
    this.universalResolver = options.universalResolver || contracts.universalResolver[this.chainId]

    await Promise.all([
      this.dservice.init(this.viemClient, { chainId: this.chainId, universalResolver: this.universalResolver }),
      (this.repoRoot = await resolveEnsDomain(this.viemClient, this.domain, this.universalResolver)),
      (this.templateRoot = await resolveEnsDomain(this.viemClient, TEMPLATE_DOMAIN, this.universalResolver))
    ])
    assert(this.repoRoot.cid, `Repo root not found for ${this.domain}`)

    await Promise.all([
      this.#importRepoData(this.repoRoot.cid),
      // this.#importRepoData(this.templateRoot.cid)
    ])
    this.#resolveInitPromise()
  }

  get initialized() {
    return Boolean(this.repoRoot && this.templateRoot)
  }

  async #importRepoData(cid) {
    const response = await this.dservice.fetch(`/page?cid=${cid}`)
    const carBytes = new Uint8Array(await response.arrayBuffer());
    const car = carFromBytes(carBytes)

    // Process all blocks in parallel using Promise.all
    await Promise.all(
      (await all(car.blocks)).map(block => this.blockstore.put(block.cid, block.payload))
    );
  }

  async #ensureRepoData(template = false) {
    await this.#initPromise;
    if (template) {
      assert(this.templateRoot.cid, 'Template root not found')
    }
    const cid = template ? this.templateRoot.cid : this.repoRoot.cid
    if (!(await cidInFs(this.unixfs, cid))) {
      await this.#importRepoData(cid);
    }
  }

  /**
   * Returns the current markdown for a page.
   * If there are local edits, they will be returned. Otherwise, the
   * canonical markdown will be returned.
   * @param {string} path - The path of the page.
   * @returns {Promise<string>} The markdown for the page.
   */
  async getMarkdown(path) {
    await this.#ensureRepoData()
    const data = await this.#getPageEdit(path)
    if (data) {
      return data.markdown
    }
    return cat(this.unixfs, this.repoRoot.cid, path + 'index.md')
  }

  /**
   * Sets the current markdown for a page.
   * @param {string} path - The path of the page.
   * @param {string} markdown - The markdown for the page.
   * @param {string} body - The html body for the page.
   * @param {string} type - the type of the change (optional).
   */
  async setPageEdit(path, markdown, body, type) {
    assert(path.startsWith('/'), 'Path must start with /')
    assert(path.endsWith('/'), 'Path must end with /')
    await this.#initPromise;
    if (!type) {
      type = await this.#pageExists(path) ? CHANGE_TYPE.EDIT : CHANGE_TYPE.NEW
    }
    this.storage.setItem(`spg_edit_${path}`, JSON.stringify({
      markdown,
      body,
      root: this.repoRoot.cid.toString(),
      type
    }));
  }

  async #pageExists(path) {
    await this.#initPromise;
    try {
      await cat(this.unixfs, this.repoRoot.cid, path + 'index.md')
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * Deletes a page.
   * If the page is not committed, it will be deleted right away.
   * Otherwise, it will be deleted in the next commit (can be reverted).
   * @param {string} path - The path of the page to delete.
   */
  async deletePage(path) {
    assert(path.startsWith('/'), 'Path must start with /')
    assert(path.endsWith('/'), 'Path must end with /')
    assert(path !== '/', 'Cannot delete root page')
    await this.#initPromise;
    const allPages = await this.getAllPages()
    if (allPages.includes(path)) {
      this.storage.setItem(`spg_edit_${path}`, JSON.stringify({
        root: this.repoRoot.cid.toString(),
        type: CHANGE_TYPE.DELETE,
      }));
    } else {
      this.storage.removeItem(`spg_edit_${path}`)
    }
  }

  /**
   * Restores a deleted page, or restores changes.
   * @param {string} path - The path of the page to restore.
   */
  async restorePage(path) {
    assert(path.startsWith('/'), 'Path must start with /')
    assert(path.endsWith('/'), 'Path must end with /')
    this.storage.removeItem(`spg_edit_${path}`)
  }

  async #getPageEdit(path) {
    const data = this.storage.getItem(`spg_edit_${path}`)
    if (data) {
      const parsed = JSON.parse(data)
      if (!this.repoRoot || parsed.root === this.repoRoot.cid.toString()) {
        return parsed
      }
    }
    return null
  }

  /**
   * Returns a list of all paths with unstaged edits.
   * @returns {Promise<{ path: string, type: 'edit' | 'delete' }[]>} The list of paths with unstaged edits.
   */
  async getChanges() {
    await this.#initPromise;
    const edits = []
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key.startsWith('spg_edit_')) {
        const data = JSON.parse(this.storage.getItem(key))
        if (data.root === this.repoRoot.cid.toString()) {
          edits.push({
            path: key.replace('spg_edit_', ''),
            type: data.type,
          })
        }
      }
    }
    return edits
  }

  /**
   * Returns a list of paths for all pages in the repo.
   * @param {string} altRoot - (optional) The root to use instead of the repo root.
   * @returns {Promise<string[]>} The list of all pages in the repo.
   */
  async getAllPages(altRoot = null) {
    await this.#ensureRepoData()
    const allFiles = await tree(this.blockstore, altRoot || this.repoRoot.cid)
    const currentFiles = allFiles.filter(name => !name.startsWith('/_'))
    const pages = currentFiles.filter(name => name.endsWith('/index.md')).map(name => name.replace('index.md', ''))
    return pages
  }

  /**
   * Checks if a page exists. 
   * Either in the committed repo or as a new file.
   * @param {string} path - The path of the page.
   * @returns {Promise<boolean>} Whether the page exists.
   */
  async pageExists(path) {
    const [pages, changes] = await Promise.all([
      this.getAllPages(),
      this.getChanges()
    ]);
    return pages.includes(path) ||
      Boolean(changes.find(change => change.path === path))
  }

  /**
   * Returns the current html for a page.
   * If there are local edits, they will be returned. Otherwise, the
   * canonical html will be returned.
   * @param {string} path - The path of the page.
   * @param {boolean} ignoreEdits - Whether to ignore local edits.
   * @returns {Promise<string>} The html body for the page.
   */
  async getHtmlBody(path, ignoreEdits = false) {
    if (!ignoreEdits) {
      const data = await this.#getPageEdit(path)
      if (data && data.body) {
        return data.body
      }
    }
    await this.#ensureRepoData()
    const html = await cat(this.unixfs, this.repoRoot.cid, path + 'index.html')
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.getElementById('content-container')?.innerHTML
    return body
  }

  /**
   * Returns the current metadata for a page.
   * This is parsed from the html if no edits,
   * or markdown frontmatter if there are edits.
   * @param {string} path - The path of the page.
   * @param {boolean} ignoreEdits - Whether to ignore local edits.
   * @returns {Promise<object>} The metadata for the page.
   */
  async getMetadata(path, ignoreEdits = false) {
    if (!ignoreEdits) {
      const data = await this.#getPageEdit(path)
      if (data) {
        return parseFrontmatter(data.markdown)
      }
    } 
    await this.#ensureRepoData()
    const html = await cat(this.unixfs, this.repoRoot.cid, path + 'index.html')
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const title = doc.querySelector('title')?.textContent
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')
    const sidebar = doc.querySelector('meta[name="spg-sidebar"]')?.getAttribute('content')
    return {
      title,
      description,
      sidebar,
    }
  }

  /**
   * Checks if a new version of the template is available.
   * @returns {Promise<{
   *   templateVersion: string,
   *   currentVersion: string,
   *   canUpdate: boolean
   * }>}
   * The template version, the current version, and if an update can happen.
   */
  async isNewVersionAvailable() {
    await this.#initPromise;
    const getVersion = async (cid) => {
      const html = await cat(this.unixfs, cid, '_template.html')
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const version = doc.querySelector('meta[name="version"]').getAttribute('content');
      return version
    }
    const currentVersion = await getVersion(this.repoRoot.cid)
    // if we don't have a template root, we can't update. So we use the current version.
    let templateVersion = currentVersion
    if (this.templateRoot.cid) {
      await this.#ensureRepoData(true)
      templateVersion = await getVersion(this.templateRoot.cid)
    }
    return {
      templateVersion,
      currentVersion,
      canUpdate: templateVersion !== currentVersion
    }
  }

  async #renderHtml({ body, markdown }, targetDomain, path, root) {
    const templateHtml = await cat(this.unixfs, root, '/_template.html')
    
    // Extract title and description from markdown frontmatter
    const frontmatter = parseFrontmatter(markdown)
    return populateTemplate(templateHtml, body, targetDomain, path, frontmatter)
  }

  /**
   * Stages the current edits for a commit.
   * @param {string} targetDomain - The domain of the target repository.
   * @param {boolean} updateTemplate - Whether to update the template.
   * @returns {Promise<{ cid: string, prepTx: object }>} The CID of the new root and the preparation transaction.
   */
  async stage(targetDomain, updateTemplate = false) {
    assert(await this.blockstore.has(this.repoRoot.cid), 'Repo root not in blockstore')
    let edits = await this.getChanges()
    assert(edits.length > 0, 'No edits to stage')

    // Puts the content of the current repoRoot into
    // the '_prev/0/' directory of the new root.
    const emptyDir = await this.unixfs.addDirectory()
    const zeroDir = await this.unixfs.cp(this.repoRoot.cid, emptyDir, '0')
    let rootToUse = this.repoRoot.cid
    if (updateTemplate) {
      await this.#ensureRepoData(true)
      rootToUse = this.templateRoot.cid
    }
    const newRootWithoutPrev = await this.unixfs.rm(rootToUse, '_prev')
    let rootPointer = await this.unixfs.cp(zeroDir, newRootWithoutPrev, '_prev')

    if (updateTemplate) {
      // add upgrades to pending edits
      const allPages = await this.getAllPages()
      for (const path of allPages) {
        if (!edits.find(edit => edit.path === path)) {
          const markdown = await this.getMarkdown(path)
          const html = await this.getHtmlBody(path)
          await this.setPageEdit(path, markdown, html, CHANGE_TYPE.UPGRADE)
        }
      }
      edits = await this.getChanges()
    }

    // Add the edits to the new root
    for (const { path, type } of edits) {
      const mdPath = path + 'index.md'
      const htmlPath = path + 'index.html'
      switch (type) {
        case CHANGE_TYPE.DELETE:
          rootPointer = await rm(this.unixfs, rootPointer, mdPath)
          rootPointer = await rm(this.unixfs, rootPointer, htmlPath)
          break
        case CHANGE_TYPE.EDIT:
        case CHANGE_TYPE.NEW:
        case CHANGE_TYPE.UPGRADE:
          const data = await this.#getPageEdit(path)
          rootPointer = await addFile(this.unixfs, rootPointer, mdPath, data.markdown)
          const html = await this.#renderHtml(data, targetDomain, path, rootPointer)
          rootPointer = await addFile(this.unixfs, rootPointer, htmlPath, html)
          break
      }
    }
    const { title, description } = await this.getMetadata('/')
    const manifest = populateManifest(targetDomain, { title, description })
    rootPointer = await addFile(this.unixfs, rootPointer, 'manifest.json', manifest)
    const pages = await this.getAllPages(rootPointer)
    const redirects = populateRedirects(pages)
    rootPointer = await addFile(this.unixfs, rootPointer, '_redirects', redirects)

    // create car file with staged changes
    // ignore previous repo root and all files starting with _, except _prev and _redirects
    const newRootFiles = await ls(this.blockstore, rootPointer)
    const seen = new CidSet([
      this.repoRoot.cid,
      ...newRootFiles.filter(([key]) => Boolean(
        key.startsWith('_') &&
        key !== '_prev' &&
        key !== '_redirects'
      )).map(([_, cid]) => cid),
    ])
    const blocks = await walkDag(this.blockstore, rootPointer, seen)
    const car = emptyCar()
    for (const block of blocks) {
      car.blocks.put(block)
    }
    car.roots.push(rootPointer)

    // POST the CAR file to the API using FormData
    const cid = await this.#postCar(car, targetDomain)
    assert(cid.equals(rootPointer), `Mismatch between returned CID and expected CID: ${cid.toString()} !== ${rootPointer.toString()}`)

    const prepTx = await this.#prepareCommitTx(cid, targetDomain)
    return { cid, prepTx }
  }

  async #postCar(car, targetDomain) {
    // Create a FormData object and append the CAR file
    const formData = new FormData();
    formData.append('file', new Blob([car.bytes], {
      type: 'application/vnd.ipld.car',
    }), 'site.car');

    // POST the CAR file to the API using FormData
    const response = await this.dservice.fetch(`/page?domain=${encodeURIComponent(targetDomain)}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return CID.parse(result.cid)
  }

  /**
   * Finalizes a commit.
   * Clears out all edits and updates the repo state.
   * @param {string} cid - The CID of the new repo root.
   */
  finalizeCommit(cid) {
    // clear out all edits
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key.startsWith('spg_edit_')) {
        this.storage.removeItem(key)
      }
    }
    this.repoRoot.cid = cid;
  }


  async #prepareCommitTx(cid, targetDomain) {
    const contentHash = cidToENSContentHash(cid)
    
    let resolver = this.repoRoot.resolverAddress
    if (this.domain !== targetDomain) {
      resolver = await this.viemClient.getEnsResolver({ name: targetDomain });
    }
    
    return {
      address: resolver,
      abi: [
        {
          name: 'setContenthash',
          type: 'function',
          inputs: [{ name: 'node', type: 'bytes32' }, { name: 'hash', type: 'bytes' }],
          outputs: [],
        },
      ],
      functionName: 'setContenthash',
      args: [namehash(targetDomain), contentHash],
    }
  }
}
