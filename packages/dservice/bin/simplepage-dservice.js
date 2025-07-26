#!/usr/bin/env node

import { Command, Option } from 'commander'
import { DService } from '../src/dservice.js'
import { handleListCommand } from '../src/listCommand.js'
import { handleIndexerDataCommand } from '../src/indexerDataCommand.js'
import packageJson from '../package.json' assert { type: 'json' }


const program = new Command()

const startServer = () => {
  // Only start the server if no subcommands were used
  if (process.argv.length > 2) {
    // Check if the second argument is a subcommand
    const subcommands = ['allow-list', 'block-list'];
    if (subcommands.includes(process.argv[2])) {
      return; // Don't start server if a subcommand is being used
    }
  }
  
  const opts = program.opts()
  // Pass TLS file paths if provided
  let tls = undefined
  if (opts.tlsKey && opts.tlsCert) {
    tls = {
      key: opts.tlsKey,
      cert: opts.tlsCert
    }
  }
  const config = {
    version: packageJson.version,
    ipfs: {
      api: opts.ipfsApi,
    },
    api: {
      port: parseInt(opts.apiPort),
      host: opts.apiHost,
      tls // Pass TLS file paths if present
    },
    blockchain: {
      rpcUrl: opts.rpc,
      startBlock: parseInt(opts.startBlock),
      chainId: parseInt(opts.chainId),
      disableIndexing: opts.disableIndexing,
      universalResolver: opts.universalResolver,
      simplePageAddress: opts.simplepage
    },
    logLevel: opts.logLevel,
    silent: opts.silent,
    logDir: opts.logDir
  }
  
  console.log('Starting SimplePage DService...')
  console.log('Configuration:', {
    ipfsApi: config.ipfs.api,
    apiPort: config.api.port,
    apiHost: config.api.host,
    rpcUrl: config.blockchain.rpcUrl,
    logLevel: config.logLevel,
    logDir: config.logDir
  })
  
  const dservice = new DService(config)
  
  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down gracefully...')
    try {
      await dservice.stop()
      console.log('DService stopped successfully')
      process.exit(0)
    } catch (error) {
      console.error('Error during shutdown:', error)
      process.exit(1)
    }
  }

  // Listen for shutdown signals
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Start the service
  dservice.start().catch((error) => {
    console.error('Failed to start DService:', error.message)
    process.exit(1)
  })
}

program
  .version(packageJson.version)
  .option('-i, --ipfs-api <url>', 'IPFS API URL', 'http://localhost:5001')
  .option('-p, --api-port <number>', 'API port', '3000')
  .option('-a, --api-host <string>', 'API host', 'localhost')
  .option('-r, --rpc <url>', 'Ethereum RPC URL', 'http://localhost:8545')
  .option('-b, --start-block <number>', 'Starting block number for indexing')
  .option('-c, --chain-id <number>', 'Chain ID')
  .option('-d, --disable-indexing', 'Disable indexing')
  .option('-l, --log-level <level>', 'Stdout log level (error, warn, info, debug)', 'info')
  .option('--silent', 'Disable console logging')
  .option('--log-dir <path>', 'Log directory path', './logs')
  .option('--tls-key <path>', 'Path to TLS private key (PEM)')
  .option('--tls-cert <path>', 'Path to TLS certificate (PEM)')
  .addOption(new Option('-u, --universal-resolver <address>', 'ENS Universal Resolver address (optional)').hideHelp())
  .addOption(new Option('-s, --simplepage <address>', 'SimplePage address (optional)').hideHelp())
  .action(startServer)

// Add allow-list command
program
  .command('allow-list')
  .description('Manage allow list')
  .argument('<action>', 'Action to perform (show|add|rm)')
  .argument('[name]', 'ENS domain to add or remove (e.g., example.eth)')
  .action((action, name) => handleListCommand('allow', action, name, program.opts().ipfsApi))

// Add block-list command
program
  .command('block-list')
  .description('Manage block list')
  .argument('<action>', 'Action to perform (show|add|rm)')
  .argument('[name]', 'ENS domain to add or remove (e.g., example.eth)')
  .action((action, name) => handleListCommand('block', action, name, program.opts().ipfsApi))

// Add indexer-data command
program
  .command('indexer-data')
  .description('Show or reset indexing-related data (domains, resolvers, contenthash_{domain} lists)')
  .argument('<action>', 'Action to perform (show|reset)')
  .action((action) => {
    const opts = program.opts();
    handleIndexerDataCommand(action, opts.ipfsApi);
  });

program.parse()
