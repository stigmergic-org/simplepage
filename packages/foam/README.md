# @simplepg/foam-identicon

Procedural foam and bubble-style images generated from a text hash. The output is deterministic for the same input and options.

## Installation

```bash
pnpm add @simplepg/foam-identicon
```

## Usage

```javascript
import { generateFoamSvg, generateFoamDataUrl } from '@simplepg/foam-identicon'

const svg = generateFoamSvg('hello world', 512)
const dataUrl = generateFoamDataUrl('hello world', 256)

document.querySelector('img').src = dataUrl
```

## Preview script

```bash
pnpm --filter @simplepg/foam-identicon run preview
```

Optional args: `pnpm --filter @simplepg/foam-identicon run preview -- 12 360`.
Open `packages/foam/preview/index.html` to inspect 10 random samples, switch DaisyUI themes, and try the live input.

## Solidity parity

```bash
pnpm --filter @simplepg/foam-identicon test
```

## API

- `generateFoamSvg(seed, size)`
- `generateFoamDataUrl(seed, size)`

Defaults: DaisyUI light palette (via CSS variables with fallbacks), transparent background, 5-20 cells, subtle cell padding, and stroke width scales with size (5px at 512px). The sweep between ocean and sunset is internal and deterministic per seed.
If you inline the SVG in the DOM, it inherits DaisyUI theme variables. Data URLs fall back to the light palette.

## License

GPL-3.0-only
