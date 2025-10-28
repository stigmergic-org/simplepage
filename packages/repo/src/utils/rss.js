import { mimeType } from '@simplepg/common'
import { parseFrontmatter } from './template.js'

/**
 * Extracts first media reference from markdown content
 * @param {string} markdown - The markdown content
 * @returns {object|null} Media info {url, type, isImage, isAudio, isVideo, isPdf} or null
 */
function extractFirstMedia(markdown) {
  // Remove frontmatter
  const withoutFrontmatter = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  
  // Match markdown image/embed syntax: ![alt](url) - only these should be enclosures
  const imageMatch = withoutFrontmatter.match(/!\[([^\]]*)\]\(([^)]+)\)/);
  if (imageMatch) {
    const url = imageMatch[2];
    const mime = mimeType(url) || 'image/jpeg';
    return {
      url,
      type: mime,
      isImage: mime.startsWith('image/'),
      isAudio: mime.startsWith('audio/'),
      isVideo: mime.startsWith('video/'),
      isPdf: mime === 'application/pdf'
    };
  }
  
  return null;
}

/**
 * Escapes XML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a date to RFC 822 format (required by RSS 2.0)
 * @param {string} isoDate - ISO 8601 date string
 * @returns {string} RFC 822 formatted date
 */
function toRFC822(isoDate) {
  const date = new Date(isoDate);
  return date.toUTCString();
}

/**
 * Generates XML for a single RSS item
 * @param {object} item - Item data
 * @param {string} baseUrl - Base URL for the site
 * @param {boolean} includeCategories - Whether to include categories
 * @returns {string} Item XML
 */
function generateRssItemXml(item, baseUrl, includeCategories) {
  const guid = item.link;
  const pubDate = toRFC822(item.pubDate);
  const updated = item.updated ? item.updated : item.pubDate;
  
  let xml = `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(guid)}</guid>
      <pubDate>${pubDate}</pubDate>
      <atom:updated>${escapeXml(updated)}</atom:updated>
      <dc:modified>${escapeXml(updated)}</dc:modified>
      <description>${escapeXml(item.description)}</description>
      <content:encoded><![CDATA[${item.content}]]></content:encoded>
`;
  
  // Add categories (tags)
  if (includeCategories && item.tags && item.tags.length > 0) {
    for (const tag of item.tags) {
      xml += `      <category>${escapeXml(tag)}</category>
`;
    }
  }
  
  // Detect and add media
  if (item.markdown) {
    const media = extractFirstMedia(item.markdown);
    if (media) {
      // Make URL absolute
      let mediaUrl = media.url;
      if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
        mediaUrl = `${baseUrl}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
      }
      
      if (media.isAudio || media.isVideo || media.isPdf) {
        // Add enclosure for downloadable media (audio, video, PDF)
        // Note: length is best-effort (set to 0 as we don't have file size)
        xml += `      <enclosure url="${escapeXml(mediaUrl)}" type="${escapeXml(media.type)}" length="0" />
`;
      }
      // Images: not included as enclosure since they're already in content:encoded
      // RSS readers will automatically extract the first image from content for preview
    }
  }
  
  xml += `    </item>
`;
  
  return xml;
}

/**
 * Generates an RSS 2.0 feed
 * @param {object} channel - Channel metadata
 * @param {string} channel.title - Site title
 * @param {string} channel.link - Site URL
 * @param {string} channel.description - Site description
 * @param {string} channel.language - Site language (optional, defaults to 'en')
 * @param {Array} items - Array of feed items
 * @param {string} items[].title - Item title
 * @param {string} items[].link - Item URL
 * @param {string} items[].description - Item summary/excerpt
 * @param {string} items[].content - Full HTML content
 * @param {string} items[].pubDate - Publication date (ISO 8601)
 * @param {string} items[].updated - Last updated date (ISO 8601, optional)
 * @param {string[]} items[].tags - Array of tags (optional)
 * @param {string} items[].markdown - Markdown content for media detection
 * @param {object} options - Generation options
 * @param {number} options.maxItems - Maximum number of items (default: 30)
 * @param {number} options.maxSize - Maximum feed size in bytes (default: 2MB)
 * @param {boolean} options.includeCategories - Include category tags (default: true)
 * @returns {string} RSS XML feed
 */
export function populateRssFeed(channel, items, options = {}) {
  const { 
    maxItems = 30, 
    maxSize = 2 * 1024 * 1024, // 2MB
    includeCategories = true 
  } = options;
  
  // Sort items by pubDate descending
  const sortedItems = [...items].sort((a, b) => {
    const dateA = new Date(a.pubDate);
    const dateB = new Date(b.pubDate);
    return dateB - dateA;
  });
  
  // Limit items
  let feedItems = sortedItems.slice(0, maxItems);
  
  // Calculate lastBuildDate (max of updated or pubDate)
  let lastBuildDate = new Date(0);
  for (const item of feedItems) {
    const itemDate = new Date(item.updated || item.pubDate);
    if (itemDate > lastBuildDate) {
      lastBuildDate = itemDate;
    }
  }
  
  // Generate feed
  const language = channel.language || 'en';
  const feedUrl = `${channel.link}/rss.xml`;
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${toRFC822(lastBuildDate.toISOString())}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
`;
  
  // Add items and enforce size limit
  for (const item of feedItems) {
    const itemXml = generateRssItemXml(item, channel.link, includeCategories);
    
    // Check if adding this item would exceed size limit
    const currentSize = xml.length + itemXml.length + 50; // +50 for closing tags
    if (currentSize > maxSize) {
      break;
    }
    
    xml += itemXml;
  }
  
  xml += `  </channel>
</rss>`;
  
  return xml;
}

/**
 * Generates a single RSS item from page data
 * @param {object} edit - The edit object containing page data
 * @param {string} targetDomain - The domain of the target repository
 * @returns {object|null} RSS item object or null if not eligible
 */
export function generateRssItem(edit, targetDomain) {
  const frontmatter = parseFrontmatter(edit.markdown)
  
  // Skip pages without rss: true
  if (!frontmatter.rss) return null
  
  // Skip pages without created date
  if (!frontmatter.created) {
    console.warn(`Page ${edit.path} has rss: true but no created date. Skipping.`)
    return null
  }
  
  // Build absolute URL
  const pageUrl = edit.path === '/' 
    ? `https://${targetDomain}.link` 
    : `https://${targetDomain}.link/${edit.path.split('/').filter(Boolean).join('/')}`
  
  // Build item
  return {
    title: frontmatter.title || targetDomain,
    link: pageUrl,
    description: frontmatter.description || '',
    content: edit.body,
    pubDate: frontmatter.created,
    updated: frontmatter.updated,
    tags: frontmatter.tags || [],
    markdown: edit.markdown
  }
}

/**
 * Generates RSS feed XML from items and channel metadata
 * @param {Array} items - Array of RSS item objects
 * @param {string} targetDomain - The domain of the target repository
 * @param {object} rootMetadata - Root page frontmatter
 * @returns {string|null} RSS XML feed or null if no items
 */
export function generateRssFeed(items, targetDomain, rootMetadata) {
  // If no RSS items, don't generate feed
  if (items.length === 0) return null
  
  // Build channel metadata
  const channel = {
    title: rootMetadata.title || targetDomain,
    link: `https://${targetDomain}.link`,
    description: rootMetadata.description || `A SimplePage by ${targetDomain}`,
    language: rootMetadata.language || 'en'
  }
  
  // Generate RSS feed
  return populateRssFeed(channel, items)
}

