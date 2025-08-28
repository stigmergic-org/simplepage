import { namehash } from 'viem/ens';
import all from 'it-all';
import { CID } from 'multiformats/cid'

import {
  contracts,
  resolveEnsDomain,
  DService,
  carFromBytes,
  emptyUnixfs,
  browserUnixfs,
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
import { Files, FILES_FOLDER } from './files.js'
import { Settings, SETTINGS_FILE } from './settings.js'
import { CHANGE_TYPE } from './constants.js'


const TEMPLATE_DOMAIN = 'new.simplepage.eth'
const EDIT_PREFIX = 'spg_edit_'


/** -----------------------------------------------
 * Minimal server-side theme variables for theme.css
 * ---------------------------------------------- */
const THEME_VARS = {
  light: {
    '--b1': '255 255 255',
    '--bc': '0 0 0',
    '--p':  '16 185 129',
  },
  dark: {
    '--b1': '17 24 39',
    '--bc': '255 255 255',
    '--p':  '99 102 241',
  },
}

function toVarsBlock(varsObj) {
  return Object.entries(varsObj)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n');
}

function buildThemeCss({ light = 'light', dark = 'dark' } = {}) {
  const lightVars = THEME_VARS[light] || THEME_VARS.light;
  const darkVars  = THEME_VARS[dark]  || THEME_VARS.dark;

  return `/* generated: theme.css */
:root {
${toVarsBlock(lightVars)}
}
@media (prefers-color-scheme: dark) {
  :root {
${toVarsBlock(darkVars)}
  }
}
`;
}

/**
 * @typedef {Object} NavItem
 * @property {string} path - The path of the navigation item
 * @property {boolean} selected - Whether this item is currently selected
 * @property {string} title - The display title for the navigation item
 * @property {number} priority - The priority for sorting (lower numbers = higher priority)
 * @property {NavItem[]} children - Child navigation items
 */

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

    const { fs, blockstore } = browserUnixfs(storage)
    this.blockstore = blockstore;

    this.unixfs = fs;
    this.files = new Files(this.unixfs, this.blockstore, this.dservice, () => this.#ensureRepoData(), storage);
    this.settings = new Settings(this.unixfs, this.blockstore, () => this.#ensureRepoData(), storage);
    
    this.#initPromise = new Promise((resolve) => {
      this.#resolveInitPromise = resolve;
    });
  }

  async close() {
    await this.blockstore.close()
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
      this.#ensureRepoData(false, true),
      // this.#importRepoData(this.repoRoot.cid),
      // this.#importRepoData(this.templateRoot.cid)
    ])
    await this.files.unsafeSetRepoRoot(this.repoRoot.cid)
    await this.settings.unsafeSetRepoRoot(this.repoRoot.cid)
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

  async #ensureRepoData(template = false, force = false) {
    if (!force) await this.#initPromise;
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
    this.storage.setItem(`${EDIT_PREFIX}${path}`, JSON.stringify({
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
      this.storage.setItem(`${EDIT_PREFIX}${path}`, JSON.stringify({
        root: this.repoRoot.cid.toString(),
        type: CHANGE_TYPE.DELETE,
      }));
    } else {
      this.storage.removeItem(`${EDIT_PREFIX}${path}`)
    }
  }

  /**
   * Restores a deleted page, or restores changes.
   * @param {string} path - The path of the page to restore.
   */
  async restorePage(path) {
    assert(path.startsWith('/'), 'Path must start with /')
    assert(path.endsWith('/'), 'Path must end with /')
    this.storage.removeItem(`${EDIT_PREFIX}${path}`)
  }

  /**
   * Restores all pages.
   */
  restoreAllPages() {
    const keys = Object.keys(this.storage).filter(key => key.startsWith(EDIT_PREFIX))
    for (const key of keys) {
      this.storage.removeItem(key)
    }
  }

  async #getPageEdit(path) {
    const data = this.storage.getItem(`${EDIT_PREFIX}${path}`)
    return data ? JSON.parse(data) : null
  }

  /**
   * Returns true if the edit is for an old repo root.
   * @param {string} path - The path of the page.
   * @returns {boolean} Whether the edit is for an old repo root.
   */
  isOutdatedEdit(path) {
    const data = this.storage.getItem(`${EDIT_PREFIX}${path}`)
    if (data) {
      const parsed = JSON.parse(data)
      return parsed.root !== this.repoRoot.cid.toString()
    }
  }

  /**
   * Returns a list of all paths with unstaged edits.
   * @returns {Promise<{ path: string, type: 'edit' | 'delete' }[]>} The list of paths with unstaged edits.
   */
  async getChanges() {
    await this.#initPromise;
    const edits = []
    const keys = Object.keys(this.storage).filter(key => key.startsWith(EDIT_PREFIX))
    for (const key of keys) {
      const data = JSON.parse(this.storage.getItem(key))
      edits.push({
        path: key.replace(EDIT_PREFIX, ''),
        type: data.type,
        markdown: data.markdown,
        body: data.body,
      })
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
    const markdown = await cat(this.unixfs, this.repoRoot.cid, path + 'index.md')
    return parseFrontmatter(markdown)
  }

  /**
   * Returns the sidebar navigation info for a page.
   * @param {string} selectedPath - The path of the page.
   * @param {boolean} ignoreEdits - Whether to ignore local edits.
   * @returns {Promise<NavItem[]>} The sidebar navigation info for the page.
   */
  async getSidebarNavInfo(selectedPath, ignoreEdits = false) {
    // TODO - deal with selectedPath being root
    let allPaths = []
    if (ignoreEdits) {
      allPaths = await this.getAllPages()
    } else {
      const [allPages, allEdits] = await Promise.all([ this.getAllPages(), this.getChanges() ])
      //remove duplicates
      allPaths = [...new Set([...allPages, ...allEdits.map(edit => edit.path)])]
    }
    
    // get the metadata for all pages
    const allMetadata = await Promise.all(allPaths.map(async path => ({ ...(await this.getMetadata(path, ignoreEdits)), path })))
    const metaItems = allMetadata.filter(meta => meta['sidebar-nav-prio'] && meta['sidebar-nav-prio'] > 0)

    // Helper function to convert path to title
    const pathToTitle = (path) => {
      if (!path) return ''
      return path.split('/').filter(Boolean).pop().split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    }

    let showNavInfo = false
    const navItems = []
    for (const meta of metaItems) {

      const path = meta.path
      if (selectedPath === path) {
        showNavInfo = true
      }
      let newItem = {
        selected: selectedPath === path,
        path,
        title: meta.title || pathToTitle(meta.path) || path,
        priority: meta['sidebar-nav-prio'],
        children: [],
      }
      const pathSplit = meta.path.split('/').filter(Boolean)
      let sectionPointer = navItems
      for (let i = 1; i < pathSplit.length; i++) {
        const parentPath = `/${pathSplit.slice(0, i).join('/')}/`
        let parentItem = sectionPointer.find(item => item.path === parentPath)

        if (!parentItem) {
          parentItem = {
            virtual: true,
            path: parentPath,
            title: pathToTitle(parentPath),
            priority: newItem.priority,
            children: [],
          }
          sectionPointer.push(parentItem)
        } else if (parentItem.virtual) {
          parentItem.priority = Math.min(parentItem.priority, newItem.priority)
        }
        sectionPointer = parentItem.children
      }
      const virtualNewItem = navItems.find(item => item.path === path && item.virtual)
      if (virtualNewItem) {
        virtualNewItem.title = newItem.title
        virtualNewItem.priority = newItem.priority
        virtualNewItem.selected = newItem.selected
        delete virtualNewItem.virtual
      } else {
        sectionPointer.push(newItem)
      }
    }

    if (!showNavInfo) return []

    const sort = items => {
      items.sort((a, b) => a.priority - b.priority)
      items.forEach(item => sort(item.children))
      return items
    }
    return sort(navItems)
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
    const avatarPath = await this.files.getAvatarPath()
    
    // Extract title and description from markdown frontmatter
    const frontmatter = parseFrontmatter(markdown)
    return populateTemplate(templateHtml, body, targetDomain, path, frontmatter, avatarPath)
  }

  /**
   * Stages the current edits for a commit.
   * @param {string} targetDomain - The domain of the target repository.
   * @param {boolean} wantUpdateTemplate - Whether to update the template.
   * @returns {Promise<{ cid: string, prepTx: object }>} The CID of the new root and the preparation transaction.
   */
  async stage(targetDomain, wantUpdateTemplate = false) {
    assert(await this.blockstore.has(this.repoRoot.cid), 'Repo root not in blockstore')
    let edits = await this.getChanges()
    const filesChanged = await this.files.hasChanges()
    const settingsChanged = await this.settings.hasChanges()
    if (wantUpdateTemplate) {
      assert(this.templateRoot.cid, 'Template root not found')
    }
    const willUpdateTemplate = wantUpdateTemplate && (await this.isNewVersionAvailable()).canUpdate
    assert(edits.length > 0 || filesChanged || settingsChanged || willUpdateTemplate, 'No edits to stage')

    // Puts the content of the current repoRoot into
    // the '_prev/0/' directory of the new root.
    const emptyDir = await this.unixfs.addDirectory()
    const zeroDir = await this.unixfs.cp(this.repoRoot.cid, emptyDir, '0')
    const rootToUse = willUpdateTemplate ? this.templateRoot.cid : this.repoRoot.cid
    const newRootWithoutPrev = await this.unixfs.rm(rootToUse, '_prev')
    let rootPointer = await this.unixfs.cp(zeroDir, newRootWithoutPrev, '_prev')

    // updates files
    const { cid: newFilesRoot, unchangedCids: unchangedFileCids } = await this.files.stage()
    rootPointer = await this.unixfs.cp(newFilesRoot, rootPointer, FILES_FOLDER, { force: true })

    // updates settings
    const newSettingsRoot = await this.settings.stage()
    rootPointer = await this.unixfs.cp(newSettingsRoot, rootPointer, SETTINGS_FILE, { force: true })


     // --- generate theme.css from saved settings (pre-JS) ---
    // 1.	Publish flow → when staging/publishing, we need title + description to populate manifest.json and manifest.webmanifest (so sites have proper PWA metadata, favicons, search engine descriptions).
	// 2.	UI → sidebar + page metadata can be shown in lists without having to load the full page HTML in the browser editor.
	// 3.	Future extensibility → adding custom site-wide behaviors.

    const savedSettings = await this.settings.read();
    const themePref = {
      light: savedSettings?.appearance?.themeLight || 'light',
      dark:  savedSettings?.appearance?.themeDark  || 'dark',
    }
    const themeCss = buildThemeCss(themePref)
    rootPointer = await addFile(this.unixfs, rootPointer, 'theme.css', themeCss)
    // -------------------------------------------------------

    // upgrade unchanged pages (template/avatar changes)

    // upgrade all pages that are not in the edits
    // this is needed in case template is updated, or there's a new avatar
    const allPages = await this.getAllPages()
    for (const path of allPages) {
      if (!edits.find(edit => edit.path === path)) {
        edits.push({
          path,
          type: CHANGE_TYPE.UPGRADE,
          markdown: await this.getMarkdown(path),
          body: await this.getHtmlBody(path),
        })
      }
    }

    // Add the edits to the new root
    for (const edit of edits) {
      const mdPath = edit.path + 'index.md'
      const htmlPath = edit.path + 'index.html'
      switch (edit.type) {
        case CHANGE_TYPE.DELETE:
          if (willUpdateTemplate) break // template root doesn't have any files, so we don't need to delete anything
          rootPointer = await rm(this.unixfs, rootPointer, mdPath)
          rootPointer = await rm(this.unixfs, rootPointer, htmlPath)
          break
        case CHANGE_TYPE.EDIT:
        case CHANGE_TYPE.NEW:
        case CHANGE_TYPE.UPGRADE:
          rootPointer = await addFile(this.unixfs, rootPointer, mdPath, edit.markdown)
          const html = await this.#renderHtml(edit, targetDomain, edit.path, rootPointer)
          rootPointer = await addFile(this.unixfs, rootPointer, htmlPath, html)
          break
      }
    }
    const { title, description } = await this.getMetadata('/')
    const manifest = populateManifest(targetDomain, { title, description })
    rootPointer = await addFile(this.unixfs, rootPointer, 'manifest.json', manifest)
    rootPointer = await addFile(this.unixfs, rootPointer, 'manifest.webmanifest', manifest)
    const pages = await this.getAllPages(rootPointer)
    const redirects = populateRedirects(pages)
    rootPointer = await addFile(this.unixfs, rootPointer, '_redirects', redirects)
    const flushPromise = this.blockstore.flush()

    // create car file with staged changes
    // ignore previous repo root and all files starting with _, except _prev and _redirects
    // as well as all unchanged files from FILES_FOLDER
    const newRootFiles = await ls(this.blockstore, rootPointer)
    const seen = new CidSet([
      this.repoRoot.cid,
      ...newRootFiles.filter(([key]) => Boolean(
        key.startsWith('_') &&
        key !== '_prev' &&
        key !== '_redirects' &&
        key !== FILES_FOLDER
      )).map(([_, cid]) => cid),
      ...unchangedFileCids,
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
    await flushPromise
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
   * @param {CID} cid - The CID of the new repo root.
   */
  async finalizeCommit(cid) {
    // clear out all edits
    this.restoreAllPages()
    this.repoRoot.cid = cid;
    const filesRoot = (await ls(this.blockstore, cid)).find(([name]) => name === FILES_FOLDER)[1]
    await this.files.finalizeCommit(filesRoot)
    const settingsCid = (await ls(this.blockstore, cid)).find(([name]) => name === SETTINGS_FILE)[1]
    await this.settings.finalizeCommit(settingsCid)
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