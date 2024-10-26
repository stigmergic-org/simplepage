# SimplePage DService

A decentralized backend service for the SimplePage application that provides IPFS storage, blockchain indexing, and REST API endpoints for managing decentralized web pages.

## Overview

SimplePage DService is a Node.js service that bridges the gap between the SimplePage smart contract and IPFS storage. It provides:

- **IPFS Integration**: Upload, retrieve, and manage CAR (Content Addressable aRchive) files
- **Blockchain Indexing**: Monitor SimplePage contract events and track ENS contenthash updates
- **REST API**: HTTP endpoints for page operations with automatic Swagger documentation
- **List Management**: Allow/block list functionality for ENS domains
- **Content Finalization**: Automatic staging and finalization of page content

## Features

### 🗄️ IPFS Storage
- Upload CAR files with automatic pinning and staging
- Retrieve page content with optimized CAR file generation
- Content finalization based on blockchain events
- Automatic cleanup of old staged content

### ⛓️ Blockchain Indexing
- Monitor SimplePage contract for new page registrations
- Track ENS contenthash updates for registered domains
- Maintain synchronized state between blockchain and IPFS
- Support for multiple blockchain networks

### 🌐 REST API
- Upload new pages with domain association
- Retrieve page content by CID
- Automatic OpenAPI/Swagger documentation
- File upload support with multipart/form-data

### 📋 List Management
- Allow list management for trusted domains
- Block list management for restricted domains
- CLI commands for list operations
- Persistent storage using IPFS pins

## Installation

### Prerequisites

- Node.js 20+ with ES modules support
- IPFS node (Kubo) running and accessible
- Ethereum RPC endpoint

### Install

```bash
npm install -g @simplepg/dservice
```

## Usage

### Command Line Interface

The DService provides a CLI with various options and subcommands:

```bash
# Start the service with default settings
simplepage-dservice

# Start with custom configuration
simplepage-dservice \
  --ipfs-api http://localhost:5001 \
  --api-port 3000 \
  --api-host localhost \
  --rpc https://mainnet.infura.io/v3/YOUR_KEY \
  --start-block 18000000 \
  --chain-id 1

# Manage allow list
simplepage-dservice allow-list show
simplepage-dservice allow-list add example.eth
simplepage-dservice allow-list rm example.eth

# Manage block list
simplepage-dservice block-list show
simplepage-dservice block-list add spam.eth
simplepage-dservice block-list rm spam.eth
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IPFS_API_URL` | IPFS API endpoint | `http://localhost:5001` |
| `API_PORT` | HTTP API port | `3000` |
| `API_HOST` | HTTP API host | `localhost` |
| `RPC_URL` | Ethereum RPC URL | `http://localhost:8545` |
| `START_BLOCK` | Starting block for indexing | `1` |
| `CHAIN_ID` | Ethereum chain ID | `1` |

### Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--ipfs-api` | `-i` | IPFS API URL | `http://localhost:5001` |
| `--api-port` | `-p` | API port | `3000` |
| `--api-host` | `-a` | API host | `localhost` |
| `--rpc` | `-r` | Ethereum RPC URL | `http://localhost:8545` |
| `--start-block` | `-b` | Starting block number | `1` |
| `--chain-id` | `-c` | Chain ID | `1` |


## API Reference

### Base URL
```
http://localhost:3000
```

### Endpoints

#### GET /page
Retrieve a page by its CID. Returns a CAR-file containing only index.html and index.md files for each directory contained by the page.

**Query Parameters:**
- `cid` (required): Content identifier of the page

**Response:**
- `200`: CAR file containing the page data
- `400`: Bad request (missing CID)
- `404`: Page not found

**Example:**
```bash
curl "http://localhost:3000/page?cid=bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm"
```

#### POST /page
Upload a new page.

**Query Parameters:**
- `domain` (required): ENS domain for the page

**Body:**
- `file` (required): CAR file (application/vnd.ipld.car)

**Response:**
```json
{
  "cid": "bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm"
}
```

**Example:**
```bash
curl -X POST \
  -F "file=@page.car" \
  "http://localhost:3000/page?domain=example.eth"
```

#### GET /info
Get API version information.

**Response:**
```json
{
  "version": "0.1.0"
}
```

#### GET /docs
Interactive API documentation (Swagger UI).

#### GET /openapi.json
OpenAPI specification in JSON format.

## Architecture

### Services

#### IpfsService
Handles all IPFS-related operations:
- CAR file upload and retrieval
- Content pinning and staging
- List management using IPFS pins
- Content finalization

#### IndexerService
Manages blockchain indexing:
- Monitors SimplePage contract events
- Tracks ENS contenthash updates
- Synchronizes blockchain state with IPFS 
- Retrieves page data from other nodes over IPFS
- Handles page finalization triggers

#### API Service
Provides HTTP endpoints:
- RESTful API for page operations
- Automatic OpenAPI documentation
- File upload handling
- Error handling and validation

### Data Flow

1. **Page Upload**: Client uploads CAR file → IPFS storage → Staged pin created
2. **Blockchain Event**: Indexer detects new page registration → Domain added to list
3. **Contenthash Update**: Indexer detects ENS contenthash change → CID tracked
4. **Finalization**: Indexer triggers content finalization → Staged pin → Final pin
5. **Retrieval**: Client requests page → Optimized CAR file generated and served

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/services/ipfs.test.js
```

### Development Mode

```bash
# Start with auto-restart on file changes
npm run dev
```

### Linting

```bash
# Run ESLint
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Support

For questions and support:
- Open an issue on GitHub