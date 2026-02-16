import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'
import { parse, converter, formatHex } from 'culori'
import daisyuiThemes from 'daisyui/theme/object.js'
import { generateFoamSvg } from '@simplepg/foam-identicon'
import { FOAM_COLOR_VARS } from '@simplepg/foam-identicon/palette.js'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'public', 'images')

const seed = 'new.simplepage.eth'
const logoSize = 256
const faviconSize = 32
const lightTheme = process.env.LIGHT_THEME || 'light'
const darkTheme = process.env.DARK_THEME || 'dark'
const toRgb = converter('rgb')

const lightVars = daisyuiThemes[lightTheme]
const darkVars = daisyuiThemes[darkTheme]

if (!lightVars) {
  throw new Error(`Unknown DaisyUI theme: ${lightTheme}`)
}
if (!darkVars) {
  throw new Error(`Unknown DaisyUI theme: ${darkTheme}`)
}

const lightOverrides = buildPaletteOverrides(lightVars)
const darkOverrides = buildPaletteOverrides(darkVars)
const lightSvg = generateFoamSvg(seed, logoSize, { paletteOverrides: lightOverrides })
const darkSvg = generateFoamSvg(seed, logoSize, { paletteOverrides: darkOverrides })

const logoPng = renderSvg(lightSvg, logoSize)
const faviconLightPng = renderSvg(wrapSquircle(lightSvg, logoSize), faviconSize)
const faviconDarkPng = renderSvg(wrapSquircle(darkSvg, logoSize), faviconSize)

await writeFile(path.join(outputDir, 'logo.svg'), `${lightSvg}\n`)
await writeFile(path.join(outputDir, 'logo.png'), logoPng)
await writeFile(path.join(outputDir, 'favicon-light.png'), faviconLightPng)
await writeFile(path.join(outputDir, 'favicon-dark.png'), faviconDarkPng)

function renderSvg(svg, targetSize) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: targetSize,
    },
  })
  return resvg.render().asPng()
}

function buildPaletteOverrides(themeValues = {}) {
  const overrides = {}
  for (const cssVar of FOAM_COLOR_VARS) {
    const resolved = toHex(themeValues[cssVar])
    if (resolved) {
      overrides[cssVar] = resolved
    }
  }
  return overrides
}

function toHex(value) {
  if (!value) return null
  const color = parse(value)
  if (!color) return null
  const rgb = toRgb(color)
  if (!rgb) return null
  return formatHex(rgb)
}

function wrapSquircle(svg, targetSize) {
  const inner = svg
    .replace(/^<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
  const path = buildSquirclePath(targetSize, targetSize)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${targetSize}" height="${targetSize}" viewBox="0 0 ${targetSize} ${targetSize}">
  <defs>
    <clipPath id="squircleClip">
      <path d="${path}" />
    </clipPath>
  </defs>
  <g clip-path="url(#squircleClip)">
    ${inner}
  </g>
</svg>`
}

function buildSquirclePath(width, height, power = 4, steps = 96) {
  const a = width / 2
  const b = height / 2
  const cx = a
  const cy = b
  const exponent = 2 / power
  const points = []

  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = cx + Math.sign(cos) * Math.pow(Math.abs(cos), exponent) * a
    const y = cy + Math.sign(sin) * Math.pow(Math.abs(sin), exponent) * b
    points.push([x, y])
  }

  return points
    .map((point, index) => {
      const [x, y] = point
      const cmd = index === 0 ? 'M' : 'L'
      return `${cmd}${x.toFixed(3)} ${y.toFixed(3)}`
    })
    .join(' ') + ' Z'
}
