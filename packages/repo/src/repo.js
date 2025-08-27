// packages/repo/src/repo.js
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
 * A class for managing a SimplePage repository.
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

    // init gate + public "ready" handle so UI can await initialization
    this.#initPromise = new Promise((resolve) => {
      this.#resolveInitPromise = resolve;
    });
    this.ready = this.#initPromise;
  }

  async close() {
    await this.blockstore.close()
  }

  /**
   * Initializes the repo.
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
    ])
    await this.files.unsafeSetRepoRoot(this.repoRoot.cid)
    await this.settings.unsafeSetRepoRoot(this.repoRoot.cid)

    // signal ready AFTER roots wired up
    this.#resolveInitPromise()
  }

  get initialized() {
    // treat "repoRoot resolved" as initialized; templateRoot may be optional
    return Boolean(this.repoRoot && this.repoRoot.cid)
  }

  async #importRepoData(cid) {
    const response = await this.dservice.fetch(`/page?cid=${cid}`)
    const carBytes = new Uint8Array(await response.arrayBuffer());
    const car = carFromBytes(carBytes)

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

  async getMarkdown(path) {
    await this.#ensureRepoData()
    const data = await this.#getPageEdit(path)
    if (data) return data.markdown
    return cat(this.unixfs, this.repoRoot.cid, path + 'index.md')
  }

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
    } catch {
      return false
    }
  }

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

  async restorePage(path) {
    assert(path.startsWith('/'), 'Path must start with /')
    assert(path.endsWith('/'), 'Path must end with /')
    this.storage.removeItem(`${EDIT_PREFIX}${path}`)
  }

  restoreAllPages() {
    const keys = Object.keys(this.storage).filter(key => key.startsWith(EDIT_PREFIX))
    for (const key of keys) this.storage.removeItem(key)
  }

  async #getPageEdit(path) {
    const data = this.storage.getItem(`${EDIT_PREFIX}${path}`)
    return data ? JSON.parse(data) : null
  }

  isOutdatedEdit(path) {
    const data = this.storage.getItem(`${EDIT_PREFIX}${path}`)
    if (data) {
      const parsed = JSON.parse(data)
      return parsed.root !== this.repoRoot.cid.toString()
    }
  }

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

  async getAllPages(altRoot = null) {
    await this.#ensureRepoData()
    const allFiles = await tree(this.blockstore, altRoot || this.repoRoot.cid)
    const currentFiles = allFiles.filter(name => !name.startsWith('/_'))
    const pages = currentFiles.filter(name => name.endsWith('/index.md')).map(name => name.replace('index.md', ''))
    return pages
  }

  async pageExists(path) {
    const [pages, changes] = await Promise.all([
      this.getAllPages(),
      this.getChanges()
    ]);
    return pages.includes(path) || Boolean(changes.find(change => change.path === path))
  }

  async getHtmlBody(path, ignoreEdits = false) {
    if (!ignoreEdits) {
      const data = await this.#getPageEdit(path)
      if (data?.body) return data.body
    }
    await this.#ensureRepoData()
    const html = await cat(this.unixfs, this.repoRoot.cid, path + 'index.html')
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.getElementById('content-container')?.innerHTML
    return body
  }

  async getMetadata(path, ignoreEdits = false) {
    if (!ignoreEdits) {
      const data = await this.#getPageEdit(path)
      if (data) return parseFrontmatter(data.markdown)
    }
    await this.#ensureRepoData()
    const html = await cat(this.unixfs, this.repoRoot.cid, path + 'index.html')
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const title = doc.querySelector('title')?.textContent
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')
    const sidebar = doc.querySelector('meta[name="spg-sidebar"]')?.getAttribute('content')
    return { title, description, sidebar }
  }

  async isNewVersionAvailable() {
    await this.#initPromise;
    const getVersion = async (cid) => {
      const html = await cat(this.unixfs, cid, '_template.html')
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      return doc.querySelector('meta[name="version"]').getAttribute('content');
    }
    const currentVersion = await getVersion(this.repoRoot.cid)
    let templateVersion = currentVersion
    if (this.templateRoot?.cid) {
      await this.#ensureRepoData(true)
      templateVersion = await getVersion(this.templateRoot.cid)
    }
    return { templateVersion, currentVersion, canUpdate: templateVersion !== currentVersion }
  }

  async #renderHtml({ body, markdown }, targetDomain, path, root) {
    const templateHtml = await cat(this.unixfs, root, '/_template.html')
    const avatarPath = await this.files.getAvatarPath()
    const frontmatter = parseFrontmatter(markdown)
    return populateTemplate(templateHtml, body, targetDomain, path, frontmatter, avatarPath)
  }

  /**
   * Stages the current edits for a commit.
   */
  async stage(targetDomain, wantUpdateTemplate = false) {
    assert(await this.blockstore.has(this.repoRoot.cid), 'Repo root not in blockstore')
    let edits = await this.getChanges()
    const filesChanged = await this.files.hasChanges()
    const settingsChanged = await this.settings.hasChanges()
    if (wantUpdateTemplate) assert(this.templateRoot.cid, 'Template root not found')
    const willUpdateTemplate = wantUpdateTemplate && (await this.isNewVersionAvailable()).canUpdate
    assert(edits.length > 0 || filesChanged || settingsChanged || willUpdateTemplate, 'No edits to stage')

    // snapshot previous version
    const emptyDir = await this.unixfs.addDirectory()
    const zeroDir = await this.unixfs.cp(this.repoRoot.cid, emptyDir, '0')
    const rootToUse = willUpdateTemplate ? this.templateRoot.cid : this.repoRoot.cid
    const newRootWithoutPrev = await this.unixfs.rm(rootToUse, '_prev')
    let rootPointer = await this.unixfs.cp(zeroDir, newRootWithoutPrev, '_prev')

    // files
    const { cid: newFilesRoot, unchangedCids: unchangedFileCids } = await this.files.stage()
    rootPointer = await this.unixfs.cp(newFilesRoot, rootPointer, FILES_FOLDER, { force: true })

    // settings
    const newSettingsRoot = await this.settings.stage()
    rootPointer = await this.unixfs.cp(newSettingsRoot, rootPointer, SETTINGS_FILE, { force: true })

    // --- generate theme.css from saved settings (pre-JS) ---
    const savedSettings = await this.settings.read();
    const themePref = {
      light: savedSettings?.appearance?.themeLight || 'light',
      dark:  savedSettings?.appearance?.themeDark  || 'dark',
    }
    const themeCss = buildThemeCss(themePref)
    rootPointer = await addFile(this.unixfs, rootPointer, 'theme.css', themeCss)
    // -------------------------------------------------------

    // upgrade unchanged pages (template/avatar changes)
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

    // write pages
    for (const edit of edits) {
      const mdPath = edit.path + 'index.md'
      const htmlPath = edit.path + 'index.html'
      switch (edit.type) {
        case CHANGE_TYPE.DELETE:
          if (!willUpdateTemplate) {
            rootPointer = await rm(this.unixfs, rootPointer, mdPath)
            rootPointer = await rm(this.unixfs, rootPointer, htmlPath)
          }
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

    // misc assets
    const { title, description } = await this.getMetadata('/')
    const manifest = populateManifest(targetDomain, { title, description })
    rootPointer = await addFile(this.unixfs, rootPointer, 'manifest.json', manifest)
    rootPointer = await addFile(this.unixfs, rootPointer, 'manifest.webmanifest', manifest)
    const pages = await this.getAllPages(rootPointer)
    const redirects = populateRedirects(pages)
    rootPointer = await addFile(this.unixfs, rootPointer, '_redirects', redirects)

    const flushPromise = this.blockstore.flush()

    // build CAR (skip unchanged/ignored)
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
    for (const block of blocks) car.blocks.put(block)
    car.roots.push(rootPointer)

    // upload
    const cid = await this.#postCar(car, targetDomain)
    assert(cid.equals(rootPointer), `Mismatch between returned CID and expected CID: ${cid.toString()} !== ${rootPointer.toString()}`)

    const prepTx = await this.#prepareCommitTx(cid, targetDomain)
    await flushPromise
    return { cid, prepTx }
  }

  async #postCar(car, targetDomain) {
    const formData = new FormData();
    formData.append('file', new Blob([car.bytes], {
      type: 'application/vnd.ipld.car',
    }), 'site.car');

    const response = await this.dservice.fetch(`/page?domain=${encodeURIComponent(targetDomain)}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const result = await response.json();
    return CID.parse(result.cid)
  }

  async finalizeCommit(cid) {
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