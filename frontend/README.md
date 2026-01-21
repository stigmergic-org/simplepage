# SimplePage Frontend

## Overview
SimplePage is a censorship resistant markdown based CMS platform and protocol.

## Installation
1. Install dependencies from root directory:
   ```
   pnpm install
   ```

## Development

### Development environment

First spin up a local development environment. This requires a few steps

#### Start up infrastructure
- `ipfs daemon` - start your local ipfs node
- `anvil --chain-id=1337` - start the local ethereum test environment
- `cd ..` - move to root directory
- `./setup-test-env.js` - start the test environment
- `cd packages/dservice`
- `./bin/simplepage-dservice.js -p 8001 -c 1337` - start the Simple Page DService

#### Now start the web development server 

- `npm run dev`: Start development server

## Web3 Markdown Tags

Pages can include interactive transaction forms by embedding Markdown images that target the `web3://` scheme:

```
![](web3://0xabc123.../transfer/address!0xdeadbeef.../uint256!)
```

- The first path segment after the contract is treated as the function name.
- Argument segments follow the `type!value` pattern. Use `type!0x` to require user input (no default). Any other value pre-fills the field but remains editable.
- Every argument must explicitly declare its Solidity type; bare values (without `type!`) are rejected.
- Optional labels can precede the argument (`recipient=address!0x...`) and are shown beside the input.
- Query params support `value=` (e.g. `?value=0.1eth`) and `payable=true`.
- When rendered, each tag becomes a form with a button whose label is derived from the function name (e.g., `transferFrom` → `Transfer From`). A wallet status header is embedded automatically, and submissions run through viem/wagmi with ENS contract resolution at runtime.
- Only the `web3://` scheme is recognized; `w3://` links will fall back to standard media handling.

## License
This project is licensed under the GNU General Public License v3.0 (GPLv3) - see the LICENSE file for details.
