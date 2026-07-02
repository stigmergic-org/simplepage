#!/usr/bin/env node

import { program, Option } from 'commander';
import { info } from '../commands/info.js';
import { checkoutRepoDraft, cloneRepo, diffRepo, newRepo, pullRepo, pushRepoDraft, resetRepo, statusRepo } from '../commands/repo.js';
import { auth, listRefsCommand, pushRawRef, reviewDrafts } from '../commands/drafts.js';
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
  .description('CLI tool for SimplePage')
  .version(packageJson.version)

withGlobalOptions(
  program
    .command('info')
    .description('Show subscription info for an ENS name')
    .argument('<ens-name>', 'ENS domain name')
    .action(info)
);

withGlobalOptions(
  program
    .command('auth')
    .description('Authorize the cli for a specific ENS name')
    .argument('<ens-name>', 'ENS domain name')
    .option('--name <name>', 'Agent name to bind into the capability SIWE')
    .option('--fallback', 'Use the fallback SimplePage app URL')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(auth)
);

const draftsCommand = program
  .command('drafts')
  .description('Manage off-chain drafts for an ENS name')

withGlobalOptions(
  draftsCommand
    .command('push-raw')
    .description('Create a new revision based on file or folder')
    .argument('<ens-name>', 'ENS domain name')
    .argument('<draft-name>', 'Draft name')
    .argument('<path>', 'Path to directory or file')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(pushRawRef)
)

withGlobalOptions(
  draftsCommand
    .command('list')
    .description('List signed drafts for an ENS name')
    .argument('<ens-name>', 'ENS domain name')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(listRefsCommand)
)

withGlobalOptions(
  draftsCommand
    .command('review')
    .description('Print the draft review page URL for an ENS name')
    .argument('<ens-name>', 'ENS domain name')
    .option('--fallback', 'Use the fallback SimplePage app URL')
    .option('--open', 'Open the review page in the default browser')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(reviewDrafts)
)

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

withGlobalOptions(
  repoCommand
    .command('new')
    .description('Create a new markdown repo from the SimplePage template')
    .argument('<ens-name>', 'ENS domain name')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(newRepo)
)

repoCommand
  .command('diff')
  .description('Show local markdown changes')
  .argument('[files...]', 'Markdown file paths to diff')
  .action(diffRepo)

repoCommand
  .command('reset')
  .description('Reset markdown files to the tracked root')
  .argument('[files...]', 'Markdown file paths to reset')
  .option('--hard', 'Reset the whole working tree to the tracked root and clear active draft state')
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

withGlobalOptions(
  repoCommand
    .command('push-draft')
    .description('Push local markdown changes as a signed draft')
    .argument('<draft-name>', 'Draft name')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(pushRepoDraft)
)

withGlobalOptions(
  repoCommand
    .command('checkout')
    .description('Check out the latest revision of a draft')
    .argument('<draft-name>', 'Draft name')
    .option('-d, --dservice <url>', 'SimplePage DService URL (optional)')
    .action(checkoutRepoDraft)
)

program.parse(); 
