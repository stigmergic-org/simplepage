# @simplepg/cli

## 1.2.0

### Minor Changes

- d230576: Add off-chain draft/ref publishing with agent capabilities, including CLI draft commands, shared ref signing utilities, repo ref APIs, node ref/capability endpoints with peer sync, and frontend agents/drafts pages.
- 3d55d99: Add markdown repo draft workflows to the CLI, including new repo creation from the SimplePage template, draft push and checkout commands, draft-aware status and reset behavior, shared markdown rendering, and the new local repo state layout under `.simplepage/`.

### Patch Changes

- db81b69: Add a drafts review CLI command and refine the drafts page to respect domain query parameters, show latest drafts only, clarify publish targets, and disable publishing to new.simplepage.eth.
- aa8c1c3: Use SimplePage draft auth, review, and frontend flows from the published ENS site when available, keep an explicit fallback option for auth and review commands, and detect SimplePage sites from the root block via the file endpoint.
- Updated dependencies [d230576]
- Updated dependencies [3d55d99]
- Updated dependencies [aa8c1c3]
  - @simplepg/common@1.3.0
  - @simplepg/repo@1.6.0

## 1.1.0

### Minor Changes

- 73f2951: feat(cli): gitlike interface for local editing of repo markdown files

### Patch Changes

- Updated dependencies [7ac8e9e]
- Updated dependencies [251288a]
  - @simplepg/common@1.2.5

## 1.1.0-rc.0

### Minor Changes

- 73f2951: feat(cli): gitlike interface for local editing of repo markdown files

### Patch Changes

- Updated dependencies [7ac8e9e]
- Updated dependencies [251288a]
  - @simplepg/common@1.2.5-rc.0

## 1.0.9

### Patch Changes

- 46057f3: chore(node): rename dservice to node
- da82f8d: chore: bump all versions
- Updated dependencies [da82f8d]
  - @simplepg/common@1.2.4

## 1.0.9-rc.2

### Patch Changes

- da82f8d: chore: bump all versions
- Updated dependencies [da82f8d]
  - @simplepg/common@1.2.4-rc.0

## 1.0.9-rc.1

### Patch Changes

- 46057f3: chore(node): rename dservice to node

## 1.0.9-rc.0

### Patch Changes

- 46057f3: chore(node): rename dservice to node

## 1.0.8

### Patch Changes

- b5733ca: fix(cli): output proper domain for sepolia publish

## 1.0.7

### Patch Changes

- Updated dependencies [852303b]
  - @simplepg/common@1.2.3

## 1.0.6

### Patch Changes

- d6654e1: fix(cli,dservice): clean up shebang and json import for newer node versions
- Updated dependencies [d07df2b]
  - @simplepg/common@1.2.2

## 1.0.5

### Patch Changes

- f60a246: chore(cli): better instructions for how to update contenthash record

## 1.0.4

### Patch Changes

- Updated dependencies [238121d]
  - @simplepg/common@1.2.1

## 1.0.3

### Patch Changes

- Updated dependencies [f380720]
- Updated dependencies [c0d41d8]
- Updated dependencies [891e5cc]
  - @simplepg/common@1.2.0

## 1.0.2

### Patch Changes

- c1eea7b: Fix incorrect subscription link

## 1.0.1

### Patch Changes

- Updated dependencies [a2ba72a]
  - @simplepg/common@1.1.0

## 1.0.0

### Major Changes

- SimplePage Release v1

### Patch Changes

- Updated dependencies
  - @simplepg/common@1.0.0
