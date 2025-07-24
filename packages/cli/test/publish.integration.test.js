import { jest } from '@jest/globals';
import { TestEnvironmentDservice } from '@simplepg/test-utils';
import { runCliCommand } from './runCliCommand.js';
import all from 'it-all'
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { concat } from 'uint8arrays/concat'

jest.setTimeout(60000); // Increased timeout for IPFS and dservice startup

async function cat(kubo, cid, path) {
  const chunks = await all(kubo.cat(cid + (path ? '/' + path : '')))
  return new TextDecoder().decode(concat(chunks));
}

describe('simplepage publish CLI', () => {
  let testEnv;
  let addresses;
  let flags;
  let tempDir;

  beforeAll(async () => {
    testEnv = new TestEnvironmentDservice();
    await testEnv.start();
    addresses = testEnv.addresses
    
    // Set up the resolver for new.simplepage.eth
    testEnv.evm.setResolver(addresses.universalResolver, 'new.simplepage.eth', addresses.resolver1);
    // Set up the dservice text record on new.simplepage.eth
    testEnv.evm.setTextRecord(addresses.resolver1, 'new.simplepage.eth', 'dservice', testEnv.dserviceUrl);
    
    flags = [
      '--rpc', testEnv.evm.url,
      '--universal-resolver', addresses.universalResolver,
      '--simplepage', addresses.simplepage
    ];
  });

  afterAll(async () => {
    // Stop dservice
    await testEnv.stop();
  });

  beforeEach(async () => {
    // Create temporary directory with test content
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'simplepage-test-' + Math.random().toString(36).substring(2, 15)));
  });

  afterEach(async () => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('publishes content from a temporary folder successfully', async () => {
    const ensName = 'test-publish.eth';
    const futureTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    
    // set up simplepage subscription
    testEnv.evm.updateUnits(ensName, futureTime, 0, userAddress);
    
    // Create a simple HTML file
    const htmlContent = '<!DOCTYPE html><html><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>'
    fs.writeFileSync(path.join(tempDir, 'index.html'), htmlContent);
    
    // Create a simple CSS file
    const cssContent = 'body { font-family: Arial, sans-serif; }'
    fs.writeFileSync(path.join(tempDir, 'style.css'), cssContent);

    const output = await runCliCommand([
      'publish',
      ensName,
      tempDir,
      ...flags,
    ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Successfully published content for test-publish\.eth!/);
    expect(output.stdout).toMatch(/Preview: https:\/\/.*\.ipfs\.inbrowser\.link/);
    expect(output.stdout).toMatch(/Explore: https:\/\/explore\.ipld\.io\/#\/explore\//);
    expect(output.stdout).toMatch(/ipfs:\/\//);

    // Extract CID from output
    const cidMatch = output.stdout.match(/Preview: https:\/\/(\w+)\.ipfs\.inbrowser\.link/);
    expect(cidMatch).not.toBeNull();
    const publishedCid = cidMatch[1];

    const remoteIndex = await cat(testEnv.kuboApi, publishedCid, 'index.html')
    const remoteStyle = await cat(testEnv.kuboApi, publishedCid, 'style.css')

    expect(remoteIndex).toBe(htmlContent)
    expect(remoteStyle).toBe(cssContent)
  });

  it('publishes a single index.html file successfully', async () => {
    const ensName = 'single-file.eth';
    const futureTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    
    // set up simplepage subscription
    testEnv.evm.updateUnits(ensName, futureTime, 0, userAddress);
    
    // Create only a single HTML file (no folder structure)
    const htmlContent = '<!DOCTYPE html><html><head><title>Single File Test</title></head><body><h1>Single File Page</h1></body></html>'
    fs.writeFileSync(path.join(tempDir, 'index.html'), htmlContent);

    const output = await runCliCommand([
      'publish',
      ensName,
      path.join(tempDir, 'index.html'), // Pass the file directly, not the directory
      ...flags,
    ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Successfully published content for single-file\.eth!/);
    expect(output.stdout).toMatch(/Preview: https:\/\/.*\.ipfs\.inbrowser\.link/);
    expect(output.stdout).toMatch(/Explore: https:\/\/explore\.ipld\.io\/#\/explore\//);
    expect(output.stdout).toMatch(/ipfs:\/\//);

    // Extract CID from output
    const cidMatch = output.stdout.match(/Preview: https:\/\/(\w+)\.ipfs\.inbrowser\.link/);
    expect(cidMatch).not.toBeNull();
    const publishedCid = cidMatch[1];

    // For single file, the content should be directly accessible
    const remoteContent = await cat(testEnv.kuboApi, publishedCid, '')
    expect(remoteContent).toBe(htmlContent)
  });

  it('fails with expired subscription', async () => {
    const ensName = 'expired-subscription.eth';
    const nearFutureTime = Math.floor(Date.now() / 1000) + 1; // 1 second from now
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    
    // Set up a simplepage subscription that expires very soon
    testEnv.evm.updateUnits(ensName, nearFutureTime, 0, userAddress);
    
    // Wait for the subscription to expire (2 seconds should be enough)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Create a simple HTML file
    const htmlContent = '<!DOCTYPE html><html><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>'
    fs.writeFileSync(path.join(tempDir, 'index.html'), htmlContent);

    const output = await runCliCommand([
      'publish',
      ensName,
      tempDir,
      ...flags,
    ]);

    expect(output.code).toBe(1);
    expect(output.stderr).toMatch(/No active subscription found/);
    expect(output.stderr).toMatch(/To subscribe, visit:/);
    expect(output.stderr).toMatch(/https:\/\/simplepage\.eth\.link\/spg-subscription\/\?domain=expired-subscription\.eth/);
    expect(output.stdout).toBe('');
  });
}); 