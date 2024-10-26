
export function populateTemplate(templateHtml, body, targetDomain, path, { title, description } = {}) {
    const parser = new DOMParser()
    const templateDoc = parser.parseFromString(templateHtml, 'text/html')
    const rootElem = templateDoc.getElementById('content-container')
    rootElem.innerHTML = body
    const titleElement = templateDoc.querySelector('title')
    const titleText = title || targetDomain
    titleElement.textContent = titleText

    // update meta[name="ens-domain"]
    const ensDomainElement = templateDoc.querySelector('meta[name="ens-domain"]')
    ensDomainElement.setAttribute('content', targetDomain)

    // udpate og:title and twitter:title
    const ogTitleElement = templateDoc.querySelector('meta[property="og:title"]')
    ogTitleElement.setAttribute('content', titleText)
    const twitterTitleElement = templateDoc.querySelector('meta[name="twitter:title"]')
    twitterTitleElement.setAttribute('content', titleText)

    // update description, og:description, and twitter:description
    const descriptionElement = templateDoc.querySelector('meta[name="description"]')
    const descriptionText = description || `A SimplePage by ${targetDomain}`
    descriptionElement.setAttribute('content', descriptionText)
    const ogDescriptionElement = templateDoc.querySelector('meta[property="og:description"]')
    ogDescriptionElement.setAttribute('content', descriptionText)
    const twitterDescriptionElement = templateDoc.querySelector('meta[name="twitter:description"]')
    twitterDescriptionElement.setAttribute('content', descriptionText)

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
      } else if (key === 'sidebar') {
        // Parse as boolean
        frontmatter[key] = value.toLowerCase() === 'true';
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