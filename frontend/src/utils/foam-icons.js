import { generateFoamDataUrl, generateFoamSvg } from '@simplepg/foam-identicon'

const normalizeSeed = seed => String(seed ?? '')

export const buildFoamSvg = (seed, size = 18, options = {}) =>
  generateFoamSvg(normalizeSeed(seed), size, options)

export const buildFoamDataUrl = (seed, size = 72, options = {}) =>
  generateFoamDataUrl(normalizeSeed(seed), size, options)

export const generateFoamPngBytes = async (seed, size = 256, options = {}) => {
  const { mask = false, themeName, paletteOverrides, sourceSize } = options
  const seedText = normalizeSeed(seed)
  const baseSize = sourceSize || size
  const baseSvg = generateFoamSvg(seedText, baseSize)
  const overrides = paletteOverrides || (themeName ? resolvePaletteOverrides(baseSvg, themeName) : null)
  const svg = overrides ? generateFoamSvg(seedText, baseSize, { paletteOverrides: overrides }) : baseSvg
  return svgToPngBytes(svg, size, { mask })
}

export const imageUrlToPngBytes = async (url, size = 256, options = {}) => {
  if (!url) return null
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null
  }

  const response = await fetch(url)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await loadImage(objectUrl)
    return imageToPngBytes(image, size, options)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const maskPngBytes = async (bytes, size = 256) => {
  if (!bytes) return null
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null
  }

  const blob = new Blob([bytes], { type: 'image/png' })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await loadImage(objectUrl)
    return imageToPngBytes(image, size, { mask: true })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const svgToPngBytes = async (svg, size, options = {}) => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null
  }

  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  ctx.clearRect(0, 0, size, size)
  drawImageWithOptionalMask(ctx, image, size, size, options)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (blob) {
    const buffer = await blob.arrayBuffer()
    return new Uint8Array(buffer)
  }

  if (typeof canvas.toDataURL !== 'function' || typeof atob !== 'function') {
    return null
  }

  const data = canvas.toDataURL('image/png')
  const base64 = data.split(',')[1]
  if (!base64) {
    return null
  }

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const loadImage = src =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load foam icon'))
    image.src = src
  })

const resolvePaletteOverrides = (svg, themeName) => {
  if (typeof document === 'undefined') {
    return null
  }

  const vars = extractColorVars(svg)
  if (!vars.length) {
    return null
  }

  const root = document.documentElement
  if (!root) {
    return null
  }

  let probe = null
  let styles = null
  if (themeName) {
    if (!document.body) {
      styles = getComputedStyle(root)
    } else {
      probe = document.createElement('div')
      probe.setAttribute('data-theme', themeName)
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.pointerEvents = 'none'
      probe.style.width = '0'
      probe.style.height = '0'
      document.body.appendChild(probe)
      styles = getComputedStyle(probe)
    }
  } else {
    styles = getComputedStyle(root)
  }

  const swatch = document.createElement('span')
  swatch.style.position = 'absolute'
  swatch.style.visibility = 'hidden'
  swatch.style.pointerEvents = 'none'
  swatch.style.width = '0'
  swatch.style.height = '0'
  ;(probe || root).appendChild(swatch)

  const overrides = {}
  for (const varName of vars) {
    const raw = styles.getPropertyValue(varName).trim()
    if (!raw) {
      continue
    }
    swatch.style.color = `var(${varName})`
    const resolved = getComputedStyle(swatch).color
    overrides[varName] = resolved || raw
  }

  swatch.remove()
  if (probe) {
    probe.remove()
  }

  return Object.keys(overrides).length ? overrides : null
}

const extractColorVars = (svg) => {
  const vars = new Set()
  const regex = /var\((--color-[^)\s]+)\)/g
  let match = regex.exec(svg)
  while (match) {
    vars.add(match[1])
    match = regex.exec(svg)
  }
  return Array.from(vars)
}

const imageToPngBytes = async (image, size, options = {}) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  ctx.clearRect(0, 0, size, size)
  drawImageWithOptionalMask(ctx, image, size, size, options)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    return null
  }

  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

const drawImageCover = (ctx, image, width, height) => {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const dx = (width - drawWidth) / 2
  const dy = (height - drawHeight) / 2
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight)
}

const drawImageWithOptionalMask = (ctx, image, width, height, { mask = false } = {}) => {
  if (mask) {
    ctx.save()
    drawSquirclePath(ctx, width, height)
    ctx.clip()
    drawImageCover(ctx, image, width, height)
    ctx.restore()
    return
  }

  drawImageCover(ctx, image, width, height)
}

const drawSquirclePath = (ctx, width, height, power = 4) => {
  const a = width / 2
  const b = height / 2
  const cx = a
  const cy = b
  const steps = 96
  const exponent = 2 / power

  ctx.beginPath()
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = cx + Math.sign(cos) * Math.pow(Math.abs(cos), exponent) * a
    const y = cy + Math.sign(sin) * Math.pow(Math.abs(sin), exponent) * b
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.closePath()
}
