#!/usr/bin/env node

import { TestEnvironmentEvm } from './packages/test-utils/src/testEnvEvm.js';
import { execSync } from 'child_process';


// Parse command line arguments
const args = process.argv.slice(2);
const userAddress = args[0];

if (!userAddress) {
  console.error('Error: User address is required');
  console.log('Usage: node setup-test-env.js <userAddress>');
  console.log('Example: node setup-test-env.js 0x1234567890123456789012345678901234567890');
  process.exit(1);
}

let evm = null;

// Handle process termination signals to ensure cleanup
const cleanup = async () => {
  if (evm) {
    try {
      console.log('\n🛑 Received termination signal, stopping EVM test environment...');
      await evm.stop();
      console.log('EVM test environment stopped.');
    } catch (error) {
      console.error('Failed to stop EVM test environment:', error.message);
    }
  }
  process.exit(0);
};

// Register signal handlers
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // kill command
process.on('SIGHUP', cleanup);  // Terminal closed

(async () => {
  try {
    // 1. Start the EVM test environment with manager
    // Change to packages/test-utils directory so TestEnvironmentEvm can find contracts
    const originalCwd = process.cwd();
    process.chdir('./packages/test-utils');
    
    evm = new TestEnvironmentEvm();
    const addresses = await evm.start({ withManager: true, port: 8545, externalAnvil: true });
    console.log('EVM started with manager:', addresses);
    
    // Change back to root directory
    process.chdir(originalCwd);

    // 3. Build the frontend
    execSync('cd frontend && pnpm build', { stdio: 'inherit' });
    console.log('Frontend built.');

    // 4. Add frontend/dist to IPFS and parse the CID
    const ipfsAddOutput = execSync('ipfs add --cid-version=1 -Qr frontend/dist', { encoding: 'utf8' }).trim();
    const cid = ipfsAddOutput;
    console.log('IPFS CID:', cid);

    // 5. Set resolver data for 'new.simplepage.eth'
    //    - contenthash to the CID (correctly encoded)
    //    - dservice to http://localhost:8001
    const resolver = addresses.resolver1;
    const domain = 'new.simplepage.eth';
    const dserviceValue = 'http://localhost:8001';

    // 6. Update contracts.js with deployed addresses for chain ID 1337
    execSync('cd contracts/script && node updateContracts.cjs 1337', { stdio: 'inherit' });
    console.log('Contracts.js updated for chain ID 1337');

    // Set resolver
    evm.setResolver(addresses.universalResolver, domain, resolver);
    // Set contenthash
    evm.setContenthash(resolver, domain, cid);
    // Set dservice text record
    evm.setTextRecord(resolver, domain, 'dservice', dserviceValue);

    console.log('Resolver data set for', domain);
    console.log('Dservice url:', dserviceValue);

    // 7. Send some ETH to the user address
    execSync(`cast send --value 1000000000000000000 --private-key ${evm.secretKey} --rpc-url ${evm.url} ${userAddress}`);
    console.log(`Sent 1 ETH to ${userAddress}`);

    console.log('✅ Setup completed successfully!');
    console.log('EVM test environment is running on port 8545');
    console.log('To stop the environment, run: pkill -f "anvil.*8545"');

  } catch (error) {
    console.error('❌ Setup failed with error:', error.message);
    
    // Clean up EVM test environment if it was started
    if (evm) {
      try {
        console.log('Stopping EVM test environment...');
        await evm.stop();
        console.log('EVM test environment stopped.');
      } catch (stopError) {
        console.error('Failed to stop EVM test environment:', stopError.message);
      }
    }
    
    process.exit(1);
  }
})(); 