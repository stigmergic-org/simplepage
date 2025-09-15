# @simplepg/frontend

## 1.5.1

### Patch Changes

- 5bd72b7: fix(frontend): proper icon fallback and tailwind classes
- 90188be: fix(repo,frontend): properly order navigation items in sidebar
- 4ca47e3: fix(frontend): don't break when root page isn't in sidebar nav
- 1d24e9c: fix(frontend): apply syntax highlighting properly
- 6358f4c: fix(frontend): sidebar can now scroll to last content
- abc6389: fix(frontedn): search now prooperly navigates to headings
- Updated dependencies [90188be]
  - @simplepg/repo@1.3.1

## 1.5.0

### Minor Changes

- 6cfcbcd: feat(frontend,repo): add theming support
- 6e41c82: feat(frontend,repo): add ability to clear local data in settings"
- 7e6c880: feat(frontend): show a notice when subscription is about to expire
- e92aa89: feat(frontend,repo): add support for table of contents sidebar
- fe14993: feat(frontend,repo): add fork button style to settings
- 5c7946a: feat(frontend,repo): add support for navigation sidebar
- 182f998: feat(frontend): add search functionality

### Patch Changes

- 6a64d23: chore(frontend): warn users if DService or RPCs are unavailable
- 2d3776e: fix(frontend): better dservice and rpc fallback parsing (now supports urls w/o http prefix)
- 5d548c2: feat(repo): add support for nexted keys in settings
- Updated dependencies [e8dd7fa]
- Updated dependencies [6cfcbcd]
- Updated dependencies [2950d36]
- Updated dependencies [6e41c82]
- Updated dependencies [d07df2b]
- Updated dependencies [fe3e150]
- Updated dependencies [e92aa89]
- Updated dependencies [fe14993]
- Updated dependencies [5d548c2]
- Updated dependencies [5c7946a]
  - @simplepg/repo@1.3.0
  - @simplepg/common@1.2.2

## 1.4.0

### Minor Changes

- 4c4d7a3: feat(frontend): code syntax highlighting
- f612667: feat(repo,frontend): better social previews, based on avatar and first img

### Patch Changes

- 2b8825a: feat(repo,frontend): persist avatar for more consistent favicon experience
- af38d06: fix(repo,frontend): don't forget edits when website is updated
- ef3328a: fix(frontend): handle non-CID contenthash, inform on incorrect manager setting
- 948d32f: fix(frontend): remember added domains on publish page
- dee85f8: fix(frontend): don't rewrite /spg- links in preview mode
- 319895a: chore(frontend): move subscription page to navbar menu in edit mode
- 44d5865: fix(frontend): better avatar filetype detection
- Updated dependencies [2b8825a]
- Updated dependencies [af38d06]
- Updated dependencies [f612667]
- Updated dependencies [44d5865]
- Updated dependencies [c1233e3]
  - @simplepg/repo@1.2.0

## 1.3.3

### Patch Changes

- 68340ec: fix(frontend): frontmatter parsing bug
- Updated dependencies [238121d]
  - @simplepg/common@1.2.1
  - @simplepg/repo@1.1.3

## 1.3.2

### Patch Changes

- Updated dependencies [aa322f2]
- Updated dependencies [af97146]
- Updated dependencies [69b85aa]
  - @simplepg/repo@1.1.2

## 1.3.1

### Patch Changes

- Updated dependencies [6da46cc]
  - @simplepg/repo@1.1.1

## 1.3.0

### Minor Changes

- 0d408f2: feat(frontend): uploading and using files
- 7520690: feat(frontend): better navigation with tabs
- 065025b: feat(frontend): revert edits on pages page

### Patch Changes

- 56df1c5: fix(frontend): allow publishing 0 changes when updating template
- 19d4b9b: chore(frontend): improve icons
- ad13371: fix(frontend): dark mode ui adjustments
- 8abf65a: fix(frontend): don't wait for css to render content
- 1343781: fix(frontend): better title management
- Updated dependencies [f380720]
- Updated dependencies [c0d41d8]
- Updated dependencies [891e5cc]
  - @simplepg/common@1.2.0
  - @simplepg/repo@1.1.0

## 1.2.0

### Minor Changes

- 1da69e9: feat(frontend): add quit editor menu option

### Patch Changes

- 1f7dec1: fix(repo,frontend): webmanifest safe.global app compatibility
- 6e3088f: fix(frontend): disable publish when not ENS owner
- ae9fcb0: fix(frontend): increase fork button size
- 1da69e9: fix(frontend): improved handling of url in navbar
- 70c8e83: fix(frontend): only allow transactions on correct network
- Updated dependencies [b22e128]
- Updated dependencies [1f7dec1]
  - @simplepg/repo@1.0.2

## 1.1.1

### Patch Changes

- a2d1661: fix(frontend): can now subscribe to new.simplepage.eth

## 1.1.0

### Minor Changes

- a2ba72a: fix(repo): should initialize without template root
  feat(frontend): show publish button on preview page
  fix(frontend): can now publish to subnames
  fix(frontend): padding on mobile
  feat(frontend): rainbow style on fork button
- 6d0b535: Add support for dservice and rpc query param overrides

### Patch Changes

- Updated dependencies [a2ba72a]
  - @simplepg/common@1.1.0
  - @simplepg/repo@1.0.1

## 1.0.0

### Major Changes

- SimplePage Release v1

### Patch Changes

- Updated dependencies
  - @simplepg/common@1.0.0
  - @simplepg/repo@1.0.0
