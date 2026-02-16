import { afterAll, beforeAll, describe, it, jest } from '@jest/globals'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TestEnvironmentEvm } from '@simplepg/test-utils'
import { generateFoamSvg } from '../src/foam.js'

jest.setTimeout(120000)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const contractsDir = path.resolve(__dirname, '..', '..', '..', 'contracts')

const seeds = ['simplepage', 'foam', 'ocean', 'sunset', 'simplepage.eth']
const sizes = [32, 128, 256, 512]

// Colors from Solidity - used as palette overrides for parity comparison
const SOLIDITY_COLORS = {
  '--color-base-content': 'oklch(21% 0.006 285.885)',
  '--color-primary': 'oklch(45% 0.24 277.023)',
  '--color-secondary': 'oklch(65% 0.241 354.308)',
  '--color-accent': 'oklch(77% 0.152 181.912)',
  '--color-info': 'oklch(74% 0.16 232.661)',
  '--color-success': 'oklch(76% 0.177 163.223)',
  '--color-warning': 'oklch(82% 0.189 84.429)',
  '--color-error': 'oklch(71% 0.194 13.428)',
}

describe('FoamIdenticon Solidity parity', () => {
  const env = new TestEnvironmentEvm()
  let address

  beforeAll(async () => {
    await env.start({ blockGasLimit: 100000000 })
    address = deployFoamIdenticon(env)
  })

  afterAll(async () => {
    await env.stop()
  })

  it('matches JS output', () => {
    const mismatches = []

    for (const seed of seeds) {
      for (const size of sizes) {
        const jsSvg = generateFoamSvg(seed, size, { paletteOverrides: SOLIDITY_COLORS })
        const solSvg = callFoamSvg(env, address, seed, size)

        if (jsSvg !== solSvg) {
          const diffIndex = firstDiffIndex(jsSvg, solSvg)
          mismatches.push({
            seed,
            size,
            jsHash: hashSvg(jsSvg),
            solHash: hashSvg(solSvg),
            diffIndex,
            jsSlice: sliceAround(jsSvg, diffIndex),
            solSlice: sliceAround(solSvg, diffIndex),
          })
        }
      }
    }

    if (mismatches.length > 0) {
      const sample = mismatches.slice(0, 3)
      const details = sample
        .map(item => {
          return [
            `seed="${item.seed}" size=${item.size}`,
            `JS SHA256: ${item.jsHash}`,
            `SOL SHA256: ${item.solHash}`,
            `First diff index: ${item.diffIndex}`,
            `JS slice: ${item.jsSlice}`,
            `SOL slice: ${item.solSlice}`,
          ].join('\n')
        })
        .join('\n\n')
      throw new Error(`${mismatches.length} mismatches found\n\n${details}`)
    }
  })
})

function deployFoamIdenticon(env) {
  const result = spawnSync(
    'forge',
    [
      'create',
      'src/FoamIdenticon.sol:FoamIdenticon',
      '--broadcast',
      '--rpc-url',
      env.url,
      '--private-key',
      env.secretKey,
    ],
    { cwd: contractsDir, encoding: 'utf8' }
  )

  if (result.status !== 0) {
    throw new Error(`Forge create failed: ${result.stderr || result.stdout}`)
  }

  const output = `${result.stdout}\n${result.stderr}`
  const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/)
  if (!match) {
    throw new Error(`Failed to parse deployment address\n${output}`)
  }
  return match[1]
}

function callFoamSvg(env, address, seed, size) {
  const callResult = spawnSync(
    'cast',
    [
      'call',
      address,
      'generateFoamSvg(string,uint256)',
      seed,
      String(size),
      '--rpc-url',
      env.url,
      '--gas-limit',
      '100000000',
    ],
    { encoding: 'utf8' }
  )

  if (callResult.status !== 0) {
    throw new Error(`cast call failed: ${callResult.stderr || callResult.stdout}`)
  }

  const output = callResult.stdout.trim()
  if (output.startsWith('0x')) {
    const decodeResult = spawnSync('cast', ['abi-decode', 'decode()(string)', output], {
      encoding: 'utf8',
    })
    if (decodeResult.status !== 0) {
      throw new Error(`cast abi-decode failed: ${decodeResult.stderr || decodeResult.stdout}`)
    }
    return normalizeCastString(decodeResult.stdout.trim())
  }
  return output
}

function hashSvg(svg) {
  return crypto.createHash('sha256').update(svg).digest('hex')
}

function normalizeCastString(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch (_error) {
      return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\/g, '\\')
    }
  }
  return value
}

function firstDiffIndex(a, b) {
  const max = Math.min(a.length, b.length)
  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) {
      return i
    }
  }
  return max
}

function sliceAround(text, index) {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + 40)
  return text.slice(start, end)
}
