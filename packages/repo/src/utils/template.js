import { mimeType } from '@simplepg/common'

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

    // RSS autodiscovery
    const head = templateDoc.querySelector('head')
    const rssLink = templateDoc.createElement('link')
    rssLink.setAttribute('rel', 'alternate')
    rssLink.setAttribute('type', 'application/rss+xml')
    rssLink.setAttribute('title', `${titleText} RSS Feed`)
    rssLink.setAttribute('href', '/rss.xml')
    head.appendChild(rssLink)

    return `<!DOCTYPE html>\n${templateDoc.documentElement.outerHTML}`;
}

export function populateManifest(domain, { title, description } = {}, avatarPath = null) {
  const manifest = {
    name: title || domain,
    short_name: domain,
    description: description || `A SimplePage by ${domain}`,
    dapp_repository: "https://github.com/stigmergic-org/simplepage",
    dapp_contracts: [],
    icons: [],
  }
  // If avatar is present, add it as an icon with proper MIME type
  if (avatarPath) {
    const avatarMimeType = mimeType(avatarPath) || 'image/svg+xml'
    manifest.icons.push({
      src: avatarPath,
      type: avatarMimeType
    })
  } else {
    manifest.icons.push({
      src: "/_assets/images/logo.png",
      type: "image/png"
    })
  }
  return JSON.stringify(manifest)
}

/** -----------------------------------------------
 * DaisyUI Theme Integration for theme.css
 * ---------------------------------------------- */

// Import DaisyUI theme data
import daisyuiThemes from 'daisyui/theme/object.js';

/**
 * Converts a theme object to CSS variables block
 * @param {Object} themeObj - Theme object with CSS variables
 * @returns {string} CSS variables block
 */
function toVarsBlock(themeObj) {
  return Object.entries(themeObj)
    .filter(([key]) => key.startsWith('--'))
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
}

/**
 * Generates theme CSS based on user preferences
 * @param {Object} themePrefs - User theme preferences
 * @param {string} themePrefs.light - Light theme name (default: 'light')
 * @param {string} themePrefs.dark - Dark theme name (default: 'dark')
 * @returns {string} Generated theme CSS
 */
export function populateTheme({ light = 'light', dark = 'dark' } = {}) {
  // Get theme data from DaisyUI
  const lightThemeData = daisyuiThemes[light] || daisyuiThemes.light;
  const darkThemeData = daisyuiThemes[dark] || daisyuiThemes.dark;
  
  // Generate CSS
  return `/* Generated theme.css - Light: ${light}, Dark: ${dark} */
:root:not([data-theme]) {
${toVarsBlock(lightThemeData)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
${toVarsBlock(darkThemeData)}
  }
}
`;
}

/**
 * Extracts frontmatter from markdown content.
 * Parses title, description, sidebar, RSS fields, and timestamps.
 * @param {string} markdown - The markdown content.
 * @returns {object} Object containing frontmatter data.
 */
export function parseFrontmatter(markdown) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/;
  const match = markdown.match(frontmatterRegex);
  
  if (!match) {
    return {}
  }
  
  const frontmatterLines = match[1].split('\n');
  const frontmatter = {};
  
  let isInTagsList = false;
  
  for (const line of frontmatterLines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Handle YAML list items (lines starting with -)
    if (line.trim().startsWith('-')) {
      if (isInTagsList) {
        const tagMatch = line.trim().match(/^-\s*(.+)$/);
        if (tagMatch) {
          let tagValue = tagMatch[1].trim();
          // Remove quotes if present
          if ((tagValue.startsWith('"') && tagValue.endsWith('"')) || 
              (tagValue.startsWith("'") && tagValue.endsWith("'"))) {
            tagValue = tagValue.slice(1, -1);
          }
          frontmatter.tags.push(tagValue);
        }
      }
      continue;
    }
    
    // Match key: value pattern
    const keyValueMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (keyValueMatch) {
      const key = keyValueMatch[1].trim();
      let value = keyValueMatch[2].trim();
      
      // Reset tags list flag when we encounter a new key
      isInTagsList = false;
      
      // Parse text fields (title, description, language)
      if (key === 'title' || key === 'description' || key === 'language') {
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        frontmatter[key] = value;
      } 
      // Parse boolean fields
      else if (key === 'sidebar-toc' || key === 'rss') {
        frontmatter[key] = value.toLowerCase() === 'true';
      } 
      // Parse number fields
      else if (key === 'sidebar-nav-prio') {
        frontmatter[key] = parseInt(value);
      }
      // Parse ISO timestamp fields (dates or datetimes)
      else if (key === 'created' || key === 'updated') {
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        frontmatter[key] = value;
      }
      // Parse tags list start
      else if (key === 'tags' && value === '') {
        // YAML list format: tags: followed by dashes
        frontmatter.tags = [];
        isInTagsList = true;
      }
      // Parse tags (comma-separated or array notation)
      else if (key === 'tags' && value !== '') {
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Remove array brackets if present
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1);
        }
        // Split by comma and clean up
        frontmatter.tags = value.split(',').map(tag => tag.trim().replace(/['"]/g, '')).filter(Boolean);
      }
      // Ignore all other fields
    }
  }
  
  return frontmatter;
}

export function populateRedirects(pages) {
  const pageRedirects = pages.map(page => {
    return `${page}* ${page} 200`
  }).join('\n')
  
  // Add RSS feed redirect
  const rssRedirect = '/feed  /rss.xml  301'
  
  return `${rssRedirect}\n${pageRedirects}`
}