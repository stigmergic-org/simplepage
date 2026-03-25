#!/usr/bin/env node

import { program, Option } from 'commander';
import { publish } from '../commands/publish.js';
import { info } from '../commands/info.js';
import { cloneRepo, diffRepo, resetRepo, statusRepo, pullRepo } from '../commands/repo.js';
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

const repoCommand = program
  .command('repo')
  .description('Interact with markdown files in a SimplePage repo')

withGlobalOptions(
  repoCommand
    .command('clone')
    .description('Clone markdown files for an ENS name')
    .argument('<ens-name>', 'ENS domain name')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(cloneRepo)
)

repoCommand
  .command('diff')
  .description('Show local markdown changes')
  .action(diffRepo)

repoCommand
  .command('reset')
  .description('Reset markdown files to the tracked root')
  .argument('[files...]', 'Markdown file paths to reset')
  .action(resetRepo)

withGlobalOptions(
  repoCommand
    .command('status')
    .description('Show local and upstream repo status')
    .action(statusRepo)
)

withGlobalOptions(
  repoCommand
    .command('pull')
    .description('Fetch and apply upstream markdown changes')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(pullRepo)
)

program.parse(); 
