#!/usr/bin/env node

import { program, Option } from 'commander';
import { publish } from '../commands/publish.js';
import { info } from '../commands/info.js';
import packageJson from '../package.json' with { type: 'json' }

// Helper function to add global options to a command
function withGlobalOptions(command) {
  return command
    .option('-r, --rpc <url>', 'Ethereum RPC URL (optional)')
    .option('-c, --chain-id <number>', 'Chain ID (optional)')
    .addOption(new Option('-u, --universal-resolver <address>', 'ENS Universal Resolver address (optional)').hideHelp())
    .addOption(new Option('-s, --simplepage <address>', 'SimplePage address (optional)').hideHelp());
}

program
  .name('simplepage')
  .description('CLI tool for publishing apps on ENS')
  .version(packageJson.version)

withGlobalOptions(
  program
    .command('publish')
    .description('Publish a directory to ENS')
    .argument('<ens-name>', 'ENS domain name')
    .argument('<path>', 'Path to directory')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(publish)
);

withGlobalOptions(
  program
    .command('info')
    .description('Show subscription info for an ENS name')
    .argument('<ens-name>', 'ENS domain name')
    .action(info)
);

program.parse(); 