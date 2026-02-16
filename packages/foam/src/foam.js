import { keccak_256 } from '@noble/hashes/sha3'
import { utf8ToBytes } from '@noble/hashes/utils'

const DEFAULT_SIZE = 512
const MIN_SIZE = 16

const FP = 10000n
const FP_HALF = FP / 2n
const TWO_POW_64 = 1n << 64n
const MASK_64 = TWO_POW_64 - 1n
const RNG_MULT = 2685821657736338717n

const CELL_MIN = 5n
const CELL_MAX = 9n
const MAX_VERTICES = 40
const JITTER_FP = 4500n
const SIMPLIFY_NUM = 10n
const SIMPLIFY_DEN = 100n
const EDGE_FRACTION_NUM = 18n
const EDGE_FRACTION_DEN = 100n
const MARGIN_NUM = 3n
const MARGIN_DEN = 100n
const MIN_MARGIN = 4n

const STROKE_BASE = 8n
const STROKE_OPACITY_FP = 2200n
const INSET_MIN_FP = 3500n
const INSET_RATIO_NUM = 5n
const INSET_RATIO_DEN = 100n
const INSET_LIMIT_NUM = 45n
const INSET_LIMIT_DEN = 100n

const GRADIENT_JITTER_FP = 600n
const PALETTE_JITTER_FP = 1800n

const DIRS = [
  [1n, 0n],
  [0n, 1n],
  [1n, 1n],
  [-1n, 1n],
  [1n, -1n],
  [-1n, 0n],
  [0n, -1n],
  [-1n, -1n],
]

const COLOR_PRIMARY = 'var(--color-primary)'
const COLOR_SECONDARY = 'var(--color-secondary)'
const COLOR_ACCENT = 'var(--color-accent)'
const COLOR_INFO = 'var(--color-info)'
const COLOR_SUCCESS = 'var(--color-success)'
const COLOR_WARNING = 'var(--color-warning)'
const COLOR_ERROR = 'var(--color-error)'
const STROKE_COLOR = 'var(--color-base-content)'

const PALETTE_OCEAN = [
  COLOR_INFO,
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_SECONDARY,
  COLOR_SUCCESS,
  COLOR_WARNING,
  COLOR_ERROR,
]

const PALETTE_SUNSET = [
  COLOR_WARNING,
  COLOR_ERROR,
  COLOR_SECONDARY,
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_INFO,
  COLOR_SUCCESS,
]

export function generateFoamSvg(seed, size = DEFAULT_SIZE, options = {}) {
  const seedText = String(seed ?? '')
  const pixelSize = resolveSize(size)
  const rng = createRng(seedText)

  const useOcean = (nextUint(rng) & 1n) === 0n
  const palette = useOcean ? PALETTE_OCEAN : PALETTE_SUNSET

  const cellCount = randInt(rng, CELL_MIN, CELL_MAX)
  const dirIndex = Number(randInt(rng, 0n, BigInt(DIRS.length - 1)))
  const gradient = createGradient(pixelSize, DIRS[dirIndex][0], DIRS[dirIndex][1])

  const sizeFp = BigInt(pixelSize) * FP
  const strokeWidth = (STROKE_BASE * BigInt(pixelSize) * FP) / BigInt(DEFAULT_SIZE)
  const spacing = isqrt((sizeFp * sizeFp) / cellCount)
  const insetFromSpacing = (spacing * INSET_RATIO_NUM) / INSET_RATIO_DEN
  const strokeInset = strokeWidth / 2n
  const cellInset = maxBig(INSET_MIN_FP, maxBig(strokeInset, insetFromSpacing))
  const margin = maxBig(
    MIN_MARGIN,
    (BigInt(pixelSize) * MARGIN_NUM) / MARGIN_DEN
  )
  const marginFp = margin * FP

  const points = generatePoints(rng, pixelSize, Number(cellCount), margin, marginFp)
  const frameInset = strokeWidth / 2n
  const cells = buildCells(points, sizeFp, rng, palette, gradient, cellInset, frameInset)

  const svg = buildSvg(pixelSize, strokeWidth, cells)
  return applyPaletteOverrides(svg, options.paletteOverrides)
}

export function generateFoamDataUrl(seed, size = DEFAULT_SIZE, options = {}) {
  const svg = generateFoamSvg(seed, size, options)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function applyPaletteOverrides(svg, paletteOverrides) {
  if (!paletteOverrides) {
    return svg
  }
  let output = svg
  for (const [key, value] of Object.entries(paletteOverrides)) {
    if (!value) {
      continue
    }
    const token = `var(${key})`
    output = output.split(token).join(value)
  }
  return output
}

function resolveSize(value) {
  const parsed = Number.isFinite(value) ? Math.round(value) : DEFAULT_SIZE
  return Math.max(MIN_SIZE, parsed)
}

function createRng(seedText) {
  const hash = keccak256Bytes(seedText)
  let state = 0n
  for (let i = 24; i < 32; i += 1) {
    state = (state << 8n) | BigInt(hash[i])
  }
  if (state === 0n) {
    state = 1n
  }
  return { state }
}

function nextUint(rng) {
  let x = rng.state
  x ^= x >> 12n
  x ^= (x << 25n) & MASK_64
  x ^= x >> 27n
  x &= MASK_64
  rng.state = x
  return (x * RNG_MULT) & MASK_64
}

function randInt(rng, min, max) {
  if (max <= min) {
    return min
  }
  const range = max - min + 1n
  return min + (nextUint(rng) % range)
}

function randFixed(rng, min, max) {
  if (max <= min) {
    return min
  }
  const range = max - min
  const value = (nextUint(rng) * range) / TWO_POW_64
  return min + value
}

function randSigned(rng, magnitude) {
  if (magnitude <= 0n) {
    return 0n
  }
  return randFixed(rng, -magnitude, magnitude)
}

function generatePoints(rng, size, count, margin, marginFp) {
  const usable = Math.max(1, size - Number(margin) * 2)
  const area = BigInt(usable) * BigInt(usable)
  const spacing = Number(isqrt(area / BigInt(count))) || 1

  const cols = Math.max(2, Math.floor(usable / spacing))
  const rows = Math.max(2, Math.floor(usable / spacing))
  const cellWidth = Math.max(1, Math.floor(usable / cols))
  const cellHeight = Math.max(1, Math.floor(usable / rows))

  const cellWidthFp = BigInt(cellWidth) * FP
  const cellHeightFp = BigInt(cellHeight) * FP
  const jitterX = (cellWidthFp * JITTER_FP) / FP
  const jitterY = (cellHeightFp * JITTER_FP) / FP

  const points = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let x =
        marginFp +
        BigInt(col) * cellWidthFp +
        cellWidthFp / 2n +
        randSigned(rng, jitterX)
      let y =
        marginFp +
        BigInt(row) * cellHeightFp +
        cellHeightFp / 2n +
        randSigned(rng, jitterY)

      const maxCoord = BigInt(size) * FP - marginFp
      x = clampBig(x, marginFp, maxCoord)
      y = clampBig(y, marginFp, maxCoord)
      points.push([x, y])
    }
  }

  if (points.length > count) {
    shuffle(points, rng)
    points.length = count
  }

  while (points.length < count) {
    const x = randFixed(rng, marginFp, BigInt(size) * FP - marginFp)
    const y = randFixed(rng, marginFp, BigInt(size) * FP - marginFp)
    points.push([x, y])
  }

  return points
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Number(randInt(rng, 0n, BigInt(i)))
    const temp = list[i]
    list[i] = list[j]
    list[j] = temp
  }
}

function createGradient(size, dirX, dirY) {
  const sizeFp = BigInt(size) * FP
  const corners = [
    [0n, 0n],
    [sizeFp, 0n],
    [sizeFp, sizeFp],
    [0n, sizeFp],
  ]
  let min = null
  let max = null
  for (const corner of corners) {
    const proj = dirX * corner[0] + dirY * corner[1]
    if (min === null || proj < min) {
      min = proj
    }
    if (max === null || proj > max) {
      max = proj
    }
  }

  return { dirX, dirY, min: min ?? 0n, max: max ?? 1n }
}

function buildCells(points, sizeFp, rng, palette, gradient, cellInset, frameInset) {
  const cells = []
  const count = points.length
  const area = sizeFp * sizeFp
  const spacing = isqrt(area / BigInt(count))
  const simplifyThreshold = (spacing * SIMPLIFY_NUM) / SIMPLIFY_DEN

  for (let i = 0; i < count; i += 1) {
    let poly = [
      [0n, 0n],
      [sizeFp, 0n],
      [sizeFp, sizeFp],
      [0n, sizeFp],
    ]

    const site = points[i]
    for (let j = 0; j < count; j += 1) {
      if (i === j) {
        continue
      }
      const other = points[j]
      const nx = other[0] - site[0]
      const ny = other[1] - site[1]
      const c =
        (other[0] * other[0] + other[1] * other[1] - site[0] * site[0] - site[1] * site[1]) /
        2n

      poly = clipPolygon(poly, nx, ny, c)
      if (poly.length < 3) {
        break
      }
    }

    if (poly.length < 3) {
      continue
    }

    const insetPoly = insetPolygonByEdges(poly, cellInset)
    if (insetPoly.length < 3) {
      continue
    }
    const snapped = snapPolygonToFrame(insetPoly, sizeFp, frameInset, cellInset)
    const simplified = simplifyPolygon(snapped, simplifyThreshold)
    if (simplified.length < 3) {
      continue
    }
    const centroid = polygonCentroid(simplified)
    const fill = colorForCell(centroid, palette, gradient, rng)
    const path = buildRoundedPath(simplified, EDGE_FRACTION_NUM, EDGE_FRACTION_DEN)
    cells.push({ path, fill })
  }

  return cells
}

function clipPolygon(polygon, nx, ny, c) {
  const output = []
  const len = polygon.length
  if (len < 3) {
    return output
  }

  for (let i = 0; i < len; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % len]
    const aInside = nx * a[0] + ny * a[1] <= c
    const bInside = nx * b[0] + ny * b[1] <= c

    if (aInside && bInside) {
      if (output.length >= MAX_VERTICES) break
      output.push(b)
    } else if (aInside && !bInside) {
      if (output.length >= MAX_VERTICES) break
      output.push(intersect(a, b, nx, ny, c))
    } else if (!aInside && bInside) {
      if (output.length >= MAX_VERTICES) break
      output.push(intersect(a, b, nx, ny, c))
      if (output.length >= MAX_VERTICES) break
      output.push(b)
    }
  }

  return output
}

function intersect(a, b, nx, ny, c) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const denom = nx * dx + ny * dy
  if (denom === 0n) {
    return [a[0], a[1]]
  }
  const t = c - (nx * a[0] + ny * a[1])
  return [
    a[0] + mulDiv(dx, t, denom),
    a[1] + mulDiv(dy, t, denom),
  ]
}

function polygonCentroid(points) {
  let area = 0n
  let cx = 0n
  let cy = 0n
  const count = points.length

  for (let i = 0; i < count; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % count]
    const cross = x1 * y2 - x2 * y1
    area += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }

  if (area === 0n) {
    return points[0]
  }

  const denom = 6n * area
  return [cx / denom, cy / denom]
}

function insetPolygonByEdges(points, inset) {
  if (!points.length || inset <= 0n) {
    return points
  }

  const area = polygonArea(points)
  const isCcW = area >= 0n
  let minEdge = null

  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const len = isqrt(dx * dx + dy * dy)
    if (len > 0n && (minEdge === null || len < minEdge)) {
      minEdge = len
    }
  }

  if (!minEdge || minEdge <= 0n) {
    return points
  }

  const maxInset = (minEdge * INSET_LIMIT_NUM) / INSET_LIMIT_DEN
  const appliedInset = inset > maxInset ? maxInset : inset
  if (appliedInset <= 0n) {
    return points
  }

  let clipped = points
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    if (dx === 0n && dy === 0n) {
      continue
    }

    const nx = isCcW ? dy : -dy
    const ny = isCcW ? -dx : dx
    const len = isqrt(dx * dx + dy * dy)
    if (len === 0n) {
      continue
    }

    const c = nx * p1[0] + ny * p1[1]
    const cInset = c - appliedInset * len
    clipped = clipPolygon(clipped, nx, ny, cInset)
    if (clipped.length < 3) {
      return []
    }
  }

  return clipped
}

function snapPolygonToFrame(points, sizeFp, frameInset, snapThreshold) {
  if (!points.length || frameInset <= 0n || snapThreshold <= 0n) {
    return points
  }
  const maxLine = sizeFp - frameInset
  if (maxLine <= frameInset) {
    return points
  }
  const minSnap = snapThreshold
  const maxSnap = sizeFp - snapThreshold

  const snapped = new Array(points.length)
  for (let i = 0; i < points.length; i += 1) {
    let x = points[i][0]
    let y = points[i][1]

    if (x <= minSnap) {
      x = frameInset
    } else if (x >= maxSnap) {
      x = maxLine
    }

    if (y <= minSnap) {
      y = frameInset
    } else if (y >= maxSnap) {
      y = maxLine
    }

    snapped[i] = [x, y]
  }

  return snapped
}


function polygonArea(points) {
  let area = 0n
  const count = points.length
  for (let i = 0; i < count; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % count]
    area += x1 * y2 - x2 * y1
  }
  return area
}

function simplifyPolygon(points, threshold) {
  if (!points.length || threshold <= 0n) {
    return points
  }

  const result = []
  result.push(points[0])

  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const dx = curr[0] - prev[0]
    const dy = curr[1] - prev[1]
    const dist = isqrt(dx * dx + dy * dy)
    if (dist < threshold) {
      continue
    }
    result.push(curr)
  }

  if (result.length >= 3) {
    const first = result[0]
    const last = result[result.length - 1]
    const dx = last[0] - first[0]
    const dy = last[1] - first[1]
    const dist = isqrt(dx * dx + dy * dy)
    if (dist < threshold && result.length > 3) {
      result.pop()
    }
  }

  return result.length >= 3 ? result : points
}

function buildRoundedPath(points, ratioNum, ratioDen) {
  if (points.length < 3) {
    return buildPolygonPath(points)
  }

  const denom = ratioDen > 0n ? ratioDen : 1n
  const maxNum = denom / 2n
  const num = ratioNum > maxNum ? maxNum : ratioNum
  if (num <= 0n) {
    return buildPolygonPath(points)
  }

  const count = points.length
  const entries = new Array(count)
  const exits = new Array(count)

  for (let i = 0; i < count; i += 1) {
    const prev = points[(i - 1 + count) % count]
    const curr = points[i]
    const next = points[(i + 1) % count]
    const cornerNum = cornerRatioNum(prev, curr, next, num)
    entries[i] = [
      curr[0] + mulDiv(prev[0] - curr[0], cornerNum, denom),
      curr[1] + mulDiv(prev[1] - curr[1], cornerNum, denom),
    ]
    exits[i] = [
      curr[0] + mulDiv(next[0] - curr[0], cornerNum, denom),
      curr[1] + mulDiv(next[1] - curr[1], cornerNum, denom),
    ]
  }

  const parts = [`M ${formatPoint(entries[0])}`]
  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      parts.push(`L ${formatPoint(entries[i])}`)
    }
    parts.push(`Q ${formatPoint(points[i])} ${formatPoint(exits[i])}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function cornerRatioNum(prev, curr, next, num) {
  const vx1 = prev[0] - curr[0]
  const vy1 = prev[1] - curr[1]
  const vx2 = next[0] - curr[0]
  const vy2 = next[1] - curr[1]
  const len1 = isqrt(vx1 * vx1 + vy1 * vy1)
  const len2 = isqrt(vx2 * vx2 + vy2 * vy2)
  const cosDen = len1 * len2
  if (cosDen <= 0n) {
    return num
  }
  const dot = vx1 * vx2 + vy1 * vy2
  let oneMinusCos = cosDen - dot
  if (oneMinusCos < 0n) {
    oneMinusCos = 0n
  }
  let value = (oneMinusCos * FP) / (2n * cosDen)
  if (value > FP) {
    value = FP
  }
  const scaleFp = isqrt(value * FP)
  return (num * scaleFp) / FP
}

function buildPolygonPath(points) {
  if (!points.length) {
    return ''
  }
  const parts = [`M ${formatPoint(points[0])}`]
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L ${formatPoint(points[i])}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function colorForCell(centroid, palette, gradient, rng) {
  const proj = gradient.dirX * centroid[0] + gradient.dirY * centroid[1]
  const span = gradient.max - gradient.min || 1n
  let t = ((proj - gradient.min) * FP) / span
  t = clampBig(t + randSigned(rng, GRADIENT_JITTER_FP), 0n, FP)

  const adjusted = clampBig(t + randSigned(rng, PALETTE_JITTER_FP), 0n, FP - 1n)
  const index = Number((adjusted * BigInt(palette.length)) / FP)
  return palette[index]
}

function buildSvg(size, strokeWidth, cells) {
  const strokeOpacity = formatFixed(STROKE_OPACITY_FP)
  const strokeWidthValue = formatFixed(strokeWidth)

  const parts = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">`
  )
  parts.push(
    `<g stroke="${STROKE_COLOR}" stroke-width="${strokeWidthValue}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round" stroke-linecap="round">`
  )
  for (const cell of cells) {
    parts.push(`<path d="${cell.path}" fill="${cell.fill}"/>`)
  }
  parts.push('</g></svg>')
  return parts.join('')
}

function formatPoint(point) {
  return `${formatFixed(point[0])} ${formatFixed(point[1])}`
}

function formatFixed(value) {
  const neg = value < 0n
  const abs = neg ? -value : value
  const scaled = (abs * 100n + FP_HALF) / FP
  let intPart = scaled / 100n
  let frac = scaled % 100n

  if (frac >= 100n) {
    intPart += 1n
    frac -= 100n
  }

  const fracText = frac.toString().padStart(2, '0')
  return `${neg ? '-' : ''}${intPart.toString()}.${fracText}`
}

function clampBig(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function maxBig(a, b) {
  return a > b ? a : b
}

function mulDiv(a, b, denom) {
  if (denom === 0n) {
    return 0n
  }
  return (a * b) / denom
}

function isqrt(value) {
  if (value <= 0n) {
    return 0n
  }
  let x0 = value
  let x1 = (x0 + 1n) >> 1n
  while (x1 < x0) {
    x0 = x1
    x1 = (x1 + value / x1) >> 1n
  }
  return x0
}

function keccak256Bytes(message) {
  const bytes =
    typeof message === 'string'
      ? utf8ToBytes(message)
      : message instanceof Uint8Array
        ? message
        : new Uint8Array(message)
  return keccak_256(bytes)
}
