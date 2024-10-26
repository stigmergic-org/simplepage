# SimplePage CLI

A command-line developer tool for publishing decentralized applications on ENS (Ethereum Name Service) using the SimplePage protocol.

## Overview

SimplePage CLI allows you to publish static websites and applications to ENS domains with IPFS storage. It handles the entire process from file upload to ENS content hash updates, making it easy to deploy censorship-resistant web applications.

## Features

- **ENS Integration**: Publish content directly to ENS domains
- **IPFS Storage**: Content is stored on IPFS for decentralization
- **Subscription Management**: Check subscription status for ENS domains
- **File Upload**: Support for both single files and entire directories
- **CAR File Generation**: Creates Content Addressable aRchive (CAR) files for efficient IPFS uploads

## Installation

### Global Installation

```bash
npm install -g @simplepg/cli
```


## Usage

### Basic Commands

The CLI provides two main commands:

#### `publish` - Publish content to an ENS domain

```bash
simplepage publish <ens-name> <path>
```

**Arguments:**
- `ens-name`: The ENS domain name (e.g., `myapp.eth`)
- `path`: Path to the directory or file to publish

**Options:**
- `-r, --rpc <url>`: Ethereum RPC URL (optional)
- `-c, --chain-id <number>`: Chain ID (optional)
- `-d, --dservice <url>`: SimplePage DService URL (optional)

**Examples:**

```bash
# Publish a directory
simplepage publish myapp.eth ./dist

# Publish a single file
simplepage publish myapp.eth ./index.html

# Use custom RPC and dservice
simplepage publish myapp.eth ./dist \
  --rpc https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY \
  --dservice https://custom-dservice.com
```

#### `info` - Show subscription information for an ENS domain

```bash
simplepage info <ens-name>
```

**Arguments:**
- `ens-name`: The ENS domain name to check

**Options:**
- `-r, --rpc <url>`: Ethereum RPC URL (optional)
- `-c, --chain-id <number>`: Chain ID (optional)

**Example:**

```bash
simplepage info myapp.eth
```

### Output Examples

#### Successful Publish

```
Successfully published content for myapp.eth!
Preview: https://bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm.ipfs.inbrowser.link
Explore: https://explore.ipld.io/#/explore/bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm

To update your ENS name, set your contenthash to this url within 1 hour:
ipfs://bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm
```

#### Subscription Info

```
=== myapp.eth ===
Unit #0 - ACTIVE, until 2024-01-15 14:30:00
Unit #1 - EXPIRED
Latest sponsor: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Content hash: ipfs://bafybeieffej45qo3hqi3eggqoqwgjihscmij42hmhqy3u7se7vzgi7h2zm
```


## Requirements

### ENS Subscription

Before publishing, you need an active SimplePage subscription for your ENS domain. You can subscribe at:

```
https://simplepage.eth.limo/spg-subscription?domain=yourdomain.eth
```

### Supported File Types

The CLI supports publishing:
- Static HTML files
- CSS, JavaScript, and other web assets
- Images and media files
- Any file type that can be served over HTTP

### File Structure

When publishing a directory, the CLI will:
1. Create an IPFS directory structure
2. Add all files recursively
3. Generate a CAR file for efficient upload
4. Upload to the SimplePage DService

## Contrubuting

### Running Tests

```bash
# Run all tests
pnpm test
```


## License

GPL-3.0-only

## Related

- [SimplePage Protocol](https://simplepage.eth.limo)
- [ENS Documentation](https://docs.ens.domains/)
- [IPFS Documentation](https://docs.ipfs.io/) 