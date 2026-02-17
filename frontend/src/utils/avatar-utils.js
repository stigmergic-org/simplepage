import { generateFoamPngBytes, imageUrlToPngBytes, maskPngBytes } from './foam-icons'

const DEFAULT_AVATAR_SIZE = 256
const DEFAULT_FAVICON_SIZE = 32

export const readThemePreferences = async (repo) => {
  if (!repo) {
    return { light: 'light', dark: 'dark' }
  }
  const settings = await repo.settings.read()
  return {
    light: settings?.appearance?.theme?.light || 'light',
    dark: settings?.appearance?.theme?.dark || 'dark',
  }
}

const sanitizeEnsAvatarUrl = (url) => {
  if (!url) return url
  try {
    const u = new URL(url)
    if (u.hostname === 'euc.li') {
      // euc.li structure: /<network>/<name>
      // metadata structure: /<network>/avatar/<name>
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length === 2) {
        return `https://metadata.ens.domains/${parts[0]}/avatar/${parts[1]}`
      }
    }
  } catch (_e) {
    // ignore
  }
  return url
}

export const generateEnsArtifacts = async (
  url,
  avatarSize = DEFAULT_AVATAR_SIZE,
  faviconSize = DEFAULT_FAVICON_SIZE,
) => {
  const sanitizedUrl = sanitizeEnsAvatarUrl(url)
  const ensAvatarBytes = await imageUrlToPngBytes(sanitizedUrl, avatarSize)
  let ensFaviconBytes
  if (ensAvatarBytes) {
    ensFaviconBytes = await maskPngBytes(ensAvatarBytes, faviconSize)
    if (!ensFaviconBytes) {
      ensFaviconBytes = ensAvatarBytes
    }
  }
  return {
    ensAvatarBytes,
    ensFaviconBytes
  }
}

export const generateArtifactAssets = async ({
  domain,
  ensAvatar,
  lightTheme = 'light',
  darkTheme = 'dark',
  avatarSize = DEFAULT_AVATAR_SIZE,
  faviconSize = DEFAULT_FAVICON_SIZE,
}) => {
  let ensAvatarBytes = null
  let ensFaviconBytes = null

  if (ensAvatar) {
    try {
      const ensArtifacts = await generateEnsArtifacts(ensAvatar, avatarSize, faviconSize)
      ensAvatarBytes = ensArtifacts.ensAvatarBytes
      ensFaviconBytes = ensArtifacts.ensFaviconBytes
    } catch (avatarError) {
      console.warn('Failed to rasterize ENS avatar, falling back to foam icon.', avatarError)
    }
  }

  const foamAvatarBytes = await generateFoamPngBytes(domain, avatarSize, { themeName: lightTheme })
  const foamFaviconLightBytes = await generateFoamPngBytes(domain, faviconSize, {
    themeName: lightTheme,
    mask: true,
    sourceSize: avatarSize,
  })
  const foamFaviconDarkBytes = await generateFoamPngBytes(domain, faviconSize, {
    themeName: darkTheme,
    mask: true,
    sourceSize: avatarSize,
  })

  return {
    ensAvatarBytes,
    ensFaviconBytes,
    foamAvatarBytes,
    foamFaviconLightBytes,
    foamFaviconDarkBytes,
  }
}
