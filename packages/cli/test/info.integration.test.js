import { jest } from '@jest/globals';
import { TestEnvironmentEvm } from '@simplepg/test-utils';
import { runCliCommand } from './runCliCommand.js';

jest.setTimeout(30000);


describe('simplepage info CLI', () => {
  let testEnv;
  let addresses;
  let flags;

  beforeAll(async () => {
    testEnv = new TestEnvironmentEvm();
    addresses = await testEnv.start();
    flags = [
      '--rpc', testEnv.url,
      '--universal-resolver', addresses.universalResolver,
      '--simplepage', addresses.simplepage
    ]
    // Optionally, start dservice here if needed for info command
  });

  afterAll(async () => {
    await testEnv.stop();
    // Optionally, stop dservice here
  });

  it('shows info for a valid ENS name (no subscription)', async () => {
    const ensName = 'test.eth';
    // Mint a page and set resolver + contenthash for the ENS name
    testEnv.setResolver(addresses.universalResolver, ensName, addresses.resolver1);
    testEnv.setContenthash(addresses.resolver1, ensName, 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');

    const output = await runCliCommand([ 'info', ensName, ...flags ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout + output.stderr).toMatch(/No existing subscription/i);
    // should not include Unit #N
    expect(output.stdout + output.stderr).not.toMatch(/Unit #/i);
  });

  it('shows info for one active unit', async () => {
    const ensName = 'active1.eth';
    const futureTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Random address
    
    // Set up ENS
    testEnv.setResolver(addresses.universalResolver, ensName, addresses.resolver1);
    testEnv.setContenthash(addresses.resolver1, ensName, 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');
    
    // Mint page with one active unit
    testEnv.updateUnits(ensName, futureTime, 0, userAddress);

    const output = await runCliCommand([ 'info', ensName, ...flags ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Unit #0 - ACTIVE/);
    expect(output.stdout).toMatch(`Latest sponsor: ${userAddress}`);
    expect(output.stdout).not.toMatch(/Unit #1/);
  });

  it('shows info for one expired unit', async () => {
    const ensName = 'expired1.eth';
    const userAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // Random address
    
    // Set up ENS
    testEnv.setResolver(addresses.universalResolver, ensName, addresses.resolver1);
    testEnv.setContenthash(addresses.resolver1, ensName, 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');
    
    // Mint page with one unit that will expire soon
    const shortExpiration = Math.floor(Date.now() / 1000) + 2; // 2 seconds from now
    testEnv.updateUnits(ensName, shortExpiration, 0, userAddress);
    
    // Wait for the unit to expire
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const output = await runCliCommand([ 'info', ensName, ...flags ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Unit #0 - EXPIRED/);
    expect(output.stdout).toMatch(`Latest sponsor: ${userAddress}`);
    expect(output.stdout).not.toMatch(/Unit #1/);
  });

  it('shows info for multiple active units', async () => {
    const ensName = 'active-multi.eth';
    const futureTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const userAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'; // Random address
    
    // Set up ENS
    testEnv.setResolver(addresses.universalResolver, ensName, addresses.resolver1);
    testEnv.setContenthash(addresses.resolver1, ensName, 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');
    
    // Mint page with multiple active units
    testEnv.updateUnits(ensName, futureTime, 2, userAddress);

    const output = await runCliCommand([ 'info', ensName, ...flags ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Unit #0 - ACTIVE/);
    expect(output.stdout).toMatch(/Unit #1 - ACTIVE/);
    expect(output.stdout).toMatch(/Unit #2 - ACTIVE/);
    expect(output.stdout).toMatch(/Latest sponsor:/);
    expect(output.stdout).not.toMatch(/Unit #3/);
  });

  it('shows info for multiple expired units', async () => {
    const ensName = 'expired-multi.eth';
    const userAddress = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // Random address
    
    // Set up ENS
    testEnv.setResolver(addresses.universalResolver, ensName, addresses.resolver1);
    testEnv.setContenthash(addresses.resolver1, ensName, 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');
    
    // Mint page with multiple units that will expire soon
    const shortExpiration = Math.floor(Date.now() / 1000) + 2; // 2 seconds from now
    testEnv.updateUnits(ensName, shortExpiration, 2, userAddress);

    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const output = await runCliCommand([ 'info', ensName, ...flags ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Unit #0 - EXPIRED/);
    expect(output.stdout).toMatch(/Unit #1 - EXPIRED/);
    expect(output.stdout).toMatch(/Unit #2 - EXPIRED/);
    expect(output.stdout).toMatch(/Latest sponsor:/);
    expect(output.stdout).not.toMatch(/Unit #3/);
  });

  it('shows info for mixed active and expired units', async () => {
    const ensName = 'mixed.eth';
    const user1Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'; // Random address
    const user2Address = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // Random address
    
    // Set up ENS
    testEnv.setResolver(addresses.universalResolver, ensName, addresses.resolver1);
    testEnv.setContenthash(addresses.resolver1, ensName, 'bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm');
    
    // Create page with 3 units - unit 2 will expire soon, units 0 and 1 will be active
    const futureTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    const shortExpiration = Math.floor(Date.now() / 1000) + 2; // 2 seconds from now
    testEnv.updateUnits(ensName, shortExpiration, 2, user1Address); // Unit 2 expires soon
    testEnv.updateUnits(ensName, futureTime, 0, user2Address); // Units 0 and 1 active
    
    // Wait for unit 0 to expire
    await new Promise(resolve => setTimeout(resolve, 2500));

    const output = await runCliCommand([ 'info', ensName, ...flags ]);

    expect(output.stderr).toBe('');
    expect(output.code).toBe(0);
    expect(output.stdout).toMatch(/Unit #0 - ACTIVE/);
    expect(output.stdout).toMatch(/Unit #1 - EXPIRED/);
    expect(output.stdout).toMatch(/Unit #2 - EXPIRED/);
    expect(output.stdout).toMatch(/Latest sponsor:/);
    expect(output.stdout).toMatch(user2Address);
    expect(output.stdout).not.toMatch(/Unit #3/);
  });
}); 