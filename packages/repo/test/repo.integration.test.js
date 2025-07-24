import { jest } from '@jest/globals'
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


// Mock DOMParser for Node.js environment
const dom = new JSDOM()
global.DOMParser = dom.window.DOMParser


const checkMeta = (doc, name, content) => {
  const meta = doc.querySelector(`meta[name="${name}"]`)
  expect(meta).toBeDefined()
  expect(meta.content).toBe(content)
}

// Mock storage for testing
class MockStorage {
  constructor() {
    this.store = new Map();
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
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle initialization errors gracefully', async () => {
      const invalidRepo = new Repo('invalid.eth', storage, {
        apiEndpoint: testEnv.dserviceUrl
      });
      
      await expect(invalidRepo.init(client, {
        chainId: parseInt(testEnv.evm.chainId),
        universalResolver: addresses.universalResolver
      })).rejects.toThrow();
    });

    it('should handle staging without initialization', async () => {
      const uninitializedRepo = new Repo('test.eth', storage, {
        apiEndpoint: testEnv.dserviceUrl
      });
      
      await expect(uninitializedRepo.stage('test.eth', false)).rejects.toThrow();
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
    });
  });
}); 