# SimplePage Architecture Reference

This document captures how the SimplePage system fits together based on the current codebase.

## High-level summary
SimplePage is a markdown-first publishing system built on ENS + IPFS. Content is edited locally (browser or CLI), staged to IPFS as a CAR, and published by setting the ENS contenthash. A backend "DService" pins/stages content, indexes on-chain events, and serves lightweight CARs and raw blocks. End users browse via an ENS HTTP gateway, with `eth.link` as the default.

## Core components

### Frontend (React)
- Location: `frontend/`
- Role: Authoring UI, preview, publish, subscription flow, file/settings management.
- Domain identity: Read from `meta[name="ens-domain"]` in the template (`useDomain`).
- Routing: SPA uses `/spg-*` routes (`frontend/src/config/routes.js`) with the view at `/`.
- Repo integration: Uses `@simplepg/repo` for all content operations (`useRepo`).
- Web3 markdown: `web3://` image links are turned into iframes rendering interactive transaction forms (`frontend/src/utils/web3Form.js`). The iframe uses a hash fragment (`#w3uri=...`) to avoid querystring restrictions on some gateways.
- Gateway: Links and post-publish redirects use `DOMAIN_SUFFIX` (`.link` for mainnet, `.sepoliaens.eth.link` for Sepolia).

### Repo library (@simplepg/repo)
- Location: `packages/repo/`
- Role: The canonical content engine. Tracks local edits, builds repo DAGs, and prepares ENS contenthash transactions.
- Storage: Uses `browserUnixfs` from `@simplepg/common`, backed by a hybrid blockstore (memory + IndexedDB + localStorage WAL).
- Template: Uses `new.simplepage.eth` as the template domain (`TEMPLATE_DOMAIN`) and can stage template upgrades.
- Stage flow: Builds a new root with updated pages, settings, files, and metadata; posts a CAR to the DService; returns a `prepTx` for `setContenthash`.
- Finalize flow: Clears local edits and updates internal state once the ENS transaction is confirmed.

### Common utilities (@simplepg/common)
- Location: `packages/common/`
- Role: Shared ENS resolution, contenthash conversions, IPLD helpers, and DService discovery.
- ENS: `resolveEnsDomain` queries the Universal Resolver for `contenthash`, `resolveEnsTextRecord` for `dservice` endpoints.
- IPLD: `emptyUnixfs`, `browserUnixfs`, `emptyCar`, and `walkDag` are used to build and traverse CARs.
- DService client: Reads the `dservice` text record from ENS, randomizes endpoints, and retries across them (current behavior treats 4xx responses as authoritative and does not retry).

### Node DService (@simplepg/node)
- Location: `packages/node/`
- Role: IPFS pinning/staging, blockchain indexing, and REST API.
- Multiple nodes: Multiple DService instances can be listed in the `dservice` text record; clients pick an endpoint at random and nodes are expected to proactively replicate/pin content via IPFS/MFS.
- API endpoints (`packages/node/src/api.js`):
  - `POST /page?domain=`: Uploads CAR, requires domain to be registered (subscription).
  - `GET /page?cid=`: Returns a lightweight CAR for a page.
  - `GET /file?cid=`: Returns a raw IPFS block.
  - `GET /history?domain=`: Returns a CAR containing publish history entries.
- IPFS service (`packages/node/src/services/ipfs.js`):
  - Imports CARs, pins staged/finalized content, stores metadata under `/spg-data/<chainId>/` in MFS.
  - Maintains allow/block lists and resolver caches.
  - Builds lightweight CARs for page fetch and constructs history CARs from `_prev` chains.
- Indexer (`packages/node/src/services/indexer.js`):
  - Watches SimplePage mint events (ERC721 `Transfer` from zero) to register domains.
  - Tracks ENS resolver changes and `ContenthashChanged` events to finalize pins.
  - Enforces allow/block list rules and keeps progress checkpoints in IPFS.

### CLI (@simplepg/cli)
- Location: `packages/cli/`
- Role: Publish directories/files and check subscription info.
- Flow: Builds a CAR from local files, posts to DService, prints the CID and instructions to set ENS `contenthash` manually.
- Subscription check: Reads the SimplePage contract directly to confirm at least one active unit before publish.

### Contracts
- Location: `contracts/`
- SimplePage (ERC721): Stores `PageData` with `domain` and `units[]` (expiry timestamps).
- SimplePageManager: Handles subscription payments; extends expiry and mints/updates SimplePage NFTs via `updateUnits`.
- TokenRenderer: Generates on-chain metadata for SimplePage NFTs.

## Repository data layout (IPFS root)
The repo root is a UnixFS directory whose key paths include:
- `/index.md` and `/index.html` (and per-page `/<path>/index.*`)
- `/_files/` user-uploaded assets (avatars and media)
- `settings.json` site settings
- `_prev/` previous root chain (history)
- `_template.html` base template
- `theme.css` generated from settings
- `manifest.json` + `manifest.webmanifest`
- `rss.xml` and `/feed` redirect
- `_redirects` generated from site paths

## Publish workflow

### Browser publish (default UX)
1. Frontend initializes `Repo` with the current ENS domain and DService endpoints.
2. Editing writes local changes to storage (`spg_edit_*` keys) and updates HTML previews.
3. `repo.stage(targetDomain, updateTemplate)`:
   - Builds a new root that includes edits, files, settings, theme, RSS, and redirects.
   - Copies the old root into `_prev/0` for history.
   - Uploads a CAR to the DService (`POST /page?domain=`).
   - Returns a `prepTx` for ENS `setContenthash`.
4. Frontend calls `writeContract(prepTx)`; once confirmed, `repo.finalizeCommit(cid)` updates local state.
5. The DService indexer sees `ContenthashChanged` and finalizes pins for the new CID.

### CLI publish
1. CLI builds a CAR from a file or directory.
2. CLI checks the SimplePage subscription on-chain.
3. CLI posts the CAR to DService and prints the CID.
4. User sets ENS `contenthash` manually (ENS Manager or other wallet flow).
5. Indexer finalizes the CID after the ENS update event.

### Subscription flow
1. Frontend calls `SimplePageManager.subscribe(domain, duration)`.
2. Contract mints or updates the SimplePage NFT and extends expiry.
3. Indexer sees the mint event and registers the domain, enabling DService uploads.

## Read/browse workflow
1. User visits `https://<name>.eth.link` (default gateway).
2. Gateway resolves ENS `contenthash` and serves IPFS content.
3. The frontend SPA loads with `meta[name="ens-domain"]` and renders pages from the repo root.

## DService discovery and overrides
- DService endpoints are read from the `dservice` text record on `new.simplepage.eth` and used as the canonical source for clients.
- If multiple endpoints are listed, clients randomize the order and try them sequentially; 4xx responses currently stop retries.
- Frontend and repo accept overrides via query params:
  - `ds-<ens-name>=<url>` for a custom DService endpoint.
  - `ds-rpc-<chainId>=<url>` for custom RPCs.

## Notes and constraints
- `eth.link` is the default gateway; Sepolia uses `.sepoliaens.eth.link`.
- `web3://` embeds are rendered as iframes using URL fragments to avoid gateway querystring restrictions.
- The DService only accepts uploads for domains it knows (created by indexer after subscription).
- Finalization is driven by ENS `ContenthashChanged` events and filtered by allow/block lists.
