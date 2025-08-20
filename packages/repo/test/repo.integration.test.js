import { jest } from '@jest/globals'
import 'fake-indexeddb/auto'
import { IDBFactory } from "fake-indexeddb";
import { globSource } from '@helia/unixfs'
import all from 'it-all'
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts'
import { join } from 'path';
import { CID } from 'multiformats/cid'
import { JSDOM } from 'jsdom'
import { resolveEnsDomain } from '@simplepg/common'
import { TestEnvironmentDservice } from '@simplepg/test-utils';

import { Repo } from '../src/repo.js';
import { CHANGE_TYPE } from '../src/constants.js';


// Mock DOMParser for Node.js environment
const dom = new JSDOM()
global.DOMParser = dom.window.DOMParser

const resetIDB = () => global.indexedDB = new IDBFactory()
const checkMeta = (doc, name, content) => {
  const meta = doc.querySelector(`meta[name="${name}"]`)
  expect(meta).toBeDefined()
  expect(meta.content).toBe(content)
}

// Mock storage for testing
class MockStorage {
  constructor() {
    this.store = new Map();
    return new Proxy(this, {
      ownKeys: () => [...this.store.keys()],
      getOwnPropertyDescriptor: (target, prop) => {
        return {
          enumerable: true,
          configurable: true,
          value: this.store.get(prop)
        };
      }
    });
  }

  getItem(key) {
    return this.store.get(key) || null;
  }

  setItem(key, value) {
    this.store.set(key, value);
  }

  removeItem(key) {
    this.store.delete(key);
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return Array.from(this.store.keys())[index];
  }

  clear() {
    this.store.clear();
  }
}

const cat = async (kubo, path) => {
  const content = await all(await kubo.cat(path))
  return new TextDecoder().decode(content[0])
}

const ls = async (kubo, path) => {
  const files = await all(await kubo.ls(path))
  return files.map(file => file.name)
}

jest.setTimeout(10000);

describe('Repo Integration Tests', () => {
  let testEnv;
  let addresses;
  let client;
  let walletClient;
  let storage;
  let repo;
  let templateCid;
  let testDataCid;
  let parser;

  beforeAll(async () => {
    testEnv = new TestEnvironmentDservice();
    await testEnv.start();
    addresses = testEnv.addresses;
    parser = new DOMParser()
    
    // Set up the resolver for new.simplepage.eth (template domain)
    testEnv.evm.setResolver(addresses.universalResolver, 'new.simplepage.eth', addresses.resolver1);
    testEnv.evm.setTextRecord(addresses.resolver1, 'new.simplepage.eth', 'dservice', testEnv.dserviceUrl);
    
    // Set up a test domain
    testEnv.evm.setResolver(addresses.universalResolver, 'test.eth', addresses.resolver1);
    
    // Add some test content to IPFS for the template
    async function loadFixtures(path) {
      const glob = globSource(join(process.cwd(), path), '**/*')
      const entries = await all(glob)
      const result = await all(await testEnv.kubo.kuboApi.addAll(entries, { wrapWithDirectory: true }))
      return result[result.length - 1].cid.toV1()
    }
    templateCid = await loadFixtures('./test/__fixtures__/new.simplepage.eth')
    testDataCid = await loadFixtures('./test/__fixtures__/test.eth')

    client = createPublicClient({
      transport: http(testEnv.evm.url)
    });

    const account = privateKeyToAccount(testEnv.evm.secretKey)

    walletClient = createWalletClient({
      chain: testEnv.evm.chain,
      transport: http(testEnv.evm.url),
      account
    });
  });

  afterAll(async () => {
    await testEnv.stop();
  });

  beforeEach(async () => {
    storage = new MockStorage();
    repo = new Repo('test.eth', storage);
  });

  afterEach(async () => {
    storage.clear();
    await repo.close()
  });

  describe('Constructor and init', () => {
    it('should construct Repo with domain and storage', () => {
      expect(repo.domain).toBe('test.eth');
      expect(repo.storage).toBe(storage);
      expect(repo.dservice).toBeDefined();
    });

    it('should fail initialization if test.eth has no contenthash', async () => {
      await expect(repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      })).rejects.toThrow('Repo root not found for test.eth');
    });

    it('should fail to initialize repo with viem client when test domain has no contenthash', async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString());
      
      await expect(repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      })).rejects.toThrow('Repo root not found');
    });

    it('should initialize repo with viem client when test domain has contenthash', async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      expect(repo.viemClient).toBe(client);
      expect(repo.chainId).toBe(parseInt(testEnv.evm.chainId));
      expect(repo.universalResolver).toBe(addresses.universalResolver);
      expect(repo.repoRoot).toBeDefined();
      expect(repo.templateRoot).toBeDefined();
    });
  });

  describe('Changes', () => {
    beforeAll(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString());
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', templateCid.toString());
    });

    beforeEach(async () => {
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });
    });

    it('should get markdown without active edits', async () => {
      const markdown = await repo.getMarkdown('/');
      expect(markdown).toBeDefined();
      expect(typeof markdown).toBe('string');
    });

    it('should get markdown with active page edits', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const markdown = await repo.getMarkdown('/');
      expect(markdown).toBe(testMarkdown);
    });

    it('should get HTML body without active edits', async () => {
      const htmlBody = await repo.getHtmlBody('/');
      expect(htmlBody).toBeDefined();
      expect(typeof htmlBody).toBe('string');
    });

    it('should get HTML body with active edits', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const htmlBody = await repo.getHtmlBody('/');
      expect(htmlBody).toBe(testBody);
    });

    it('should get HTML body ignoring edits when requested', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const htmlBody = await repo.getHtmlBody('/', true);
      expect(htmlBody).not.toBe(testBody);
      expect(htmlBody).toBeDefined();
    });

    it('should set page edits correctly', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const storedData = storage.getItem('spg_edit_/');
      expect(storedData).toBeDefined();
      
      const parsedData = JSON.parse(storedData);
      expect(parsedData.markdown).toBe(testMarkdown);
      expect(parsedData.body).toBe(testBody);
      expect(parsedData.root).toBe(repo.repoRoot.cid.toString());
    });

    it('should list staged edits', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      await repo.setPageEdit('/about/', '# About\n\nAbout page content.', '<h1>About</h1><p>About page content.</p>');
      
      const changes = await repo.getChanges();
      const paths = changes.map(change => change.path);
      expect(paths).toContain('/');
      expect(paths).toContain('/about/');
      expect(changes.length).toBe(2);
      expect(changes[0].type).toBe('edit');
      expect(changes[1].type).toBe('new');
    });

    it('should validate path format in setPageEdit', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      // Should throw for invalid paths
      await expect(repo.setPageEdit('invalid', testMarkdown, testBody)).rejects.toThrow('Path must start with /');
      await expect(repo.setPageEdit('/invalid', testMarkdown, testBody)).rejects.toThrow('Path must end with /');
      
      // Should work for valid paths
      await expect(repo.setPageEdit('/', testMarkdown, testBody)).resolves.not.toThrow();
      await expect(repo.setPageEdit('/about/', testMarkdown, testBody)).resolves.not.toThrow();
    });

    it('should handle restorePage functionality', async () => {
      // Create initial pages
      await repo.setPageEdit('/about/', '# About\n\nAbout content.', '<h1>About</h1><p>About content.</p>');
      await repo.setPageEdit('/blog/', '# Blog\n\nBlog content.', '<h1>Blog</h1><p>Blog content.</p>');
      
      // Stage and commit initial pages
      const firstResult = await repo.stage('test.eth', false);
      const hash1 = await walletClient.writeContract(firstResult.prepTx);
      await client.waitForTransactionReceipt({ hash: hash1 });
      await repo.finalizeCommit(firstResult.cid);
      
      // Delete a page
      await repo.deletePage('/about/');
      
      // Verify deletion is staged
      let changes = await repo.getChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].path).toBe('/about/');
      
      // Restore the deleted page
      await repo.restorePage('/about/');
      
      // Verify the deletion is removed from changes
      changes = await repo.getChanges();
      expect(changes.length).toBe(0);
    });

    it('should handle restoreAllPages functionality', async () => {
      // Create multiple pages with edits
      await repo.setPageEdit('/about/', '# About\n\nAbout content.', '<h1>About</h1><p>About content.</p>');
      await repo.setPageEdit('/blog/', '# Blog\n\nBlog content.', '<h1>Blog</h1><p>Blog content.</p>');
      await repo.setPageEdit('/contact/', '# Contact\n\nContact info.', '<h1>Contact</h1><p>Contact info.</p>');
      await repo.setPageEdit('/docs/', '# Docs\n\nDocumentation.', '<h1>Docs</h1><p>Documentation.</p>');
      
      // Verify all edits exist
      let changes = await repo.getChanges();
      expect(changes.length).toBe(4);
      expect(changes.map(c => c.path)).toContain('/about/');
      expect(changes.map(c => c.path)).toContain('/blog/');
      expect(changes.map(c => c.path)).toContain('/contact/');
      expect(changes.map(c => c.path)).toContain('/docs/');
      
      // Restore all pages
      repo.restoreAllPages();
      
      // Verify all edits are removed
      changes = await repo.getChanges();
      expect(changes.length).toBe(0);
      
      // Verify individual pages are also restored
      const aboutData = storage.getItem('spg_edit_/about/');
      expect(aboutData).toBeNull();
      
      const blogData = storage.getItem('spg_edit_/blog/');
      expect(blogData).toBeNull();
      
      const contactData = storage.getItem('spg_edit_/contact/');
      expect(contactData).toBeNull();
      
      const docsData = storage.getItem('spg_edit_/docs/');
      expect(docsData).toBeNull();
    });
  });

  describe('Version Management', () => {
    beforeAll(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString());
    });

    it('should check if new version is available', async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', templateCid.toString());
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });
      const versionInfo = await repo.isNewVersionAvailable();
      
      expect(versionInfo).toHaveProperty('templateVersion');
      expect(versionInfo).toHaveProperty('currentVersion');
      expect(versionInfo).toHaveProperty('canUpdate');
      expect(typeof versionInfo.templateVersion).toBe('string');
      expect(typeof versionInfo.currentVersion).toBe('string');
      expect(versionInfo.canUpdate).toBe(false);
    });

    it('should detect when template version is newer', async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });
      
      const versionInfo = await repo.isNewVersionAvailable();
      expect(versionInfo.canUpdate).toBe(true);
    });

    it('should persist pages across version updates', async () => {
      // Start with test.eth using testDataCid
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Add a few pages and commit without version update
      const pages = {
        about: {
          path: '/about/',
          markdown: '# About\n\nAbout page content.',
          body: '<h1>About</h1><p>About page content.</p>'
        },
        blog: {
          path: '/blog/',
          markdown: '# Blog\n\nBlog index page.',
          body: '<h1>Blog</h1><p>Blog index page.</p>'
        },
        contact: {
          path: '/contact/',
          markdown: '# Contact\n\nContact information.',
          body: '<h1>Contact</h1><p>Contact information.</p>'
        }
      };

      // Set page edits
      for (const page of Object.values(pages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }

      // Stage and commit without version update
      const firstResult = await repo.stage('test.eth', false);
      expect(firstResult).toHaveProperty('cid');
      expect(firstResult.cid instanceof CID).toBe(true);

      // Verify all pages are staged correctly
      for (const page of Object.values(pages)) {
        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);

        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);
      }

      // Commit the first version
      await repo.finalizeCommit(firstResult.cid);

      // Edit the root page and commit with version update
      const updatedRootMarkdown = '# Updated Home Page\n\nThis is the updated home page content.';
      const updatedRootBody = '<h1>Updated Home Page</h1><p>This is the updated home page content.</p>';
      
      await repo.setPageEdit('/', updatedRootMarkdown, updatedRootBody);
      
      const secondResult = await repo.stage('test.eth', true);
      expect(secondResult).toHaveProperty('cid');
      expect(secondResult.cid instanceof CID).toBe(true);

      // Verify the root page is updated
      const updatedRootMarkdownContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/index.md`);
      expect(updatedRootMarkdownContent).toBe(updatedRootMarkdown);

      const updatedRootHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/index.html`);
      expect(updatedRootHtmlContent).toContain(updatedRootBody);

      // Verify that pages added before are still there
      for (const page of Object.values(pages)) {
        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);

        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);
      }

      // Verify version is updated in the template
      const templateContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_template.html`);
      expect(templateContent).toBeDefined();
      const templateDoc = parser.parseFromString(templateContent, 'text/html');
      checkMeta(templateDoc, 'version', '0.5.0');

      // Verify _assets and _js folders are updated
      const assetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_assets`);
      expect(assetsContent).toBe('folder-updated');

      const jsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_js`);
      expect(jsContent).toBe('folder-updated');

      // Commit the second version
      const hash2 = await walletClient.writeContract(secondResult.prepTx);
      expect(hash2).toBeDefined();
      const transaction2 = await client.waitForTransactionReceipt({ hash: hash2 });
      expect(transaction2.status).toBe('success');

      // Verify the final state through ENS resolution
      const { cid: finalRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver);
      expect(finalRoot.toString()).toBe(secondResult.cid.toString());
    });
  });

  describe('Staging and Finalization', () => {
    beforeAll(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString());
    });

    beforeEach(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });
    });

    it('should stage and commit changes without template update', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const result = await repo.stage('test.eth', false);
      
      expect(result).toHaveProperty('cid');
      expect(result).toHaveProperty('prepTx');
      expect(result.cid instanceof CID).toBe(true);
      expect(result.prepTx).toHaveProperty('address');
      expect(result.prepTx).toHaveProperty('functionName');
      expect(result.prepTx.functionName).toBe('setContenthash');

      // verify the markdown content
      const markdown = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/index.md')
      expect(markdown).toBe(testMarkdown)

      // verify the html content
      const html = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/index.html')

      // verify the testBody is inside the root div of the html
      expect(html).toContain(testBody)
      expect(html).toMatch(/^<!DOCTYPE html>?/)
      expect(html).toContain('<title>test.eth</title>')

      // verify meta tags: version, ens-domain, description
      const doc = parser.parseFromString(html, 'text/html')
      checkMeta(doc, 'version', '0.4.0')
      checkMeta(doc, 'ens-domain', 'test.eth')
      checkMeta(doc, 'description', 'A SimplePage by test.eth')

      // verify favicon path
      const favicon = doc.querySelector('link[rel="icon"]')
      expect(favicon).toBeDefined()
      expect(favicon.href).toBe('/_assets/images/favicon.ico')

      // verify the repo root is updated
      // uses viemClient to submit the prepTx
      const hash = await walletClient.writeContract(result.prepTx)
      expect(hash).toBeDefined()
      const transaction = await client.waitForTransactionReceipt({ hash })
      expect(transaction).toBeDefined()
      expect(transaction.status).toBe('success')
      
      const { cid: updatedRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver)

      // verify the repo root is updated
      expect(updatedRoot.toString()).toBe(result.cid.toString())

      // verify the _assets folders are not updated
      const assetsContent = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_assets')
      expect(assetsContent).toBe('folder-not-updated')

      const jsContent = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_js')
      expect(jsContent).toBe('folder-not-updated')

      const templateContent = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_template.html')
      expect(templateContent).toBeDefined()
      const templateDoc = parser.parseFromString(templateContent, 'text/html')
      checkMeta(templateDoc, 'version', '0.4.0')
    });

    it('should stage and commit changes with template update', async () => {
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const result = await repo.stage('test.eth', true);
      
      expect(result).toHaveProperty('cid');
      expect(result).toHaveProperty('prepTx');
      expect(result.cid instanceof CID).toBe(true);
      expect(result.prepTx).toHaveProperty('address');
      expect(result.prepTx).toHaveProperty('functionName');
      expect(result.prepTx.functionName).toBe('setContenthash');

      // verify the markdown content
      const markdown = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/index.md')
      expect(markdown).toBe(testMarkdown)

      // verify the html content
      const html = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/index.html')

      // verify the testBody is inside the root div of the html
      expect(html).toContain(testBody)
      expect(html).toContain('<title>test.eth</title>')

      // verify meta tags: version, ens-domain, description
      const doc = parser.parseFromString(html, 'text/html')
      checkMeta(doc, 'version', '0.5.0')

      // verify the _assets folders are updated
      const assetsContent = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_assets')
      expect(assetsContent).toBe('folder-updated')

      const jsContent = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_js')
      expect(jsContent).toBe('folder-updated')

      const templateContent = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_template.html')
      expect(templateContent).toBeDefined()
      const templateDoc = parser.parseFromString(templateContent, 'text/html')
      checkMeta(templateDoc, 'version', '0.5.0')

      // verify the repo root is updated
      // uses viemClient to submit the prepTx
      const hash = await walletClient.writeContract(result.prepTx)
      expect(hash).toBeDefined()
      const transaction = await client.waitForTransactionReceipt({ hash })
      expect(transaction).toBeDefined()
      expect(transaction.status).toBe('success')
      
      const { cid: updatedRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver)

      // verify the repo root is updated
      expect(updatedRoot.toString()).toBe(result.cid.toString())
    });

    it('should properly populate template with title and description in markdown preamble', async () => {
      const testMarkdown = `---
title: My Custom Title
description: This is a custom description for the page
---

# Test Page

This is a test page with custom title and description.`;
      
      const testBody = '<h1>Test Page</h1><p>This is a test page with custom title and description.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      
      const result = await repo.stage('test.eth', false);
      
      expect(result).toHaveProperty('cid');
      expect(result).toHaveProperty('prepTx');
      expect(result.cid instanceof CID).toBe(true);

      // verify the markdown content is preserved
      const markdown = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/index.md')
      expect(markdown).toBe(testMarkdown)

      // verify the html content
      const html = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/index.html')

      // verify the testBody is inside the root div of the html
      expect(html).toContain(testBody)

      // verify meta tags are populated with custom title and description
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      
      // Check that title is set to custom title from frontmatter
      const titleElement = doc.querySelector('title')
      expect(titleElement).toBeDefined()
      expect(titleElement.textContent).toBe('My Custom Title')
      
      checkMeta(doc, 'version', '0.4.0')
      checkMeta(doc, 'ens-domain', 'test.eth')
      checkMeta(doc, 'description', 'This is a custom description for the page')
      
      // Check Open Graph and Twitter meta tags
      const ogTitle = doc.querySelector('meta[property="og:title"]')
      expect(ogTitle).toBeDefined()
      expect(ogTitle.content).toBe('My Custom Title')
      
      const ogSiteName = doc.querySelector('meta[property="og:site_name"]')
      expect(ogSiteName).toBeDefined()
      expect(ogSiteName.content).toBe('test.eth')

      const ogDescription = doc.querySelector('meta[property="og:description"]')
      expect(ogDescription).toBeDefined()
      expect(ogDescription.content).toBe('This is a custom description for the page')
      
      const twitterTitle = doc.querySelector('meta[name="twitter:title"]')
      expect(twitterTitle).toBeDefined()
      expect(twitterTitle.content).toBe('My Custom Title')
      
      const twitterDescription = doc.querySelector('meta[name="twitter:description"]')
      expect(twitterDescription).toBeDefined()
      expect(twitterDescription.content).toBe('This is a custom description for the page')

      // verify favicon path
      const favicon = doc.querySelector('link[rel="icon"]')
      expect(favicon).toBeDefined()
      expect(favicon.href).toBe('/_assets/images/favicon.ico')

      // verify the repo root is updated
      const hash = await walletClient.writeContract(result.prepTx)
      expect(hash).toBeDefined()
      const transaction = await client.waitForTransactionReceipt({ hash })
      expect(transaction).toBeDefined()
      expect(transaction.status).toBe('success')
      
      const { cid: updatedRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver)
      expect(updatedRoot.toString()).toBe(result.cid.toString())
    });

    it('should stage and commit changes (multiple edits)', async () => {
      const pages = {
        root: {
          path: '/',
          markdown: '# Test Page\n\nThis is a test.',
          body: '<h1>Test Page</h1><p>This is a test.</p>'
        },
        about: {
          path: '/about/',
          markdown: '# About\n\nAbout page content.',
          body: '<h1>About</h1><p>About page content.</p>'
        },
        blog: {
          path: '/blog/',
          markdown: '# Blog\n\nBlog index page.',
          body: '<h1>Blog</h1><p>Blog index page.</p>'
        },
        blogOne: {
          path: '/blog/one/',
          markdown: '# Blog Post One\n\nFirst blog post.',
          body: '<h1>Blog Post One</h1><p>First blog post.</p>'
        },
        blogTwo: {
          path: '/blog/two/',
          markdown: '# Blog Post Two\n\nSecond blog post.',
          body: '<h1>Blog Post Two</h1><p>Second blog post.</p>'
        }
      };
      
      // Set page edits
      for (const page of Object.values(pages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }
      
      // Verify edits exist
      let changes = await repo.getChanges();
      const paths = changes.map(change => change.path);
      expect(changes.length).toBe(5);
      expect(paths).toContain('/');
      expect(paths).toContain('/about/');
      expect(paths).toContain('/blog/');
      expect(paths).toContain('/blog/one/');
      expect(paths).toContain('/blog/two/');
      
      // Stage and finalize
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result).toHaveProperty('prepTx');
      expect(result.cid instanceof CID).toBe(true);
      
      // Verify all pages are staged correctly
      for (const page of Object.values(pages)) {
        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);

        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);

        const doc = parser.parseFromString(html, 'text/html');
        const favicon = doc.querySelector('link[rel="icon"]');
        expect(favicon).toBeDefined();
        
        expect(favicon.href).toBe('/_assets/images/favicon.ico');
      }
    });

    it('should use _prev directory as the root for the previous version', async () => {
      // First update: stage changes without template update
      const firstMarkdown = '# First Version\n\nThis is the first version.';
      const firstBody = '<h1>First Version</h1><p>This is the first version.</p>';
      
      await repo.setPageEdit('/', firstMarkdown, firstBody);
      
      const firstResult = await repo.stage('test.eth', false);
      expect(firstResult).toHaveProperty('cid');
      expect(firstResult.cid instanceof CID).toBe(true);
      await repo.finalizeCommit(firstResult.cid);
      
      // Verify first version content
      const firstMarkdownContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/index.md`);
      expect(firstMarkdownContent).toBe(firstMarkdown);
      
      const firstHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/index.html`);
      expect(firstHtmlContent).toContain(firstBody);

      const firstTemplateMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/_template.html`);

      // verify the template (testDataCid) content is in the _prev/0 directory
      const actualTemplateMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${testDataCid.toString()}/_template.html`);
      const prevTemplateMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/_prev/0/_template.html`);
      expect(actualTemplateMdContent).toBe(prevTemplateMdContent);
      expect(actualTemplateMdContent).toBe(firstTemplateMdContent);
      
      const actualIndexMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${testDataCid.toString()}/index.md`);
      const prevIndexMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/_prev/0/index.md`);
      expect(actualIndexMdContent).toBe(prevIndexMdContent);

      const actualIndexHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${testDataCid.toString()}/index.html`);
      const prevIndexHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/_prev/0/index.html`);
      expect(actualIndexHtmlContent).toBe(prevIndexHtmlContent);

      
      // Second update: stage changes with template update
      const secondMarkdown = '# Second Version\n\nThis is the second version with template update.';
      const secondBody = '<h1>Second Version</h1><p>This is the second version with template update.</p>';
      
      await repo.setPageEdit('/', secondMarkdown, secondBody);
      
      const secondResult = await repo.stage('test.eth', true);
      expect(secondResult).toHaveProperty('cid');
      expect(secondResult.cid instanceof CID).toBe(true);
      await repo.finalizeCommit(secondResult.cid);
      

      // Verify second version content
      const secondMarkdownContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/index.md`);
      expect(secondMarkdownContent).toBe(secondMarkdown);
      
      const secondHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/index.html`);
      expect(secondHtmlContent).toContain(secondBody);
      const secondHtmlDoc = parser.parseFromString(secondHtmlContent, 'text/html');
      checkMeta(secondHtmlDoc, 'version', '0.5.0');
      

      // verify the template (testDataCid) content is in the _prev/0/_prev/0 directory
      const prevPrevTemplateMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_prev/0/_template.html`);
      expect(actualTemplateMdContent).toBe(prevPrevTemplateMdContent);
      
      const prevPrevIndexMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_prev/0/index.md`);
      expect(actualIndexMdContent).toBe(prevPrevIndexMdContent);

      const prevPrevIndexHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_prev/0/index.html`);
      expect(actualIndexHtmlContent).toBe(prevPrevIndexHtmlContent);
      const prevPrevHtmlDoc = parser.parseFromString(prevPrevIndexHtmlContent, 'text/html');
      checkMeta(prevPrevHtmlDoc, 'version', '0.4.0');
      
      
      // verify the previous version of the app is in the _prev/0 directory
      const prevSecondResultTemplateMdContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_template.html`);
      expect(prevSecondResultTemplateMdContent).toBe(firstTemplateMdContent);

      const prevSecondResultMarkdownContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/index.md`);
      expect(prevSecondResultMarkdownContent).toBe(firstMarkdownContent);
      expect(prevSecondResultMarkdownContent).toBe(firstMarkdown);

      const prevSecondResultHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/index.html`);
      expect(prevSecondResultHtmlContent).toBe(firstHtmlContent);
      expect(prevSecondResultHtmlContent).toContain(firstBody);
      const prevSecondResultHtmlDoc = parser.parseFromString(prevSecondResultHtmlContent, 'text/html');
      checkMeta(prevSecondResultHtmlDoc, 'version', '0.4.0');


      // Verify _assets are updated in second version
      const secondAssetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_assets`);
      expect(secondAssetsContent).toBe('folder-updated');
      const prev0AssetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_assets`);
      expect(prev0AssetsContent).toBe('folder-not-updated');
      const prevPrevPrevAssetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_prev/0/_assets`);
      expect(prevPrevPrevAssetsContent).toBe('folder-not-updated');

      // Verify _js are updated in second version
      const secondJsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_js`);
      expect(secondJsContent).toBe('folder-updated');
      const prev0JsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_js`);
      expect(prev0JsContent).toBe('folder-not-updated');
      const prevPrevPrevJsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/_prev/0/_prev/0/_js`);
      expect(prevPrevPrevJsContent).toBe('folder-not-updated');
    })

    it('should handle page deletion correctly', async () => {
      // Test 1: deleting page at '/' shouldn't work
      await expect(repo.deletePage('/')).rejects.toThrow('Cannot delete root page');

      // Test 2: delete a page that only exists as an edit
      const testMarkdown = '# Test Page\n\nThis is a test.';
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/about/', testMarkdown, testBody);
      await repo.setPageEdit('/blog/', '# Blog\n\nBlog content.', '<h1>Blog</h1><p>Blog content.</p>');
      await repo.setPageEdit('/contact/', '# Contact\n\nContact info.', '<h1>Contact</h1><p>Contact info.</p>');
      
      // Verify edits exist
      let changes = await repo.getChanges();
      expect(changes.length).toBe(3);
      expect(changes.map(c => c.path)).toContain('/about/');
      expect(changes.map(c => c.path)).toContain('/blog/');
      expect(changes.map(c => c.path)).toContain('/contact/');
      
      // Delete a page that only exists as an edit
      await repo.deletePage('/contact/');
      
      // Verify the edit was removed
      changes = await repo.getChanges();
      expect(changes.length).toBe(2);
      expect(changes.map(c => c.path)).toContain('/about/');
      expect(changes.map(c => c.path)).toContain('/blog/');
      expect(changes.map(c => c.path)).not.toContain('/contact/');
      
      // Stage and commit the new pages
      const firstResult = await repo.stage('test.eth', false);
      expect(firstResult).toHaveProperty('cid');
      expect(firstResult.cid instanceof CID).toBe(true);
      
      // Verify the pages are staged correctly
      const aboutMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/about/index.md`);
      expect(aboutMarkdown).toBe(testMarkdown);
      
      const blogMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/blog/index.md`);
      expect(blogMarkdown).toBe('# Blog\n\nBlog content.');
      
      // Verify contact page doesn't exist
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/contact/index.md`)).rejects.toThrow();
      
      // Commit the first version
      const hash1 = await walletClient.writeContract(firstResult.prepTx);
      expect(hash1).toBeDefined();
      const transaction1 = await client.waitForTransactionReceipt({ hash: hash1 });
      expect(transaction1.status).toBe('success');
      await repo.finalizeCommit(firstResult.cid);
      
      // Delete one of the newly committed pages
      await repo.deletePage('/about/');
      
      // Verify the deletion is staged
      changes = await repo.getChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].path).toBe('/about/');
      
      // Stage and commit the deletion
      const secondResult = await repo.stage('test.eth', false);
      expect(secondResult).toHaveProperty('cid');
      expect(secondResult.cid instanceof CID).toBe(true);
      
      // Verify the about page is deleted
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/about/index.md`)).rejects.toThrow();
      
      // Verify the blog page still exists
      const blogMarkdownAfterDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${secondResult.cid.toString()}/blog/index.md`);
      expect(blogMarkdownAfterDelete).toBe('# Blog\n\nBlog content.');
      
      // Commit the second version
      const hash2 = await walletClient.writeContract(secondResult.prepTx);
      expect(hash2).toBeDefined();
      const transaction2 = await client.waitForTransactionReceipt({ hash: hash2 });
      expect(transaction2.status).toBe('success');
      
      // Verify the final state through ENS resolution
      const { cid: finalRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver);
      expect(finalRoot.toString()).toBe(secondResult.cid.toString());
    });

    it('should handle deletion with multiple directory depths', async () => {
      // Create a nested structure
      await repo.setPageEdit('/docs/', '# Documentation\n\nMain docs.', '<h1>Documentation</h1><p>Main docs.</p>');
      await repo.setPageEdit('/docs/guides/', '# Guides\n\nUser guides.', '<h1>Guides</h1><p>User guides.</p>');
      await repo.setPageEdit('/docs/guides/getting-started/', '# Getting Started\n\nGetting started guide.', '<h1>Getting Started</h1><p>Getting started guide.</p>');
      await repo.setPageEdit('/docs/guides/advanced/', '# Advanced\n\nAdvanced guide.', '<h1>Advanced</h1><p>Advanced guide.</p>');
      await repo.setPageEdit('/docs-v2/api/', '# API Docs\n\nAPI documentation.', '<h1>API Docs</h1><p>API documentation.</p>');
      
      // Stage and commit the initial structure
      const initialResult = await repo.stage('test.eth', false);
      expect(initialResult).toHaveProperty('cid');
      expect(initialResult.cid instanceof CID).toBe(true);
      
      // Verify all pages are staged correctly
      const docsMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}/docs/index.md`);
      expect(docsMarkdown).toBe('# Documentation\n\nMain docs.');
      
      const guidesMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}/docs/guides/index.md`);
      expect(guidesMarkdown).toBe('# Guides\n\nUser guides.');
      
      const gettingStartedMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}/docs/guides/getting-started/index.md`);
      expect(gettingStartedMarkdown).toBe('# Getting Started\n\nGetting started guide.');
      
      const advancedMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}/docs/guides/advanced/index.md`);
      expect(advancedMarkdown).toBe('# Advanced\n\nAdvanced guide.');
      
      const apiMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}/docs-v2/api/index.md`);
      expect(apiMarkdown).toBe('# API Docs\n\nAPI documentation.');
      
      // Commit the initial version
      const hash1 = await walletClient.writeContract(initialResult.prepTx);
      expect(hash1).toBeDefined();
      const transaction1 = await client.waitForTransactionReceipt({ hash: hash1 });
      expect(transaction1.status).toBe('success');
      await repo.finalizeCommit(initialResult.cid);
      
      // Test 1: Delete /docs-v2/api/ - should remove api page and empty parent directory
      await repo.deletePage('/docs-v2/api/');
      
      let changes = await repo.getChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].path).toBe('/docs-v2/api/');
      
      const deleteApiResult = await repo.stage('test.eth', false);
      expect(deleteApiResult).toHaveProperty('cid');
      expect(deleteApiResult.cid instanceof CID).toBe(true);
      
      // Verify api page is deleted
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/docs-v2/api/index.md`)).rejects.toThrow();
      
      // Verify docs-v2 directory is also removed (empty parent directory)
      expect(await ls(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/`)).toBeDefined();
      // await expect(ls(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/docs-v2/api/not-exists`)).rejects.toThrow();
      await expect(ls(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/docs-v2/api`)).rejects.toThrow();
      await expect(ls(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/docs-v2`)).rejects.toThrow();
      
      // Verify other pages still exist
      const docsMarkdownAfterApiDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/docs/index.md`);
      expect(docsMarkdownAfterApiDelete).toBe('# Documentation\n\nMain docs.');
      
      const guidesMarkdownAfterApiDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteApiResult.cid.toString()}/docs/guides/index.md`);
      expect(guidesMarkdownAfterApiDelete).toBe('# Guides\n\nUser guides.');
      
      // // Commit the api deletion
      await repo.finalizeCommit(deleteApiResult.cid);

      let pages = await repo.getAllPages();
      expect(pages.length).toBe(5);
      expect(pages).toContain('/');
      expect(pages).toContain('/docs/');
      expect(pages).toContain('/docs/guides/');
      expect(pages).toContain('/docs/guides/getting-started/');
      expect(pages).toContain('/docs/guides/advanced/');
      expect(pages).not.toContain('/docs-v2/api/');
      
      // Test 2: Delete /docs/guides/ - should remove guides content but keep children
      await repo.deletePage('/docs/guides/');
      
      changes = await repo.getChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].path).toBe('/docs/guides/');
      
      const deleteGuidesResult = await repo.stage('test.eth', false);
      expect(deleteGuidesResult).toHaveProperty('cid');
      expect(deleteGuidesResult.cid instanceof CID).toBe(true);

      
      // Verify guides index page is deleted
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${deleteGuidesResult.cid.toString()}/docs/guides/index.md`)).rejects.toThrow();
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${deleteGuidesResult.cid.toString()}/docs/guides/index.html`)).rejects.toThrow();
      
      // Verify children pages still exist
      const gettingStartedMarkdownAfterGuidesDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteGuidesResult.cid.toString()}/docs/guides/getting-started/index.md`);
      expect(gettingStartedMarkdownAfterGuidesDelete).toBe('# Getting Started\n\nGetting started guide.');
      
      const advancedMarkdownAfterGuidesDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteGuidesResult.cid.toString()}/docs/guides/advanced/index.md`);
      expect(advancedMarkdownAfterGuidesDelete).toBe('# Advanced\n\nAdvanced guide.');
      
      // Verify docs page still exists
      const docsMarkdownAfterGuidesDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteGuidesResult.cid.toString()}/docs/index.md`);
      expect(docsMarkdownAfterGuidesDelete).toBe('# Documentation\n\nMain docs.');
      
      // Commit the guides deletion
      await repo.finalizeCommit(deleteGuidesResult.cid);

      pages = await repo.getAllPages();
      expect(pages.length).toBe(4);
      expect(pages).toContain('/');
      expect(pages).toContain('/docs/');
      expect(pages).toContain('/docs/guides/getting-started/');
      expect(pages).toContain('/docs/guides/advanced/');
      
      // Test 3: Delete /docs/guides/advanced/ - should remove only the specified page
      await repo.deletePage('/docs/guides/advanced/');
      
      changes = await repo.getChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].path).toBe('/docs/guides/advanced/');
      
      const deleteAdvancedResult = await repo.stage('test.eth', false);
      expect(deleteAdvancedResult).toHaveProperty('cid');
      expect(deleteAdvancedResult.cid instanceof CID).toBe(true);
      
      // Verify advanced page is deleted
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${deleteAdvancedResult.cid.toString()}/docs/guides/advanced/index.md`)).rejects.toThrow();
      
      // Verify sibling page still exists
      const gettingStartedMarkdownAfterAdvancedDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteAdvancedResult.cid.toString()}/docs/guides/getting-started/index.md`);
      expect(gettingStartedMarkdownAfterAdvancedDelete).toBe('# Getting Started\n\nGetting started guide.');
      
      // Verify parent pages still exist
      const docsMarkdownAfterAdvancedDelete = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteAdvancedResult.cid.toString()}/docs/index.md`);
      expect(docsMarkdownAfterAdvancedDelete).toBe('# Documentation\n\nMain docs.');
      
      // Commit the final version
      await repo.finalizeCommit(deleteAdvancedResult.cid);

      pages = await repo.getAllPages();
      expect(pages.length).toBe(3);
      expect(pages).toContain('/');
      expect(pages).toContain('/docs/');
      expect(pages).toContain('/docs/guides/getting-started/');
      expect(pages).not.toContain('/docs/guides/advanced/');
    });

    it('should handle staging with no edits', async () => {
      await expect(repo.stage('test.eth', false)).rejects.toThrow('No edits to stage');
    });

    it('should stage with template update when there are no file or page edits', async () => {
      // Stage with template update should work
      const result = await repo.stage('test.eth', true);
      expect(result).toHaveProperty('cid');
      expect(result).toHaveProperty('prepTx');
      expect(result.cid instanceof CID).toBe(true);
      
      // Verify template is updated to version 0.5.0
      const templateContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_template.html`);
      expect(templateContent).toBeDefined();
      const templateDoc = parser.parseFromString(templateContent, 'text/html');
      checkMeta(templateDoc, 'version', '0.5.0');
      
      // Verify _assets and _js folders are updated
      const assetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_assets`);
      expect(assetsContent).toBe('folder-updated');
      
      const jsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_js`);
      expect(jsContent).toBe('folder-updated');
    });

    it('should include manifest.json and _redirects files during staging', async () => {
      const testMarkdown = `---
title: My Custom Title
description: This is a custom description for the page
---

# Test Page

This is a test.`;
      const testBody = '<h1>Test Page</h1><p>This is a test.</p>';
      
      await repo.setPageEdit('/', testMarkdown, testBody);
      await repo.setPageEdit('/about/', testMarkdown, testBody);
      
      const result = await repo.stage('test.eth', false);
      
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // verify the manifest.json file is included
      const manifest = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/manifest.json');
      expect(manifest).toBeDefined();
      
      // parse and verify manifest content
      const manifestData = JSON.parse(manifest);
      expect(manifestData.name).toBe('My Custom Title');
      expect(manifestData.short_name).toBe('test.eth');
      expect(manifestData.description).toBe('This is a custom description for the page');
      expect(manifestData.icons).toBeDefined();
      expect(manifestData.icons.length).toBe(1);
      expect(manifestData.icons[0].src).toBe('/_assets/images/logo.svg');
      expect(manifestData.icons[0].sizes).toBe('192x192');
      expect(manifestData.icons[0].type).toBe('image/svg+xml');
      expect(manifestData.dapp_repository).toBe('https://github.com/stigmergic-org/simplepage');
      expect(manifestData.dapp_contracts).toEqual([]);

      // verify the _redirects file is included
      const redirects = await cat(testEnv.kubo.kuboApi, '/ipfs/' + result.cid.toString() + '/_redirects');
      expect(redirects).toBeDefined();
      expect(redirects.trim()).toContain('/* / 200');
      expect(redirects.trim()).toContain('/about/* /about/ 200');
    });

    it('should persist committed pages and allow loading from a new Repo instance', async () => {
      // Add two pages
      const page1 = {
        path: '/foo/',
        markdown: '# Foo\n\nFoo page content.',
        body: '<h1>Foo</h1><p>Foo page content.</p>'
      };
      const page2 = {
        path: '/bar/',
        markdown: '# Bar\n\nBar page content.',
        body: '<h1>Bar</h1><p>Bar page content.</p>'
      };
      // Add multi-depth: /foo/bar/ (with content at both /foo/ and /foo/bar/)
      const pageFooBar = {
        path: '/foo/bar/',
        markdown: '# FooBar\n\nFooBar page content.',
        body: '<h1>FooBar</h1><p>FooBar page content.</p>'
      };
      // Add multi-depth: /baz/bar/ (with content only at /baz/bar/)
      const pageBazBar = {
        path: '/baz/bar/',
        markdown: '# BazBar\n\nBazBar page content.',
        body: '<h1>BazBar</h1><p>BazBar page content.</p>'
      };
      await repo.setPageEdit(page1.path, page1.markdown, page1.body);
      await repo.setPageEdit(page2.path, page2.markdown, page2.body);
      await repo.setPageEdit(pageFooBar.path, pageFooBar.markdown, pageFooBar.body);
      await repo.setPageEdit(pageBazBar.path, pageBazBar.markdown, pageBazBar.body);

      // Stage and commit
      const result = await repo.stage('test.eth', false);
      const hash = await walletClient.writeContract(result.prepTx);
      await client.waitForTransactionReceipt({ hash });
      await repo.finalizeCommit(result.cid);

      // Create a new Repo instance with a fresh storage
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Load all pages and verify content
      const allPages = await newRepo.getAllPages();
      expect(allPages).toContain('/');
      expect(allPages).toContain('/foo/');
      expect(allPages).toContain('/bar/');
      expect(allPages).toContain('/foo/bar/');
      expect(allPages).toContain('/baz/bar/');
      // /baz/ should not be present as a page
      expect(allPages).not.toContain('/baz/');

      const fooMarkdown = await newRepo.getMarkdown('/foo/');
      expect(fooMarkdown).toBe(page1.markdown);
      const fooHtml = await newRepo.getHtmlBody('/foo/');
      expect(fooHtml).toContain('Foo page content.');

      const barMarkdown = await newRepo.getMarkdown('/bar/');
      expect(barMarkdown).toBe(page2.markdown);
      const barHtml = await newRepo.getHtmlBody('/bar/');
      expect(barHtml).toContain('Bar page content.');

      const fooBarMarkdown = await newRepo.getMarkdown('/foo/bar/');
      expect(fooBarMarkdown).toBe(pageFooBar.markdown);
      const fooBarHtml = await newRepo.getHtmlBody('/foo/bar/');
      expect(fooBarHtml).toContain('FooBar page content.');

      const bazBarMarkdown = await newRepo.getMarkdown('/baz/bar/');
      expect(bazBarMarkdown).toBe(pageBazBar.markdown);
      const bazBarHtml = await newRepo.getHtmlBody('/baz/bar/');
      expect(bazBarHtml).toContain('BazBar page content.');

      // /baz/ should throw or be undefined
      await expect(newRepo.getMarkdown('/baz/')).rejects.toThrow();
      await newRepo.close()
    });

    it('should update all pages to latest version when staging with template update', async () => {
      // Create initial pages at different depths
      const pages = {
        root: {
          path: '/',
          markdown: '# Home Page\n\nWelcome to the home page.',
          body: '<h1>Home Page</h1><p>Welcome to the home page.</p>'
        },
        about: {
          path: '/about/',
          markdown: '# About\n\nAbout page content.',
          body: '<h1>About</h1><p>About page content.</p>'
        },
        docs: {
          path: '/docs/',
          markdown: '# Documentation\n\nMain documentation.',
          body: '<h1>Documentation</h1><p>Main documentation.</p>'
        },
        docsGuides: {
          path: '/docs/guides/',
          markdown: '# Guides\n\nUser guides.',
          body: '<h1>Guides</h1><p>User guides.</p>'
        },
        docsGuidesGettingStarted: {
          path: '/docs/guides/getting-started/',
          markdown: '# Getting Started\n\nGetting started guide.',
          body: '<h1>Getting Started</h1><p>Getting started guide.</p>'
        },
        docsGuidesAdvanced: {
          path: '/docs/guides/advanced/',
          markdown: '# Advanced\n\nAdvanced guide.',
          body: '<h1>Advanced</h1><p>Advanced guide.</p>'
        },
        blog: {
          path: '/blog/',
          markdown: '# Blog\n\nBlog index page.',
          body: '<h1>Blog</h1><p>Blog index page.</p>'
        },
        blogPost1: {
          path: '/blog/post-1/',
          markdown: '# Blog Post 1\n\nFirst blog post content.',
          body: '<h1>Blog Post 1</h1><p>First blog post content.</p>'
        },
        blogPost2: {
          path: '/blog/post-2/',
          markdown: '# Blog Post 2\n\nSecond blog post content.',
          body: '<h1>Blog Post 2</h1><p>Second blog post content.</p>'
        },
        contact: {
          path: '/contact/',
          markdown: '# Contact\n\nContact information.',
          body: '<h1>Contact</h1><p>Contact information.</p>'
        }
      };

      // Set page edits for all pages
      for (const page of Object.values(pages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }

      // Stage and commit initial version without template update
      const initialResult = await repo.stage('test.eth', false);
      expect(initialResult).toHaveProperty('cid');
      expect(initialResult.cid instanceof CID).toBe(true);

      // Verify all pages are staged correctly with version 0.4.0
      for (const page of Object.values(pages)) {
        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);

        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);

        // Verify version is 0.4.0 for all pages
        const doc = parser.parseFromString(html, 'text/html');
        checkMeta(doc, 'version', '0.4.0');
      }

      // Commit the initial version
      const hash1 = await walletClient.writeContract(initialResult.prepTx);
      expect(hash1).toBeDefined();
      const transaction1 = await client.waitForTransactionReceipt({ hash: hash1 });
      expect(transaction1.status).toBe('success');
      await repo.finalizeCommit(initialResult.cid);

      // Create a new Repo instance to simulate a fresh start
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Make a simple change to the root page
      const updatedRootMarkdown = '# Updated Home Page\n\nThis is the updated home page content.';
      const updatedRootBody = '<h1>Updated Home Page</h1><p>This is the updated home page content.</p>';
      
      await newRepo.setPageEdit('/', updatedRootMarkdown, updatedRootBody);

      // Stage and commit with template update (should update all pages to version 0.5.0)
      const updateResult = await newRepo.stage('test.eth', true);
      expect(updateResult).toHaveProperty('cid');
      expect(updateResult.cid instanceof CID).toBe(true);

      // Verify the root page is updated with new content
      const updatedRootMarkdownContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}/index.md`);
      expect(updatedRootMarkdownContent).toBe(updatedRootMarkdown);

      const updatedRootHtmlContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}/index.html`);
      expect(updatedRootHtmlContent).toContain(updatedRootBody);

      // Verify all other pages are updated to version 0.5.0 but keep their original content
      for (const [key, page] of Object.entries(pages)) {
        if (key === 'root') continue // ignore root as it has been changed

        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);

        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);

        // Verify all pages now use version 0.5.0
        const doc = parser.parseFromString(html, 'text/html');
        checkMeta(doc, 'version', '0.5.0');
      }

      // Verify template is updated to version 0.5.0
      const templateContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}/_template.html`);
      expect(templateContent).toBeDefined();
      const templateDoc = parser.parseFromString(templateContent, 'text/html');
      checkMeta(templateDoc, 'version', '0.5.0');

      // Verify _assets and _js folders are updated
      const assetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}/_assets`);
      expect(assetsContent).toBe('folder-updated');

      const jsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${updateResult.cid.toString()}/_js`);
      expect(jsContent).toBe('folder-updated');

      // Commit the final version
      const hash2 = await walletClient.writeContract(updateResult.prepTx);
      expect(hash2).toBeDefined();
      const transaction2 = await client.waitForTransactionReceipt({ hash: hash2 });
      expect(transaction2.status).toBe('success');

      // Verify the final state through ENS resolution
      const { cid: finalRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver);
      expect(finalRoot.toString()).toBe(updateResult.cid.toString());
      await newRepo.close()
    });

    it('should handle file deletion through staging and finalization', async () => {
      // Create repo and add some pages
      const pages = {
        root: {
          path: '/',
          markdown: '# Home Page\n\nWelcome to the home page.',
          body: '<h1>Home Page</h1><p>Welcome to the home page.</p>'
        },
        about: {
          path: '/about/',
          markdown: '# About\n\nAbout page content.',
          body: '<h1>About</h1><p>About page content.</p>'
        },
        contact: {
          path: '/contact/',
          markdown: '# Contact\n\nContact information.',
          body: '<h1>Contact</h1><p>Contact information.</p>'
        }
      };

      // Add all pages to the repo
      for (const page of Object.values(pages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }

      // Stage and commit the initial pages
      const initialResult = await repo.stage('test.eth', false);
      expect(initialResult).toHaveProperty('cid');
      expect(initialResult.cid instanceof CID).toBe(true);

      // Verify all pages are staged correctly
      for (const page of Object.values(pages)) {
        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);

        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);
      }

      // Commit the initial version
      const hash1 = await walletClient.writeContract(initialResult.prepTx);
      expect(hash1).toBeDefined();
      const transaction1 = await client.waitForTransactionReceipt({ hash: hash1 });
      expect(transaction1.status).toBe('success');
      await repo.finalizeCommit(initialResult.cid);

      // Delete a file (the contact page)
      await repo.deletePage('/contact/');

      // Verify the deletion is staged
      let changes = await repo.getChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].path).toBe('/contact/');

      // Stage (with update template) and commit the deletion
      const deleteResult = await repo.stage('test.eth', true);
      expect(deleteResult).toHaveProperty('cid');
      expect(deleteResult.cid instanceof CID).toBe(true);

      // Ensure the deleted file is not present in the new commit
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/contact/index.md`)).rejects.toThrow();
      await expect(cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/contact/index.html`)).rejects.toThrow();

      // Verify other pages still exist
      const rootMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/index.md`);
      expect(rootMarkdown).toBe(pages.root.markdown);

      const aboutMarkdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/about/index.md`);
      expect(aboutMarkdown).toBe(pages.about.markdown);

      // Verify template update occurred (version 0.5.0)
      const templateContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/_template.html`);
      expect(templateContent).toBeDefined();
      const templateDoc = parser.parseFromString(templateContent, 'text/html');
      checkMeta(templateDoc, 'version', '0.5.0');

      // Verify _assets and _js folders are updated
      const assetsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/_assets`);
      expect(assetsContent).toBe('folder-updated');

      const jsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${deleteResult.cid.toString()}/_js`);
      expect(jsContent).toBe('folder-updated');

      // Commit the final version
      const hash2 = await walletClient.writeContract(deleteResult.prepTx);
      expect(hash2).toBeDefined();
      const transaction2 = await client.waitForTransactionReceipt({ hash: hash2 });
      expect(transaction2.status).toBe('success');

      // Verify the final state through ENS resolution
      const { cid: finalRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver);
      expect(finalRoot.toString()).toBe(deleteResult.cid.toString());
    });
  });

  describe('Files Tests', () => {
    beforeAll(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString());
    });

    beforeEach(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });
    });

    afterEach(async () => {
      resetIDB()
      await repo.close()
    });

    // Helper function to verify file entry properties
    const verifyFileEntry = (file, basePath, expectedType = 'file') => {
      expect(file).toHaveProperty('name');
      expect(file).toHaveProperty('cid');
      expect(file).toHaveProperty('size');
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('type');
      expect(typeof file.name).toBe('string');
      expect(file.cid).toBeInstanceOf(CID);
      expect(typeof file.size).toBe('number');
      expect(typeof file.path).toBe('string');
      expect(file.path.split('/').filter(Boolean).length).toBe(basePath.split('/').filter(Boolean).length + 1);
      expect(file.type).toBe(expectedType);
      // Files should not have change property since they're committed
      expect(file).not.toHaveProperty('change');
    };

    // Helper function to verify directory contents and properties
    const verifyDirectory = async (repoInstance, path, expectedFiles) => {
      const files = await repoInstance.files.ls(path);
      for (const file of files) {
        expect(expectedFiles).toContain(file.name);
        const expectedType = file.name.split('.').length > 1 ? 'file' : 'directory';
        verifyFileEntry(file, path, expectedType);
      }
      return files;
    };

    it('should add files and stage+commit, should be stored by dservice', async () => {
      // Create files in multiple folders and subfolders
      const files = {
        '/images/logo.png': new TextEncoder().encode('fake-png-data'),
        '/images/icons/favicon.ico': new TextEncoder().encode('fake-ico-data'),
        '/images/icons/apple-touch-icon.png': new TextEncoder().encode('fake-apple-icon-data'),
        '/documents/resume.pdf': new TextEncoder().encode('fake-pdf-data'),
        '/documents/contracts/agreement.pdf': new TextEncoder().encode('fake-agreement-data'),
        '/documents/contracts/terms.pdf': new TextEncoder().encode('fake-terms-data'),
        '/assets/css/style.css': new TextEncoder().encode('body { color: red; }'),
        '/assets/js/app.js': new TextEncoder().encode('console.log("Hello World");'),
        '/assets/js/utils/helper.js': new TextEncoder().encode('function helper() { return true; }'),
        '/data/config.json': new TextEncoder().encode('{"setting": "value"}'),
        '/data/users/profiles.json': new TextEncoder().encode('{"users": []}'),
        '/backups/old-file.txt': new TextEncoder().encode('old content'),
        '/backups/archive/very-old-file.txt': new TextEncoder().encode('very old content')
      };

      // Add all files to the repo
      for (const [path, content] of Object.entries(files)) {
        await repo.files.add(path, content);
      }


      // Stage and commit the changes
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Verify all files are stored in kubo
      for (const [path, expectedContent] of Object.entries(files)) {
        const storedContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files${path}`);
        expect(storedContent).toBe(new TextDecoder().decode(expectedContent));
      }

      // Verify the file structure is correct in kubo
      const filesList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files`);
      expect(filesList).toContain('images');
      expect(filesList).toContain('documents');
      expect(filesList).toContain('assets');
      expect(filesList).toContain('data');
      expect(filesList).toContain('backups');

      // Check nested directories
      const imagesList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/images`);
      expect(imagesList).toContain('logo.png');
      expect(imagesList).toContain('icons');

      const iconsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/images/icons`);
      expect(iconsList).toContain('favicon.ico');
      expect(iconsList).toContain('apple-touch-icon.png');

      const documentsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/documents`);
      expect(documentsList).toContain('resume.pdf');
      expect(documentsList).toContain('contracts');

      const contractsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/documents/contracts`);
      expect(contractsList).toContain('agreement.pdf');
      expect(contractsList).toContain('terms.pdf');

      const assetsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/assets`);
      expect(assetsList).toContain('css');
      expect(assetsList).toContain('js');

      const jsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/assets/js`);
      expect(jsList).toContain('app.js');
      expect(jsList).toContain('utils');

      const utilsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/assets/js/utils`);
      expect(utilsList).toContain('helper.js');

      const dataList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/data`);
      expect(dataList).toContain('config.json');
      expect(dataList).toContain('users');

      const usersList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/data/users`);
      expect(usersList).toContain('profiles.json');

      const backupsList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/backups`);
      expect(backupsList).toContain('old-file.txt');
      expect(backupsList).toContain('archive');

      const archiveList = await ls(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/_files/backups/archive`);
      expect(archiveList).toContain('very-old-file.txt');
    });

    it('files should be retrieved from dservice when catting from new repo instances', async () => {
      // Create files in multiple folders and subfolders
      const files = {
        'images/logo.png': new TextEncoder().encode('fake-png-data'),
        'images/icons/favicon.ico': new TextEncoder().encode('fake-ico-data'),
        'images/icons/apple-touch-icon.png': new TextEncoder().encode('fake-apple-icon-data'),
        'documents/resume.pdf': new TextEncoder().encode('fake-pdf-data'),
        'documents/contracts/agreement.pdf': new TextEncoder().encode('fake-agreement-data'),
        'documents/contracts/terms.pdf': new TextEncoder().encode('fake-terms-data'),
        'assets/css/style.css': new TextEncoder().encode('body { color: red; }'),
        'assets/js/app.js': new TextEncoder().encode('console.log("Hello World");'),
        'assets/js/utils/helper.js': new TextEncoder().encode('function helper() { return true; }'),
        'data/config.json': new TextEncoder().encode('{"setting": "value"}'),
        'data/users/profiles.json': new TextEncoder().encode('{"users": []}'),
        'backups/old-file.txt': new TextEncoder().encode('old content'),
        'backups/archive/very-old-file.txt': new TextEncoder().encode('very old content')
      };

      // Add all files to the repo
      for (const [path, content] of Object.entries(files)) {
        await repo.files.add(path, content);
      }

      // Stage and commit the changes
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Commit the changes
      const hash = await walletClient.writeContract(result.prepTx);
      expect(hash).toBeDefined();
      const transaction = await client.waitForTransactionReceipt({ hash });
      expect(transaction.status).toBe('success');
      await repo.finalizeCommit(result.cid);

      // Create a new Repo instance with fresh storage
      resetIDB()
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Spy on the dservice logger to track file requests
      const loggerSpy = jest.spyOn(testEnv.dservice.logger, 'info');
      let fileEndpointCallCount = 0

      // Intercept logger calls to track file requests
      const originalInfo = testEnv.dservice.logger.info;
      testEnv.dservice.logger.info = function(msg, { url, method } = {}) {
        // Track requests to the /file endpoint
        if (msg === 'Incoming request' && url && url.includes('/file')) {
          fileEndpointCallCount++;
        }
      };

      // Verify all files can be read via repo.files.cat
      for (const [path, expectedContent] of Object.entries(files)) {
        const fileContent = await newRepo.files.cat(path);
        expect(fileContent).toEqual(expectedContent);
      }

      // Verify that dservice received file requests for each file
      expect(fileEndpointCallCount).toBe(Object.keys(files).length);

      // Restore the original logger
      testEnv.dservice.logger.info = originalInfo;
      loggerSpy.mockRestore();
      await newRepo.close()
    });

    it('files should be ls-able across repo instances', async () => {
      // Create files in multiple folders and subfolders
      const files = {
        'images/logo.png': new TextEncoder().encode('fake-png-data'),
        'images/icons/favicon.ico': new TextEncoder().encode('fake-ico-data'),
        'images/icons/apple-touch-icon.png': new TextEncoder().encode('fake-apple-icon-data'),
        'documents/resume.pdf': new TextEncoder().encode('fake-pdf-data'),
        'documents/contracts/agreement.pdf': new TextEncoder().encode('fake-agreement-data'),
        'documents/contracts/terms.pdf': new TextEncoder().encode('fake-terms-data'),
        'assets/css/style.css': new TextEncoder().encode('body { color: red; }'),
        'assets/js/app.js': new TextEncoder().encode('console.log("Hello World");'),
        'assets/js/utils/helper.js': new TextEncoder().encode('function helper() { return true; }'),
        'data/config.json': new TextEncoder().encode('{"setting": "value"}'),
        'data/users/profiles.json': new TextEncoder().encode('{"users": []}'),
        'backups/old-file.txt': new TextEncoder().encode('old content'),
        'backups/archive/very-old-file.txt': new TextEncoder().encode('very old content')
      };

      // Add all files to the repo
      for (const [path, content] of Object.entries(files)) {
        await repo.files.add(path, content);
      }

      // Stage and commit the changes
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Commit the changes
      const hash = await walletClient.writeContract(result.prepTx);
      expect(hash).toBeDefined();
      const transaction = await client.waitForTransactionReceipt({ hash });
      expect(transaction.status).toBe('success');
      await repo.finalizeCommit(result.cid);

      // Create a new Repo instance with fresh storage
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Verify the file structure using ls and check all properties
      await verifyDirectory(newRepo, '/', ['images', 'documents', 'assets', 'data', 'backups']);
      await verifyDirectory(newRepo, '/images', ['logo.png', 'icons']);
      await verifyDirectory(newRepo, '/images/icons', ['favicon.ico', 'apple-touch-icon.png']);
      await verifyDirectory(newRepo, '/documents', ['resume.pdf', 'contracts']);
      await verifyDirectory(newRepo, '/documents/contracts', ['agreement.pdf', 'terms.pdf']);
      await verifyDirectory(newRepo, '/assets', ['css', 'js']);
      await verifyDirectory(newRepo, '/assets/js', ['app.js', 'utils']);
      await verifyDirectory(newRepo, '/assets/js/utils', ['helper.js']);
      await verifyDirectory(newRepo, '/data', ['config.json', 'users']);
      await verifyDirectory(newRepo, '/data/users', ['profiles.json']);
      await verifyDirectory(newRepo, '/backups', ['old-file.txt', 'archive']);
      await verifyDirectory(newRepo, '/backups/archive', ['very-old-file.txt']);

      await newRepo.close()
    });

    it('should handle file updates and deletions across multiple folders', async () => {
      // Create initial files
      const initialFiles = {
        '/images/logo.png': new TextEncoder().encode('original-logo-data'),
        '/documents/resume.pdf': new TextEncoder().encode('original-resume-data'),
        '/assets/css/style.css': new TextEncoder().encode('original-css-data'),
        '/data/config.json': new TextEncoder().encode('{"original": "value"}')
      };

      // Add initial files
      for (const [path, content] of Object.entries(initialFiles)) {
        await repo.files.add(path, content);
      }

      // Stage and commit initial files
      const initialResult = await repo.stage('test.eth', false);
      const initialHash = await walletClient.writeContract(initialResult.prepTx);
      await client.waitForTransactionReceipt({ hash: initialHash });
      await repo.finalizeCommit(initialResult.cid);

      // Update some files and add new ones
      const updatedFiles = {
        '/images/logo.png': new TextEncoder().encode('updated-logo-data'),
        '/assets/css/style.css': new TextEncoder().encode('updated-css-data'),
        '/images/icons/new-icon.png': new TextEncoder().encode('new-icon-data'),
        '/documents/contracts/new-agreement.pdf': new TextEncoder().encode('new-agreement-data')
      };

      // Add updated and new files
      for (const [path, content] of Object.entries(updatedFiles)) {
        await repo.files.add(path, content);
      }

      // Delete a file
      await repo.files.rm('data/config.json');

      // Stage and commit changes
      const updateResult = await repo.stage('test.eth', false);
      const updateHash = await walletClient.writeContract(updateResult.prepTx);
      await client.waitForTransactionReceipt({ hash: updateHash });
      await repo.finalizeCommit(updateResult.cid);

      // Create new repo instance and verify changes
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Verify updated files
      const updatedLogoContent = await newRepo.files.cat('/images/logo.png');
      expect(updatedLogoContent).toEqual(updatedFiles['/images/logo.png']);

      const updatedCssContent = await newRepo.files.cat('/assets/css/style.css');
      expect(updatedCssContent).toEqual(updatedFiles['/assets/css/style.css']);

      // Verify new files
      const newIconContent = await newRepo.files.cat('/images/icons/new-icon.png');
      expect(newIconContent).toEqual(updatedFiles['/images/icons/new-icon.png']);

      const newAgreementContent = await newRepo.files.cat('/documents/contracts/new-agreement.pdf');
      expect(newAgreementContent).toEqual(updatedFiles['/documents/contracts/new-agreement.pdf']);

      // Verify unchanged files
      const unchangedResumeContent = await newRepo.files.cat('/documents/resume.pdf');
      expect(unchangedResumeContent).toEqual(initialFiles['/documents/resume.pdf']);

      // Verify deleted file is not accessible
      await expect(newRepo.files.cat('/data/config.json')).rejects.toThrow();

      // Verify file structure using ls and check all properties
      await verifyDirectory(newRepo, '/', ['images', 'documents', 'assets', 'data']);
      await verifyDirectory(newRepo, '/data', []);
      await verifyDirectory(newRepo, '/images', ['logo.png', 'icons']);
      await verifyDirectory(newRepo, '/images/icons', ['new-icon.png']);
      await verifyDirectory(newRepo, '/documents', ['resume.pdf', 'contracts']);
      await verifyDirectory(newRepo, '/documents/contracts', ['new-agreement.pdf']);
      await verifyDirectory(newRepo, '/assets', ['css']);
      await verifyDirectory(newRepo, '/assets/css', ['style.css']);

      // Verify data directory is empty (config.json was deleted)
      const dataFiles = await newRepo.files.ls('/data');
      expect(dataFiles.length).toBe(0);

      await newRepo.close()
    });

    it('should handle realistic scenario with files and pages across multiple updates', async () => {
      // === FIRST UPDATE: Create initial website with files and pages ===
      
      // Create initial pages
      const initialPages = {
        home: {
          path: '/',
          markdown: `---
title: My Portfolio
description: Welcome to my personal portfolio website
---

# Welcome to My Portfolio

This is my personal website showcasing my work and skills.`,
          body: '<h1>Welcome to My Portfolio</h1><p>This is my personal website showcasing my work and skills.</p>'
        },
        about: {
          path: '/about/',
          markdown: `# About Me

I'm a passionate developer with expertise in web technologies.`,
          body: '<h1>About Me</h1><p>I\'m a passionate developer with expertise in web technologies.</p>'
        },
        projects: {
          path: '/projects/',
          markdown: `# My Projects

Here are some of my recent projects.`,
          body: '<h1>My Projects</h1><p>Here are some of my recent projects.</p>'
        }
      };

      // Create initial files
      const initialFiles = {
        '/images/logo.png': new TextEncoder().encode('original-logo-data'),
        '/images/profile.jpg': new TextEncoder().encode('profile-photo-data'),
        '/assets/css/main.css': new TextEncoder().encode('body { font-family: Arial; }'),
        '/assets/js/app.js': new TextEncoder().encode('console.log("App loaded");'),
        '/documents/resume.pdf': new TextEncoder().encode('resume-content'),
        '/data/site-config.json': new TextEncoder().encode('{"theme": "light", "analytics": false}')
      };

      // Add initial pages and files
      for (const page of Object.values(initialPages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }
      for (const [path, content] of Object.entries(initialFiles)) {
        await repo.files.add(path, content);
      }

      // Stage and commit first version
      const firstResult = await repo.stage('test.eth', false);
      const firstHash = await walletClient.writeContract(firstResult.prepTx);
      await client.waitForTransactionReceipt({ hash: firstHash });
      await repo.finalizeCommit(firstResult.cid);

      // Verify first version content
      for (const page of Object.values(initialPages)) {
        const markdown = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}${page.path}index.md`);
        expect(markdown).toBe(page.markdown);
      }
      for (const [path, expectedContent] of Object.entries(initialFiles)) {
        const storedContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${firstResult.cid.toString()}/_files${path}`);
        expect(storedContent).toBe(new TextDecoder().decode(expectedContent));
      }

      // === SECOND UPDATE: Modify content, add new pages/files, delete some ===
      
      // Update existing pages
      const updatedPages = {
        home: {
          path: '/',
          markdown: `---
title: My Updated Portfolio
description: Welcome to my updated personal portfolio website
---

# Welcome to My Updated Portfolio

This is my updated personal website with new features and content.`,
          body: '<h1>Welcome to My Updated Portfolio</h1><p>This is my updated personal website with new features and content.</p>'
        },
        about: {
          path: '/about/',
          markdown: `# About Me

I'm a passionate developer with expertise in web technologies and blockchain development.`,
          body: '<h1>About Me</h1><p>I\'m a passionate developer with expertise in web technologies and blockchain development.</p>'
        }
      };

      // Add new pages
      const newPages = {
        contact: {
          path: '/contact/',
          markdown: `# Contact Me

Get in touch with me for collaborations and opportunities.`,
          body: '<h1>Contact Me</h1><p>Get in touch with me for collaborations and opportunities.</p>'
        },
        blog: {
          path: '/blog/',
          markdown: `# Blog

Thoughts and insights about technology and development.`,
          body: '<h1>Blog</h1><p>Thoughts and insights about technology and development.</p>'
        }
      };

      // Update existing files
      const updatedFiles = {
        '/images/logo.png': new TextEncoder().encode('updated-logo-data'),
        '/assets/css/main.css': new TextEncoder().encode('body { font-family: Arial; color: #333; }'),
        '/assets/js/app.js': new TextEncoder().encode('console.log("Updated app loaded"); initAnalytics();')
      };

      // Add new files
      const newFiles = {
        '/images/icons/favicon.ico': new TextEncoder().encode('favicon-data'),
        '/images/icons/apple-touch-icon.png': new TextEncoder().encode('apple-icon-data'),
        '/assets/css/dark-theme.css': new TextEncoder().encode('body { background: #222; color: #fff; }'),
        '/assets/js/analytics.js': new TextEncoder().encode('function initAnalytics() { console.log("Analytics initialized"); }'),
        '/documents/portfolio.pdf': new TextEncoder().encode('portfolio-content'),
        '/data/analytics-config.json': new TextEncoder().encode('{"enabled": true, "provider": "google"}')
      };

      // Delete some files
      const filesToDelete = ['/data/site-config.json'];

      // Apply all changes
      for (const page of Object.values(updatedPages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }
      for (const page of Object.values(newPages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }
      for (const [path, content] of Object.entries(updatedFiles)) {
        await repo.files.add(path, content);
      }
      for (const [path, content] of Object.entries(newFiles)) {
        await repo.files.add(path, content);
      }
      for (const filePath of filesToDelete) {
        await repo.files.rm(filePath);
      }

      // Delete a page
      await repo.deletePage('/projects/');

      // Stage and commit second version
      const secondResult = await repo.stage('test.eth', false);
      const secondHash = await walletClient.writeContract(secondResult.prepTx);
      await client.waitForTransactionReceipt({ hash: secondHash });
      await repo.finalizeCommit(secondResult.cid);

      // === FINAL VERIFICATION: Create new repo instance and verify everything ===
      
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Verify all pages exist and have correct content
      const allPages = await newRepo.getAllPages();
      expect(allPages).toContain('/');
      expect(allPages).toContain('/about/');
      expect(allPages).toContain('/contact/');
      expect(allPages).toContain('/blog/');
      expect(allPages).not.toContain('/projects/'); // Should be deleted

      // Verify updated pages
      const homeMarkdown = await newRepo.getMarkdown('/');
      expect(homeMarkdown).toBe(updatedPages.home.markdown);
      expect(homeMarkdown).toContain('Updated Portfolio');

      const aboutMarkdown = await newRepo.getMarkdown('/about/');
      expect(aboutMarkdown).toBe(updatedPages.about.markdown);
      expect(aboutMarkdown).toContain('blockchain development');

      // Verify new pages
      const contactMarkdown = await newRepo.getMarkdown('/contact/');
      expect(contactMarkdown).toBe(newPages.contact.markdown);

      const blogMarkdown = await newRepo.getMarkdown('/blog/');
      expect(blogMarkdown).toBe(newPages.blog.markdown);

      // Verify deleted page is not accessible
      await expect(newRepo.getMarkdown('/projects/')).rejects.toThrow();

      // Verify updated files
      const updatedLogoContent = await newRepo.files.cat('/images/logo.png');
      expect(updatedLogoContent).toEqual(updatedFiles['/images/logo.png']);

      const updatedCssContent = await newRepo.files.cat('/assets/css/main.css');
      expect(updatedCssContent).toEqual(updatedFiles['/assets/css/main.css']);

      const updatedJsContent = await newRepo.files.cat('/assets/js/app.js');
      expect(updatedJsContent).toEqual(updatedFiles['/assets/js/app.js']);

      // Verify new files
      const faviconContent = await newRepo.files.cat('/images/icons/favicon.ico');
      expect(faviconContent).toEqual(newFiles['/images/icons/favicon.ico']);

      const darkThemeContent = await newRepo.files.cat('/assets/css/dark-theme.css');
      expect(darkThemeContent).toEqual(newFiles['/assets/css/dark-theme.css']);

      const analyticsContent = await newRepo.files.cat('/assets/js/analytics.js');
      expect(analyticsContent).toEqual(newFiles['/assets/js/analytics.js']);

      const portfolioContent = await newRepo.files.cat('/documents/portfolio.pdf');
      expect(portfolioContent).toEqual(newFiles['/documents/portfolio.pdf']);

      const analyticsConfigContent = await newRepo.files.cat('/data/analytics-config.json');
      expect(analyticsConfigContent).toEqual(newFiles['/data/analytics-config.json']);

      // Verify unchanged files (from first version)
      const profileContent = await newRepo.files.cat('/images/profile.jpg');
      expect(profileContent).toEqual(initialFiles['/images/profile.jpg']);

      const resumeContent = await newRepo.files.cat('/documents/resume.pdf');
      expect(resumeContent).toEqual(initialFiles['/documents/resume.pdf']);

      // Verify deleted files are not accessible
      await expect(newRepo.files.cat('/data/site-config.json')).rejects.toThrow();

      // Verify file structure using ls and check all properties
      await verifyDirectory(newRepo, '/', ['images', 'assets', 'documents', 'data']);
      await verifyDirectory(newRepo, '/images', ['logo.png', 'profile.jpg', 'icons']);
      await verifyDirectory(newRepo, '/images/icons', ['favicon.ico', 'apple-touch-icon.png']);
      await verifyDirectory(newRepo, '/assets', ['css', 'js']);
      await verifyDirectory(newRepo, '/assets/css', ['main.css', 'dark-theme.css']);
      await verifyDirectory(newRepo, '/assets/js', ['app.js', 'analytics.js']);
      await verifyDirectory(newRepo, '/documents', ['resume.pdf', 'portfolio.pdf']);
      await verifyDirectory(newRepo, '/data', ['analytics-config.json']);

      // Verify the final state through ENS resolution
      const { cid: finalRoot } = await resolveEnsDomain(client, 'test.eth', addresses.universalResolver);
      expect(finalRoot.toString()).toBe(secondResult.cid.toString());

      await newRepo.close()
    });

    it('should handle non-cached files', async () => {
      // Create some files and folders
      const files = {
        '/images/logo.png': new TextEncoder().encode('fake-png-data'),
        '/documents/resume.pdf': new TextEncoder().encode('fake-pdf-data'),
        '/assets/css/style.css': new TextEncoder().encode('body { color: red; }'),
        '/data/config.json': new TextEncoder().encode('{"setting": "value"}'),
        '/backups/old-file.txt': new TextEncoder().encode('old content')
      };

      // Add all files to the repo
      for (const [path, content] of Object.entries(files)) {
        await repo.files.add(path, content);
      }

      // Stage and finalize the changes
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Commit the changes
      const hash = await walletClient.writeContract(result.prepTx);
      expect(hash).toBeDefined();
      const transaction = await client.waitForTransactionReceipt({ hash });
      expect(transaction.status).toBe('success');
      await repo.finalizeCommit(result.cid);

      // Create new files instance with new unixfs and blockstore
      resetIDB();
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Stage again without changes
      const secondResult = await newRepo.stage('test.eth', true);
      expect(secondResult).toHaveProperty('cid');
      expect(secondResult.cid instanceof CID).toBe(true);

      await newRepo.close();
    });

    it('should set avatar and update favicon for all pages after staging', async () => {
      // Create initial pages
      const pages = {
        root: {
          path: '/',
          markdown: '# Home Page\n\nWelcome to the home page.',
          body: '<h1>Home Page</h1><p>Welcome to the home page.</p>'
        },
        about: {
          path: '/about/',
          markdown: '# About\n\nAbout page content.',
          body: '<h1>About</h1><p>About page content.</p>'
        },
        blog: {
          path: '/blog/',
          markdown: '# Blog\n\nBlog index page.',
          body: '<h1>Blog</h1><p>Blog index page.</p>'
        },
        contact: {
          path: '/contact/',
          markdown: '# Contact\n\nContact information.',
          body: '<h1>Contact</h1><p>Contact information.</p>'
        }
      };

      // Add all pages to the repo
      for (const page of Object.values(pages)) {
        await repo.setPageEdit(page.path, page.markdown, page.body);
      }

      // Stage and commit the initial pages
      const initialResult = await repo.stage('test.eth', false);
      expect(initialResult).toHaveProperty('cid');
      expect(initialResult.cid instanceof CID).toBe(true);

      // Verify all pages are staged correctly with default favicon
      for (const page of Object.values(pages)) {
        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${initialResult.cid.toString()}${page.path}index.html`);
        expect(html).toContain(page.body);
        
        // Check that default favicon is set
        const doc = parser.parseFromString(html, 'text/html');
        const favicon = doc.querySelector('link[rel="icon"]');
        expect(favicon).toBeDefined();
        expect(favicon.href).toBe('/_assets/images/favicon.ico');
      }

      // Commit the initial version
      await repo.finalizeCommit(initialResult.cid);

      // Set an avatar
      const avatarContent = new TextEncoder().encode('fake-avatar-png-data');
      await repo.files.setAvatar(avatarContent, 'png');

      // Make a small edit to one page to trigger staging
      await repo.setPageEdit('/', '# Updated Home Page\n\nWelcome to the updated home page.', '<h1>Updated Home Page</h1><p>Welcome to the updated home page.</p>');

      // Stage the changes (including avatar)
      const avatarResult = await repo.stage('test.eth', false);
      expect(avatarResult).toHaveProperty('cid');
      expect(avatarResult.cid instanceof CID).toBe(true);

      // Verify avatar file is stored in the _files directory
      const storedAvatarContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${avatarResult.cid.toString()}/_files/.avatar.png`);
      expect(storedAvatarContent).toBe('fake-avatar-png-data');

      // Verify that ALL pages now have the avatar as favicon, Open Graph image, and Twitter image
      for (const page of Object.values(pages)) {
        const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${avatarResult.cid.toString()}${page.path}index.html`);
        
        // Parse HTML and check favicon
        const doc = parser.parseFromString(html, 'text/html');
        const favicon = doc.querySelector('link[rel="icon"]');
        expect(favicon).toBeDefined();
        
        // The favicon should now point to the avatar
        expect(favicon.href).toBe('/_files/.avatar.png');
        
        // Check Open Graph image meta tag
        const ogImage = doc.querySelector('meta[property="og:image"]');
        expect(ogImage).toBeDefined();
        expect(ogImage.content).toBe(`https://test.eth.link/_files/.avatar.png`);
        
        // Check Twitter image meta tag
        const twitterImage = doc.querySelector('meta[name="twitter:image"]');
        expect(twitterImage).toBeDefined();
        expect(twitterImage.content).toBe(`https://test.eth.link/_files/.avatar.png`);
        
        // Check Twitter card type (should be 'summary' when using avatar)
        const twitterCard = doc.querySelector('meta[name="twitter:card"]');
        expect(twitterCard).toBeDefined();
        expect(twitterCard.content).toBe('summary');
        
        // Verify page content is still correct
        if (page.path === '/') {
          // Root page should have updated content
          expect(html).toContain('Updated Home Page');
        } else {
          // Other pages should have original content
          expect(html).toContain(page.body);
        }
      }
    });

    it('should use first img tag in page content for social media previews', async () => {
      // Create a page with an image
      const pageWithImage = {
        path: '/',
        markdown: '# Page with Image\n\nThis page has an image.',
        body: '<h1>Page with Image</h1><p>This page has an image.</p><img src="/images/hero.jpg" alt="Hero image" /><p>More content here.</p>'
      };

      // Add the page to the repo
      await repo.setPageEdit(pageWithImage.path, pageWithImage.markdown, pageWithImage.body);

      // Stage and commit the page
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Verify the page HTML contains the image
      const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}${pageWithImage.path}index.html`);

      // Parse HTML and check social media meta tags
      const doc = parser.parseFromString(html, 'text/html');
      
      const imgTag = doc.querySelector('img');
      expect(imgTag).toBeDefined();
      expect(imgTag.src).toBe('/images/hero.jpg');
      expect(imgTag.alt).toBe('Hero image');

      // Check Open Graph image meta tag - should use the first img tag
      const ogImage = doc.querySelector('meta[property="og:image"]');
      expect(ogImage).toBeDefined();
      expect(ogImage.content).toBe('https://test.eth.link/images/hero.jpg');
      
      // Check Twitter image meta tag - should use the first img tag
      const twitterImage = doc.querySelector('meta[name="twitter:image"]');
      expect(twitterImage).toBeDefined();
      expect(twitterImage.content).toBe('https://test.eth.link/images/hero.jpg');
      
      // Check Twitter card type - should be 'summary_large_image' when using page image
      const twitterCard = doc.querySelector('meta[name="twitter:card"]');
      expect(twitterCard).toBeDefined();
      expect(twitterCard.content).toBe('summary_large_image');
      
      // Check that favicon still uses default (no avatar set)
      const favicon = doc.querySelector('link[rel="icon"]');
      expect(favicon).toBeDefined();
      expect(favicon.href).toBe('/_assets/images/favicon.ico');
    });

    it('should prioritize page images over avatar for social media previews', async () => {
      // First set an avatar
      const avatarContent = new TextEncoder().encode('fake-avatar-png-data');
      await repo.files.setAvatar(avatarContent, 'png');

      // Create a page with an image
      const pageWithImage = {
        path: '/',
        markdown: '# Page with Image\n\nThis page has an image.',
        body: '<h1>Page with Image</h1><p>This page has an image.</p><img src="/images/hero.jpg" alt="Hero image" /><p>More content here.</p>'
      };

      // Add the page to the repo
      await repo.setPageEdit(pageWithImage.path, pageWithImage.markdown, pageWithImage.body);

      // Stage and commit the page
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Verify the page HTML contains the image
      const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}${pageWithImage.path}index.html`);

      // Parse HTML and check social media meta tags
      const doc = parser.parseFromString(html, 'text/html');

      const imgTag = doc.querySelector('img');
      expect(imgTag).toBeDefined();
      expect(imgTag.src).toBe('/images/hero.jpg');
      expect(imgTag.alt).toBe('Hero image');
      
      // Check Open Graph image meta tag - should use the page image, not avatar
      const ogImage = doc.querySelector('meta[property="og:image"]');
      expect(ogImage).toBeDefined();
      expect(ogImage.content).toBe('https://test.eth.link/images/hero.jpg');
      
      // Check Twitter image meta tag - should use the page image, not avatar
      const twitterImage = doc.querySelector('meta[name="twitter:image"]');
      expect(twitterImage).toBeDefined();
      expect(twitterImage.content).toBe('https://test.eth.link/images/hero.jpg');
      
      // Check Twitter card type - should be 'summary_large_image' when using page image
      const twitterCard = doc.querySelector('meta[name="twitter:card"]');
      expect(twitterCard).toBeDefined();
      expect(twitterCard.content).toBe('summary_large_image');
      
      // Check that favicon still uses avatar (since avatar was set)
      const favicon = doc.querySelector('link[rel="icon"]');
      expect(favicon).toBeDefined();
      expect(favicon.href).toBe('/_files/.avatar.png');
    });

    it('should handle case with no avatar and no images in page content', async () => {
      // Create a page without any images and no avatar set
      const pageWithoutImage = {
        path: '/',
        markdown: '# Page without Image\n\nThis page has no images.',
        body: '<h1>Page without Image</h1><p>This page has no images.</p><p>Just text content here.</p>'
      };

      // Add the page to the repo
      await repo.setPageEdit(pageWithoutImage.path, pageWithoutImage.markdown, pageWithoutImage.body);

      // Stage and commit the page
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Verify the page HTML contains the content but no images
      const html = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}${pageWithoutImage.path}index.html`);
      expect(html).toContain(pageWithoutImage.body);
      expect(html).not.toContain('<img');

      // Parse HTML and check social media meta tags
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check Open Graph image meta tag - should be null when no avatar and no images
      const ogImage = doc.querySelector('meta[property="og:image"]');
      expect(ogImage).toBeDefined();
      expect(ogImage.content).toBe('https://test.eth.link/_assets/images/favicon.ico');
      
      // Check Twitter image meta tag - should be null when no avatar and no images
      const twitterImage = doc.querySelector('meta[name="twitter:image"]');
      expect(twitterImage).toBeDefined();
      expect(twitterImage.content).toBe('https://test.eth.link/_assets/images/favicon.ico');
      
      // Check Twitter card type - should be 'summary' when no images
      const twitterCard = doc.querySelector('meta[name="twitter:card"]');
      expect(twitterCard).toBeDefined();
      expect(twitterCard.content).toBe('summary');
      
      // Check that favicon uses default
      const favicon = doc.querySelector('link[rel="icon"]');
      expect(favicon).toBeDefined();
      expect(favicon.href).toBe('/_assets/images/favicon.ico');
    });
  });

  describe('Settings Tests', () => {
    beforeAll(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'new.simplepage.eth', templateCid.toString());
    });

    beforeEach(async () => {
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });
    });

    afterEach(async () => {
      resetIDB()
      await repo.close()
    });

    it('should handle complete settings integration flow', async () => {
      // 1. Read/write some settings
      const initialSettings = {
        theme: 'dark',
        language: 'en',
        notifications: true,
        analytics: {
          enabled: true,
          provider: 'google'
        }
      };

      await repo.settings.write(initialSettings);
      
      // Verify settings are written
      const readSettings = await repo.settings.read();
      expect(readSettings).toEqual(initialSettings);
      
      // Read individual properties
      const theme = await repo.settings.readProperty('theme');
      expect(theme).toBe('dark');
      
      // Read nested properties from the full settings object
      const allSettings = await repo.settings.read();
      expect(allSettings.analytics.enabled).toBe(true);

      // 2. Stage and commit
      const result = await repo.stage('test.eth', false);
      expect(result).toHaveProperty('cid');
      expect(result.cid instanceof CID).toBe(true);

      // Verify settings are staged
      const settingsContent = await cat(testEnv.kubo.kuboApi, `/ipfs/${result.cid.toString()}/settings.json`);
      expect(settingsContent).toBeDefined();
      
      const parsedSettings = JSON.parse(settingsContent);
      expect(parsedSettings.theme).toBe('dark');
      expect(parsedSettings.analytics.enabled).toBe(true);

      // Commit the changes
      const hash = await walletClient.writeContract(result.prepTx);
      expect(hash).toBeDefined();
      const transaction = await client.waitForTransactionReceipt({ hash });
      expect(transaction.status).toBe('success');
      await repo.finalizeCommit(result.cid);

      // 3. Load new repo instance
      const newStorage = new MockStorage();
      const newRepo = new Repo('test.eth', newStorage);
      await newRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // 4. Read settings from new instance
      const loadedSettings = await newRepo.settings.read();
      expect(loadedSettings).toEqual(initialSettings);
      
      const loadedTheme = await newRepo.settings.readProperty('theme');
      expect(loadedTheme).toBe('dark');

      // 5. Write new settings
      await newRepo.settings.writeProperty('theme', 'light');
      await newRepo.settings.writeProperty('custom', 'new-value');
      
      // Verify changes are detected
      expect(await newRepo.settings.hasChanges()).toBe(true);
      
      // Verify new values
      const updatedTheme = await newRepo.settings.readProperty('theme');
      const customValue = await newRepo.settings.readProperty('custom');
      expect(updatedTheme).toBe('light');
      expect(customValue).toBe('new-value');

      await newRepo.close();
    });
  })

  describe('Error Handling Tests', () => {
    it('should handle initialization errors gracefully', async () => {
      const invalidRepo = new Repo('invalid.eth', storage, {
        apiEndpoint: testEnv.dserviceUrl
      });
      
      await expect(invalidRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      })).rejects.toThrow();

      await invalidRepo.close()
    });

    it('should handle staging without initialization', async () => {
      const uninitializedRepo = new Repo('test.eth', storage, {
        apiEndpoint: testEnv.dserviceUrl
      });
      
      await expect(uninitializedRepo.stage('test.eth', false)).rejects.toThrow();

      await uninitializedRepo.close()
    });

    it('should throw error when staging with update=true and missing template', async () => {
      // Set up test domain with content
      testEnv.evm.setContenthash(addresses.resolver1, 'test.eth', testDataCid.toString());
      
      // Clear template domain contenthash
      testEnv.evm.clearContenthash(addresses.resolver1, 'new.simplepage.eth');
      
      const repo = new Repo('test.eth', storage, {
        apiEndpoint: testEnv.dserviceUrl
      });

      // Initialize repo (should succeed since test.eth has content)
      await repo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      });

      // Make an edit so we can stage
      await repo.setPageEdit('/', '# Test', '<h1>Test</h1>');

      // Attempt to stage with update=true should fail
      await expect(repo.stage('test.eth', true)).rejects.toThrow('Template root not found');

      await repo.close()
    });
  });
}); 