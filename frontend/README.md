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


## License
This project is licensed under the GNU General Public License v3.0 (GPLv3) - see the LICENSE file for details.
