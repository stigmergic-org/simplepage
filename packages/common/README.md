# @simplepg/common

Common utilities for SimplePage packages, providing shared functionality for ENS resolution, IPLD operations, and contract interactions.

## Installation

```bash
npm install @simplepg/common
```

## Exports

### `contracts`
Contract ABIs and deployment addresses for the SimplePage ecosystem.

```javascript
import { contracts } from '@simplepg/common'

// Access contract deployments by chain ID
const mainnetDeployments = contracts.deployments["1"]
const sepoliaDeployments = contracts.deployments["11155111"]

// Access contract ABIs
const simplePageAbi = contracts.abis.SimplePage
const simplePageManagerAbi = contracts.abis.SimplePageManager
const tokenRendererAbi = contracts.abis.TokenRenderer
const ensResolverAbi = contracts.abis.EnsResolver

// Access Universal Resolver addresses
const mainnetResolver = contracts.universalResolver["1"]
const sepoliaResolver = contracts.universalResolver["11155111"]
```

### ENS Utilities

#### `ensContentHashToCID(contentHash)`
Converts an ENS contenthash to a CID (Content Identifier).

```javascript
import { ensContentHashToCID } from '@simplepg/common'

const contentHash = '0xe30101701220bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqnbk6key6wmqkhq6m'
const cid = ensContentHashToCID(contentHash)
console.log(cid.toString()) // bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqnbk6key6wmqkhq6m
```

#### `cidToENSContentHash(cid)`
Converts a CID to an ENS contenthash format.

```javascript
import { cidToENSContentHash } from '@simplepg/common'
import { CID } from 'multiformats/cid'

const cid = CID.parse('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqnbk6key6wmqkhq6m')
const contentHash = cidToENSContentHash(cid)
console.log(contentHash) // 0xe30101701220bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqnbk6key6wmqkhq6m
```

#### `resolveEnsDomain(viemClient, ensName, universalResolver)`
Resolves an ENS domain to get its contenthash and resolver address.

```javascript
import { resolveEnsDomain } from '@simplepg/common'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http()
})

const result = await resolveEnsDomain(
  client,
  'example.eth',
  '0xaBd80E8a13596fEeA40Fd26fD6a24c3fe76F05fB'
)

console.log(result)
// {
//   cid: CID('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqnbk6key6wmqkhq6m'),
//   resolverAddress: '0x1234...'
// }
```

### IPLD Utilities

#### `emptyUnixfs()`
Creates an empty UnixFS filesystem with a memory blockstore. Use this for server-side operations or tests.

```javascript
import { emptyUnixfs } from '@simplepg/common'

const { fs, blockstore } = emptyUnixfs()
```

#### `browserUnixfs(storage)`
Creates a UnixFS filesystem with a hybrid blockstore that combines memory, IndexedDB storage and localStorage for WAL. Use this for browser applications.

```javascript
import { browserUnixfs } from '@simplepg/common'

const { fs, blockstore } = browserUnixfs(localStorage)
```

#### `emptyCar()`
Creates an empty CAR (Content Addressable aRchive).

```javascript
import { emptyCar } from '@simplepg/common'

const car = emptyCar()
```

#### `walkDag(blockstore, cid, seen)`
Walks through a DAG (Directed Acyclic Graph) starting from a given CID and returns an array of blocks, which can be added to a CAR-file.

```javascript
import { walkDag } from '@simplepg/common'

const blocks = await walkDag(blockstore, cid)
// Returns array of CarBlock objects representing the DAG
```

### DService

#### `DService`
A service for interacting with decentralized service endpoints. Fetches endpoints from ENS 'dservice' text record.

```javascript
import { DService } from '@simplepg/common'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http()
})

const dservice = new DService('example.eth')

// Initialize with viem client
await dservice.init(client)

// Fetch data from dservice endpoints
const response = await dservice.fetch('/api/data', {
  method: 'GET'
})
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Lint code
pnpm run lint
```

## License

GPL-3.0-only