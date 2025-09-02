export function populateTemplate(templateHtml, body, targetDomain, path, { title, description } = {}, avatarPath = null) {
    const parser = new DOMParser()
    const templateDoc = parser.parseFromString(templateHtml, 'text/html')
    const rootElem = templateDoc.getElementById('content-container')
    rootElem.innerHTML = body

    const populateUrl = (path) => [`https://${targetDomain}.link`, ...(path.split('/').filter(Boolean))].join('/')
    const select = (name, isProp = false) => templateDoc.querySelector(`meta[${isProp ? 'property' : 'name'}="${name}"`)
    const setMeta = (name, content, isProp = false) => {
      select(name, isProp)?.setAttribute('content', content)
    }

    const titleText = title || targetDomain
    const descriptionText = description || `A SimplePage by ${targetDomain}`
    const url = populateUrl(path)

    // HTML meta
    const titleElement = templateDoc.querySelector('title')
    titleElement.textContent = titleText
    setMeta('description', descriptionText)
    setMeta('ens-domain', targetDomain)

    // set favicon
    const faviconElement = templateDoc.querySelector('link[rel="icon"]')
    let imageUrl = populateUrl(faviconElement.href)
    if (avatarPath) {
      faviconElement.setAttribute('href', avatarPath)
      imageUrl = populateUrl(avatarPath)
    }
    let twitterCardType = 'summary'
    // Check if body has any img tags and use the first one for social media
    const firstImgSrc = rootElem.querySelector('img')?.getAttribute('src')
    if (firstImgSrc) {
      imageUrl = populateUrl(firstImgSrc)
      twitterCardType = 'summary_large_image'
    }

    // Open Graph
    setMeta('og:url', url, true)
    setMeta('og:title', titleText, true)
    setMeta('og:description', descriptionText, true)
    if (imageUrl) setMeta('og:image', imageUrl, true)
    setMeta('og:site_name', targetDomain, true)

    // Twitter
    setMeta('twitter:card', twitterCardType)
    setMeta('twitter:domain', `${targetDomain}.link`)
    setMeta('twitter:url', url)
    setMeta('twitter:title', titleText)
    setMeta('twitter:description', descriptionText)
    if (imageUrl) setMeta('twitter:image', imageUrl)

    return `<!DOCTYPE html>\n${templateDoc.documentElement.outerHTML}`;
}

export function populateManifest(domain, { title, description } = {}) {
  const manifest = {
    name: title || domain,
    short_name: domain,
    description: description || `A SimplePage by ${domain}`,
    icons: [
      {
        src: "/_assets/images/logo.svg",
        sizes: "192x192",
        type: "image/svg+xml"
      }
    ],
    dapp_repository: "https://github.com/stigmergic-org/simplepage",
    dapp_contracts: []
  }
  return JSON.stringify(manifest)
}



/** -----------------------------------------------
 * Minimal server-side theme variables for theme.css
 * ---------------------------------------------- */
const THEME_VARS = {
  light: {
    '--b1': '255 255 255',
    '--bc': '0 0 0',
    '--p':  '16 185 129',
  },
  dark: {
    '--b1': '17 24 39',
    '--bc': '255 255 255',
    '--p':  '99 102 241',
  },
}

function toVarsBlock(varsObj) {
  return Object.entries(varsObj)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n');
}

function buildThemeCss({ light = 'light', dark = 'dark' } = {}) {
  const lightVars = THEME_VARS[light] || THEME_VARS.light;
  const darkVars  = THEME_VARS[dark]  || THEME_VARS.dark;

  return `/* generated: theme.css */
:root {
${toVarsBlock(lightVars)}
}
@media (prefers-color-scheme: dark) {
  :root {
${toVarsBlock(darkVars)}
  }
}
`;
}

/**
 * Extracts frontmatter from markdown content.
 * Only parses title (text), description (text), and sidebar (boolean).
 * @param {string} markdown - The markdown content.
 * @returns {object} Object containing frontmatter data.
 */
export function parseFrontmatter(markdown) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);
  
  if (!match) {
    return {}
  }
  
  const frontmatterLines = match[1].split('\n');
  const frontmatter = {};
  
  for (const line of frontmatterLines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Match key: value pattern
    const keyValueMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (keyValueMatch) {
      const key = keyValueMatch[1].trim();
      let value = keyValueMatch[2].trim();
      
      // Only parse specific fields
      if (key === 'title' || key === 'description') {
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        frontmatter[key] = value;
      } else if (key === 'sidebar-toc') {
        // Parse as boolean
        frontmatter[key] = value.toLowerCase() === 'true';
      } else if (key === 'sidebar-nav-prio') {
        frontmatter[key] = parseInt(value)
      }
      // Ignore all other fields
    }
  }
  
  return frontmatter;
}

export function populateRedirects(pages) {
  return pages.map(page => {
    return `${page}* ${page} 200`
  }).join('\n')
}