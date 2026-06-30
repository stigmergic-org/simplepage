# @simplepg/common

## 1.3.0

### Minor Changes

- d230576: Add off-chain draft/ref publishing with agent capabilities, including CLI draft commands, shared ref signing utilities, repo ref APIs, node ref/capability endpoints with peer sync, and frontend agents/drafts pages.

### Patch Changes

- 3d55d99: Add markdown repo draft workflows to the CLI, including new repo creation from the SimplePage template, draft push and checkout commands, draft-aware status and reset behavior, shared markdown rendering, and the new local repo state layout under `.simplepage/`.
- aa8c1c3: Use SimplePage draft auth, review, and frontend flows from the published ENS site when available, keep an explicit fallback option for auth and review commands, and detect SimplePage sites from the root block via the file endpoint.

## 1.2.5

### Patch Changes

- 7ac8e9e: fix(frontend): make it possible to revert to a previous version
- 251288a: chore(contracts): deploy TokenRendererV3

## 1.2.5-rc.0

### Patch Changes

- 7ac8e9e: fix(frontend): make it possible to revert to a previous version
- 251288a: chore(contracts): deploy TokenRendererV3

## 1.2.4

### Patch Changes

- da82f8d: chore: bump all versions

## 1.2.4-rc.0

### Patch Changes

- da82f8d: chore: bump all versions

## 1.2.3

### Patch Changes

- 852303b: fix(repo): use avatar as webapp manifest icon

## 1.2.2

### Patch Changes

- d07df2b: chore(common): deploy updated token renderer (nicer looking simplepage NFTs)

## 1.2.1

### Patch Changes

- 238121d: fix(common): properly resolve owner on wrapped ENS names

## 1.2.0

### Minor Changes

- c0d41d8: feat(dservice,repo): support files
- 891e5cc: feat(common): implement persistent and performant blockstore

### Patch Changes

- f380720: fix(repo,common): use unixfs to track files changes

## 1.1.0

### Minor Changes

- a2ba72a: Support fetching ENS name owner

## 1.0.0

### Major Changes

- SimplePage Release v1
