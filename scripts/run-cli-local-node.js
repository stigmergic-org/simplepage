import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_DSERVICE_URL = 'http://127.0.0.1:8001'
const DEFAULT_CHAIN_ID = '11155111'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLI_BIN_PATH = path.resolve(__dirname, '../packages/cli/bin/simplepage.js')

const args = process.argv.slice(2)
if (args[0] === '--') {
  args.shift()
}
const dserviceUrl = process.env.SIMPLEPAGE_DSERVICE_URL || DEFAULT_DSERVICE_URL

const commandSupportsDservice = (commandArgs) => {
  const [command, subcommand] = commandArgs

  if (command === 'auth') {
    return true
  }

  if (command === 'refs' && (subcommand === 'push-raw' || subcommand === 'list')) {
    return true
  }

  if (command === 'drafts' && (subcommand === 'push-raw' || subcommand === 'list')) {
    return true
  }

  if (command === 'repo' && (subcommand === 'clone' || subcommand === 'pull')) {
    return true
  }

  return false
}

const commandSupportsChainId = (commandArgs) => {
  const [command, subcommand] = commandArgs

  if (command === 'auth' || command === 'info') {
    return true
  }

  if (command === 'refs' && (subcommand === 'push-raw' || subcommand === 'list')) {
    return true
  }

  if (command === 'drafts' && (subcommand === 'push-raw' || subcommand === 'list')) {
    return true
  }

  if (command === 'repo' && (subcommand === 'clone' || subcommand === 'status' || subcommand === 'pull')) {
    return true
  }

  return false
}

const hasExplicitDservice = args.includes('--dservice') || args.includes('-d')
const hasExplicitChainId = args.includes('--chain-id') || args.includes('-c')
const forwardedArgs = [...args]

if (commandSupportsDservice(args) && !hasExplicitDservice) {
  forwardedArgs.push('--dservice', dserviceUrl)
}

if (commandSupportsChainId(args) && !hasExplicitChainId) {
  forwardedArgs.push('--chain-id', DEFAULT_CHAIN_ID)
}

const nodeCommand = process.execPath
const child = spawn(nodeCommand, [CLI_BIN_PATH, ...forwardedArgs], {
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
