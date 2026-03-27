# @simplepg/node

## 1.5.0-rc.2

### Patch Changes

- 36f2149: chore(node): add logs for history endpoint

## 1.5.0-rc.1

### Patch Changes

- f5bd90a: fix(node): make peer discover not block node startup

## 1.5.0-rc.0

### Minor Changes

- b0b75be: feat(node): add peer discovery
- 44ae283: feat(node): Disallow uploads after subscription expiry

### Patch Changes

- 01f5361: fix(node): only allow fetching local blocks on /file endpoint
- e31a028: fix(node): improve history endpoint performance
- 0077765: fix(node): support .wei domains
- Updated dependencies [7ac8e9e]
- Updated dependencies [251288a]
  - @simplepg/common@1.2.5-rc.0

## 1.4.0

### Minor Changes

- 63a53a0: feat(node): add history endpoint
- e1ed787: feat(node): support names that change resolvers

### Patch Changes

- ba0e9a1: chore(node): MFS based state management
- 5d168fc: chore(node): network specific storage
- e2b824a: chore(node): added ratelimit on page uploads
- 1810149: fix(node): more resilient pinning during indexing
- 108c010: fix(node): make cors more strict
- 37766fe: chore(node): relax rate limits
- 82ed0ac: fix(node): more efficient resolver management
- 46057f3: chore(node): rename dservice to node
- da82f8d: chore: bump all versions
- fe87c7e: fix(node): limit max resolvers in single request
- 0b3f96c: fix(node): fetch less logs at the same time
- 192e770: fix:(node): add flag to set block interval for indexing
- a8b9fbd: fix(node): add option to disable DHT provide
- 9cdaa30: feat: history, partial impl
- Updated dependencies [da82f8d]
  - @simplepg/common@1.2.4

## 1.4.0-rc.8

### Patch Changes

- fe87c7e: fix(node): limit max resolvers in single request

## 1.4.0-rc.7

### Patch Changes

- 37766fe: chore(node): relax rate limits

## 1.4.0-rc.6

### Patch Changes

- e2b824a: chore(node): added ratelimit on page uploads
- 108c010: fix(node): make cors more strict
- 82ed0ac: fix(node): more efficient resolver management

## 1.4.0-rc.5

### Patch Changes

- 192e770: fix:(node): add flag to set block interval for indexing
- a8b9fbd: fix(node): add option to disable DHT provide

## 1.4.0-rc.4

### Patch Changes

- 0b3f96c: fix(node): fetch less logs at the same time

## 1.4.0-rc.3

### Patch Changes

- 9cdaa30: feat: history, partial impl

## 1.4.0-rc.2

### Patch Changes

- da82f8d: chore: bump all versions
- Updated dependencies [da82f8d]
  - @simplepg/common@1.2.4-rc.0

## 1.4.0-rc.1

### Minor Changes

- 63a53a0: feat(node): add history endpoint
- e1ed787: feat(node): support names that change resolvers

### Patch Changes

- ba0e9a1: chore(node): MFS based state management
- 5d168fc: chore(node): network specific storage
- 1810149: fix(node): more resilient pinning during indexing
- 46057f3: chore(node): rename dservice to node

## 1.4.0-rc.0

### Minor Changes

- 63a53a0: feat(node): add history endpoint
- e1ed787: feat(node): support names that change resolvers

### Patch Changes

- ba0e9a1: chore(node): MFS based state management
- 5d168fc: chore(node): network specific storage
- 1810149: fix(node): more resilient pinning during indexing
- 46057f3: chore(node): rename dservice to node

## 1.3.5

### Patch Changes

- b5733ca: fix(dservice): output network on startup

## 1.3.4

### Patch Changes

- 8136c8d: chore(frontend): add loading indicator to publish button
- b0ceb28: fix(dservice): don't stall on invalid onchain CIDs
- Updated dependencies [852303b]
  - @simplepg/common@1.2.3

## 1.3.3

### Patch Changes

- c063484: fix(dservice): require subscription on CAR upload, and timeout on invalid CARs
- 2950d36: fix(dservice): readCarLite now returns all files in root
- d6654e1: fix(cli,dservice): clean up shebang and json import for newer node versions
- f04bdc1: fix(dservice): more resilient openapi generation
- 011d4d1: fix(dservice): file upload size limit
- Updated dependencies [d07df2b]
  - @simplepg/common@1.2.2

## 1.3.2

### Patch Changes

- Updated dependencies [238121d]
  - @simplepg/common@1.2.1

## 1.3.1

### Patch Changes

- 9a127d1: fix(dservice): don't exit if finalization fails

## 1.3.0

### Minor Changes

- c0d41d8: feat(dservice,repo): support files

### Patch Changes

- 5978b35: fix(dservice): less verbose default stdout logging
- ddb0b24: fix(dservice): include manifest.json in readCarLite
- Updated dependencies [f380720]
- Updated dependencies [c0d41d8]
- Updated dependencies [891e5cc]
  - @simplepg/common@1.2.0

## 1.2.0

### Minor Changes

- 5d069e2: feat(dservice): persist last indexed block
- 63f95e7: feat(dservice): ensure page data is provided to DHT on finalization

## 1.1.4

### Patch Changes

- Updated dependencies [a2ba72a]
  - @simplepg/common@1.1.0

## 1.1.0

### Minor Changes

- Dservice: add missing features for production deployment

## 1.0.0

### Major Changes

- SimplePage Release v1

### Patch Changes

- Updated dependencies
  - @simplepg/common@1.0.0
