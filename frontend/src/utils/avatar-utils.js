import { generateFoamPngBytes, imageUrlToPngBytes, maskPngBytes } from './foam-icons'

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

export const generateArtifactAssets = async ({
  domain,
  ensAvatar,
  lightTheme = 'light',
  darkTheme = 'dark',
  avatarSize = 256,
  faviconSize = 32,
}) => {
  let ensAvatarBytes = null
  let ensFaviconBytes = null

  if (ensAvatar) {
    try {
      ensAvatarBytes = await imageUrlToPngBytes(ensAvatar, avatarSize)
      if (ensAvatarBytes) {
        ensFaviconBytes = await maskPngBytes(ensAvatarBytes, faviconSize)
        if (!ensFaviconBytes) {
          ensFaviconBytes = ensAvatarBytes
        }
      }
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
