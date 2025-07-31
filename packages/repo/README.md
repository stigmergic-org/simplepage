# SimplePage Repo

A JavaScript library for managing SimplePage repositories. These repositories consists of Markdown- and HTML-files which make up all SimplePage webapp instances. This package provides functionality to handle these web pages stored on IPFS with ENS integration.

## Overview

The `@simplepg/repo` package is part of the SimplePage ecosystem, which enables users to create and manage decentralized web pages. It handles:

- Repository initialization and management
- Local edit tracking and staging
- IPFS content addressing and CAR file handling
- ENS domain resolution and content hash updates
- Template management and HTML generation

## Features

- **Repository Management**: Initialize and manage SimplePage repositories with ENS domain integration
- **Local Edits**: Track and manage local edits before committing to the blockchain
- **IPFS Integration**: Handle IPFS content addressing and CAR file operations
- **Template System**: Support for HTML templates with dynamic content population
- **ENS Integration**: Resolve ENS domains and update content hashes
- **Version Control**: Track previous versions and template updates

## Installation

```bash
npm install @simplepg/repo
```

## Usage

### Basic Setup

```javascript
import { Repo } from '@simplepg/repo';

// Create a new repository instance
const repo = new Repo('mydomain.eth', localStorage)

// Initialize with a viem client (can also be provided as an option to the constructor)
await repo.init(viemClient)
```

### Managing Page Content

```javascript
// Get markdown content for a page
const markdown = await repo.getMarkdown('/about/');

// Set local edits for a page
await repo.setPageEdit('/about/', '# About Us\n\nWelcome to our page!', '<h1>About Us</h1><p>Welcome to our page!</p>');

// Get HTML body (with or without local edits)
const htmlBody = await repo.getHtmlBody('/about/');
const canonicalHtml = await repo.getHtmlBody('/about/', true); // ignore local edits
```

### Staging and Committing Changes

```javascript
// Get list of unstaged edits
const unstagedEdits = await repo.getUnstagedEdits();

// Stage changes for commit
const { cid, prepTx } = await repo.stage('mydomain.eth', false);

// Execute the transaction (using your preferred wallet)
const hash = await wallet.sendTransaction(prepTx);

// Finalize the commit after transaction confirmation
await repo.finalizeCommit(cid);
```

### Template Management

```javascript
// Check if a new template version is available
// The template is published to 'new.simplepage.eth'
const versionInfo = await repo.isNewVersionAvailable();
console.log(`Template version: ${versionInfo.templateVersion}`);
console.log(`Current version: ${versionInfo.currentVersion}`);
console.log(`Can update: ${versionInfo.canUpdate}`);

// Stage with template update
const { cid, prepTx } = await repo.stage('mydomain.eth', true);
```

## API Reference

### Repo Class

#### Constructor

```javascript
new Repo(domain, storage, options)
```

- `domain` (string): The ENS domain for the repository
- `storage` (Storage): Storage object for local edits (e.g., localStorage)
- `options` (object): Configuration options
  - `apiEndpoint` (string): API endpoint for the dservice
  - `viemClient` (ViemClient): Viem client for blockchain interactions

#### Methods

##### `init(viemClient, options)`

Initialize the repository with blockchain client.

- `viemClient` (ViemClient): Viem client for blockchain interactions
- `options` (object): Initialization options
  - `chainId` (number): Chain ID (defaults to client's chain ID)
  - `universalResolver` (string): Universal resolver address

##### `getMarkdown(path)`

Get markdown content for a page path.

- `path` (string): Page path (must start and end with '/')
- Returns: `Promise<string>` - Markdown content

##### `setPageEdit(path, markdown, body)`

Set local edits for a page.

- `path` (string): Page path (must start and end with '/')
- `markdown` (string): Markdown content
- `body` (string): HTML body content

##### `getHtmlBody(path, ignoreEdits)`

Get HTML body content for a page.

- `path` (string): Page path
- `ignoreEdits` (boolean): Whether to ignore local edits (default: false)
- Returns: `Promise<string>` - HTML body content

##### `getUnstagedEdits()`

Get list of paths with unstaged edits.

- Returns: `Promise<string[]>` - Array of paths with edits

##### `stage(targetDomain, updateTemplate)`

Stage changes for commit.

- `targetDomain` (string): Target ENS domain
- `updateTemplate` (boolean): Whether to update template (default: false)
- Returns: `Promise<{ cid: string, prepTx: object }>` - CID and transaction data

##### `finalizeCommit(cid)`

Finalize a commit after transaction confirmation.

- `cid` (string): CID of the new repository root
- Returns: `Promise<void>`

##### `isNewVersionAvailable()`

Check if a new template version is available.

- Returns: `Promise<{ templateVersion: string, currentVersion: string, canUpdate: boolean }>`

### Template Functions

#### `populateTemplate(templateHtml, body, targetDomain, path, metadata)`

Populate an HTML template with content and metadata.

- `templateHtml` (string): Template HTML
- `body` (string): Body content
- `targetDomain` (string): Target domain
- `path` (string): Page path
- `metadata` (object): Page metadata
  - `title` (string): Page title
  - `description` (string): Page description
- Returns: `string` - Populated HTML

#### `populateManifest(name, shortName, metadata)`

Generate a web app manifest.

- `name` (string): App name
- `shortName` (string): Short app name
- `metadata` (object): Manifest metadata
  - `description` (string): App description
- Returns: `string` - JSON manifest


## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run linting
pnpm lint
```

## License

GPL-3.0-only