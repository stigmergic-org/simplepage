import { parseFrontmatter } from './template.js'

/**
 * Extracts headings from markdown content.
 * @param {string} markdown - The markdown content.
 * @returns {string[]} Array of headings.
 */
export function extractHeadings(markdown) {
  const lines = markdown.split('\n')
  const headings = []
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) {
      // Remove the # symbols and trim
      const heading = trimmed.replace(/^#+\s*/, '').trim()
      if (heading) {
        headings.push(heading)
      }
    }
  }
  
  return headings
}

/**
 * Cleans markdown text for searching by removing markdown syntax.
 * @param {string} markdown - The markdown content.
 * @returns {string} Cleaned text.
 */
export function cleanMarkdownForSearch(markdown) {
  // Remove frontmatter
  let text = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
  
  // Remove markdown syntax
  text = text
    // Remove headers (# ## ### etc.)
    .replace(/^#+\s*/gm, '')
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove code block markers but keep content
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim()
  
  return text
}

/**
 * Calculates search score based on keyword matches.
 * @param {string[]} keywords - The search keywords.
 * @param {object} content - The content to search in.
 * @param {string} content.title - The page title.
 * @param {string} content.description - The page description.
 * @param {string[]} content.headings - The page headings.
 * @param {string} content.cleanText - The cleaned markdown text.
 * @returns {number} The search score.
 */
export function calculateSearchScore(keywords, { title, description, headings, cleanText }) {
  let score = 0
  
  // Pre-compute lowercase versions for performance
  const titleLower = title.toLowerCase()
  const descriptionLower = description.toLowerCase()
  const cleanTextLower = cleanText.toLowerCase()
  
  for (const keyword of keywords) {
    // Title matches get highest priority
    if (titleLower.includes(keyword)) {
      score += 100
      // Exact title match gets bonus
      if (titleLower === keyword) {
        score += 50
      }
    }
    
    // Description matches get high priority
    if (descriptionLower.includes(keyword)) {
      score += 50
    }
    
    // Heading matches get medium-high priority
    for (const heading of headings) {
      const headingLower = heading.toLowerCase()
      if (headingLower.includes(keyword)) {
        score += 30
        // Exact heading match gets bonus
        if (headingLower === keyword) {
          score += 20
        }
      }
    }
    
    // Text content matches get lower priority
    if (cleanTextLower.includes(keyword)) {
      score += 10
    }
  }
  
  // Bonus for proximity - if multiple keywords are close together
  if (keywords.length > 1) {
    const proximityBonus = calculateProximityBonus(keywords, cleanTextLower)
    score += proximityBonus
  }
  
  return score
}

/**
 * Calculates proximity bonus for multiple keywords.
 * @param {string[]} keywords - The search keywords.
 * @param {string} textLower - The lowercase text to search in.
 * @returns {number} The proximity bonus score.
 */
export function calculateProximityBonus(keywords, textLower) {
  let maxProximityBonus = 0
  
  // Find all keyword positions
  const keywordPositions = keywords.map(keyword => {
    const positions = []
    let index = textLower.indexOf(keyword)
    while (index !== -1) {
      positions.push(index)
      index = textLower.indexOf(keyword, index + 1)
    }
    return positions
  })
  
  // Calculate proximity between different keywords
  for (let i = 0; i < keywordPositions.length; i++) {
    for (let j = i + 1; j < keywordPositions.length; j++) {
      const positions1 = keywordPositions[i]
      const positions2 = keywordPositions[j]
      
      for (const pos1 of positions1) {
        for (const pos2 of positions2) {
          const distance = Math.abs(pos1 - pos2)
          // Closer keywords get higher bonus (max 20 points)
          const bonus = Math.max(0, 20 - Math.floor(distance / 50))
          maxProximityBonus = Math.max(maxProximityBonus, bonus)
        }
      }
    }
  }
  
  return maxProximityBonus
}

/**
 * Finds the best matching text snippet for display.
 * Returns text from the body content, including when title/description match.
 * @param {string[]} keywords - The search keywords.
 * @param {object} content - The content to search in.
 * @param {string} markdown - The original markdown content.
 * @returns {string} The best matching snippet from body content.
 */
export function findBestMatch(keywords, { title, description, headings, cleanText }, markdown) {
  // Always return text snippet from body content
  return extractTextSnippet(keywords, cleanText, markdown)
}

/**
 * Finds the best heading that contains keywords.
 * @param {string[]} keywords - The search keywords.
 * @param {string[]} headings - The page headings.
 * @returns {string} The best matching heading.
 */
export function findBestHeading(keywords, headings) {
  let bestHeading = ''
  let bestMatchCount = 0
  
  for (const heading of headings) {
    const headingLower = heading.toLowerCase()
    const matchCount = keywords.filter(keyword => headingLower.includes(keyword)).length
    
    if (matchCount > bestMatchCount) {
      bestHeading = heading
      bestMatchCount = matchCount
    }
  }
  
  return bestHeading
}

/**
 * Extracts a text snippet around keyword matches from body content.
 * @param {string[]} keywords - The search keywords.
 * @param {string} text - The cleaned text to search in.
 * @param {string} markdown - The original markdown content.
 * @returns {string} A text snippet from body content.
 */
export function extractTextSnippet(keywords, text, markdown) {
  // Remove frontmatter and headings from markdown to get only body content
  let bodyContent = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '') // Remove frontmatter
  bodyContent = bodyContent.replace(/^#+\s*.*$/gm, '') // Remove all headings
  bodyContent = bodyContent.replace(/\n\s*\n/g, '\n').trim() // Clean up extra whitespace
  
  // Clean the body content the same way as the main text (this includes code blocks)
  bodyContent = cleanMarkdownForSearch(bodyContent)
  
  const bodyLower = bodyContent.toLowerCase()
  const snippetLength = 150
  
  for (const keyword of keywords) {
    const index = bodyLower.indexOf(keyword)
    if (index !== -1) {
      const start = Math.max(0, index - snippetLength / 2)
      const end = Math.min(bodyContent.length, start + snippetLength)
      let snippet = bodyContent.substring(start, end)
      
      // Add ellipsis if we're not at the beginning/end
      if (start > 0) snippet = '...' + snippet
      if (end < bodyContent.length) snippet = snippet + '...'
      
      return snippet
    }
  }
  
  // No matches found in body content
  return ''
}

/**
 * Finds the closest heading before a keyword match in the markdown.
 * @param {string} markdown - The markdown content.
 * @param {string[]} keywords - The search keywords.
 * @returns {string} The closest heading before the match, or empty string if none found.
 */
export function findClosestHeadingBeforeMatch(markdown, keywords) {
  const lines = markdown.split('\n')
  let lastHeading = ''
  let matchPosition = -1
  
  // Find the first keyword match position in the original markdown
  const markdownLower = markdown.toLowerCase()
  for (const keyword of keywords) {
    const index = markdownLower.indexOf(keyword)
    if (index !== -1 && (matchPosition === -1 || index < matchPosition)) {
      matchPosition = index
    }
  }
  
  if (matchPosition === -1) {
    return ''
  }
  
  // Find the closest heading before the match
  let currentPosition = 0
  for (const line of lines) {
    const lineEndPosition = currentPosition + line.length + 1 // +1 for newline
    
    if (currentPosition < matchPosition) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) {
        // Remove the # symbols and trim
        const heading = trimmed.replace(/^#+\s*/, '').trim()
        if (heading) {
          lastHeading = heading
        }
      }
    } else {
      // We've passed the match position
      break
    }
    
    currentPosition = lineEndPosition
  }
  
  return lastHeading
}

/**
 * Processes a single page for search.
 * @param {string} path - The page path.
 * @param {string} markdown - The markdown content.
 * @param {string[]} normalizedKeywords - The normalized search keywords.
 * @returns {object|null} Search result object or null if no match.
 */
export function searchPage(path, markdown, normalizedKeywords) {
  const metadata = parseFrontmatter(markdown)
  const title = metadata.title || ''
  const description = metadata.description || ''
  
  // Extract headings from markdown (lines starting with #)
  const headings = extractHeadings(markdown)
  
  // Clean markdown text for searching (remove markdown syntax)
  const cleanText = cleanMarkdownForSearch(markdown)
  
  // Calculate search score
  const score = calculateSearchScore(normalizedKeywords, {
    title,
    description,
    headings,
    cleanText
  })
  
  if (score > 0) {
    // Find the best matching text snippet
    const match = findBestMatch(normalizedKeywords, {
      title,
      description,
      headings,
      cleanText
    }, markdown)
    
    // Find the best heading that contains keywords
    let bestHeading = findBestHeading(normalizedKeywords, headings)
    
    // If we have a body match, also find the closest heading before the match
    // This provides context even when there are heading matches
    if (match) {
      const closestHeading = findClosestHeadingBeforeMatch(markdown, normalizedKeywords)
      // Use the closest heading if we don't have a heading match, or if it's more relevant
      if (!bestHeading || closestHeading) {
        bestHeading = closestHeading || bestHeading
      }
    }
    
    return {
      path,
      title,
      description,
      heading: bestHeading,
      match,
      priority: score
    }
  }
  
  return null
}
