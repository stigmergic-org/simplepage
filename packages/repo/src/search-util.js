import { parseFrontmatter } from './template.js'

/**
 * Extracts headings from markdown content.
 * @param {string} markdown - The markdown content.
 * @returns {string[]} Array of headings.
 */
export function extractHeadings(markdown) {
  return markdown.split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('#')) return null
      const heading = trimmed.replace(/^#+\s*/, '').trim()
      return heading ? cleanMarkdownSyntax(heading) : null
    })
    .filter(Boolean)
}

/**
 * Cleans markdown text for searching by removing markdown syntax.
 * @param {string} markdown - The markdown content.
 * @returns {string} Cleaned text.
 */
export function cleanMarkdownForSearch(markdown) {
  return markdown
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '') // Remove frontmatter
    .replace(/^#+\s*/gm, '') // Remove headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/__([^_]+)__/g, '$1') // Remove bold
    .replace(/_([^_]+)_/g, '$1') // Remove italic
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1') // Remove code blocks
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1') // Remove reference links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/^[-*_]{3,}$/gm, '') // Remove horizontal rules
    .replace(/^>\s*/gm, '') // Remove blockquotes
    .replace(/^[\s]*[-*+]\s+/gm, '') // Remove list markers
    .replace(/^[\s]*\d+\.\s+/gm, '') // Remove numbered lists
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Clean whitespace
    .trim()
}

/**
 * Cleans markdown syntax from text, keeping the content but removing formatting.
 * @param {string} text - The text to clean.
 * @returns {string} Cleaned text.
 */
function cleanMarkdownSyntax(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/__([^_]+)__/g, '$1') // Remove bold
    .replace(/_([^_]+)_/g, '$1') // Remove italic
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1') // Remove reference links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/\s+/g, ' ') // Clean whitespace
    .trim()
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
  
  // Track which keywords matched in each category
  const matchedKeywords = {
    title: new Set(),
    description: new Set(),
    headings: new Set(),
    body: new Set()
  }
  
  for (const keyword of keywords) {
    // Title matches get highest priority
    if (titleLower.includes(keyword)) {
      matchedKeywords.title.add(keyword)
      score += 100 + (titleLower === keyword ? 10 : 0)
    }
    
    // Description matches get high priority
    if (descriptionLower.includes(keyword)) {
      matchedKeywords.description.add(keyword)
      score += 50
    }
    
    // Heading matches get medium-high priority
    for (const heading of headings) {
      const headingLower = heading.toLowerCase()
      if (headingLower.includes(keyword)) {
        matchedKeywords.headings.add(keyword)
        score += 30 + (headingLower === keyword ? 5 : 0)
      }
    }
    
    // Text content matches get lower priority
    if (cleanTextLower.includes(keyword)) {
      matchedKeywords.body.add(keyword)
      score += 10
    }
  }
  
  // Calculate total number of unique keywords that matched
  const totalMatchedKeywords = new Set([
    ...matchedKeywords.title,
    ...matchedKeywords.description,
    ...matchedKeywords.headings,
    ...matchedKeywords.body
  ]).size
  
  // Apply keyword count multiplier to ensure N+1 keywords always score higher than N keywords
  // Use a multiplier (1000) to ensure keyword count dominates over individual match scores
  // but still allows individual match scores to differentiate within same keyword count
  const keywordCountMultiplier = totalMatchedKeywords * 1000
  
  // Add field priority bonus to ensure higher-priority fields score higher within same keyword count
  // Keep bonuses small to ensure keyword count always dominates
  let fieldPriorityBonus = 0
  if (matchedKeywords.title.size > 0) fieldPriorityBonus += 200
  if (matchedKeywords.description.size > 0) fieldPriorityBonus += 100
  if (matchedKeywords.headings.size > 0) fieldPriorityBonus += 50
  if (matchedKeywords.body.size > 0) fieldPriorityBonus += 10
  
  // Bonus for proximity - if multiple keywords are close together
  let proximityBonus = 0
  if (keywords.length > 1) {
    proximityBonus = calculateProximityBonus(keywords, cleanTextLower)
  }
  
  return score + keywordCountMultiplier + fieldPriorityBonus + proximityBonus
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
export function findBestMatch(keywords, { _title, _description, _headings, cleanText }, markdown) {
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
 * @param {string} cleanText - The already cleaned text to search in.
 * @param {string} markdown - The original markdown content.
 * @returns {string} A text snippet from body content.
 */
export function extractTextSnippet(keywords, cleanText, markdown) {
  // Remove frontmatter and headings from markdown to get only body content
  let bodyContent = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '') // Remove frontmatter
  bodyContent = bodyContent.replace(/^#+\s*.*$/gm, '') // Remove all headings
  bodyContent = bodyContent.replace(/\n\s*\n/g, '\n').trim() // Clean up extra whitespace
  
  // Clean the body content the same way as the main text
  bodyContent = cleanMarkdownSyntax(bodyContent)
  
  const bodyLower = bodyContent.toLowerCase()
  
  for (const keyword of keywords) {
    const index = bodyLower.indexOf(keyword)
    if (index !== -1) {
      const start = Math.max(0, index - 37)
      const end = Math.min(bodyContent.length, start + 150)
      let snippet = bodyContent.substring(start, end)
      if (start > 0) snippet = '...' + snippet
      if (end < bodyContent.length) snippet += '...'
      return snippet
    }
  }
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
    const lineEndPosition = currentPosition + line.length + 1
    if (currentPosition < matchPosition) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) {
        const heading = trimmed.replace(/^#+\s*/, '').trim()
        if (heading) lastHeading = cleanMarkdownSyntax(heading)
      }
    } else break
    currentPosition = lineEndPosition
  }
  
  return lastHeading
}

/**
 * Finds matches under different headings in markdown content.
 * @param {string} markdown - The markdown content.
 * @param {string[]} keywords - The search keywords.
 * @param {object} pageInfo - Page information (title, description, path).
 * @returns {object[]} Array of search result objects for different heading matches.
 */
export function findHeadingMatches(markdown, keywords, { title, description, path }) {
  const results = []
  const lines = markdown.split('\n')
  
  // Track headings and their content sections
  const headingSections = []
  let currentHeading = ''
  let currentSection = []
  let inCodeBlock = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    
    // Track code blocks
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
    }
    
    // Check if this is a heading
    if (!inCodeBlock && trimmed.startsWith('#')) {
      const heading = trimmed.replace(/^#+\s*/, '').trim()
      if (heading) {
        if (currentSection.length > 0 && currentHeading) {
          headingSections.push({ heading: currentHeading, content: currentSection.join('\n') })
        }
        currentHeading = cleanMarkdownSyntax(heading)
        currentSection = []
      }
    }
    currentSection.push(line)
  }
  
  // Add the last section
  if (currentSection.length > 0 && currentHeading) {
    headingSections.push({
      heading: currentHeading,
      content: currentSection.join('\n')
    })
  }
  
  // Check each heading section for matches
  const matchedHeadings = new Set()
  
  for (const section of headingSections) {
    const { heading, content } = section
    
    // Check if heading itself contains keywords
    const headingMatch = keywords.some(keyword => heading.toLowerCase().includes(keyword))
    
    // Check if content under this heading contains keywords
    const contentMatch = keywords.some(keyword => content.toLowerCase().includes(keyword))
    
    if (headingMatch || contentMatch) {
      // Avoid duplicate results for the same heading
      if (!matchedHeadings.has(heading)) {
        matchedHeadings.add(heading)
        
        // Calculate score for this specific heading match
        const sectionScore = calculateSearchScore(keywords, {
          title: '',
          description: '',
          headings: [heading],
          cleanText: content
        })
        
        // Find text snippet from this section
        const sectionMatch = extractTextSnippet(keywords, content, content)
        
        results.push({ path, title, description, heading, match: sectionMatch, priority: sectionScore })
      }
    }
  }
  
  return results
}

/**
 * Processes a single page for search and returns multiple results if matches are under different headings.
 * @param {string} path - The page path.
 * @param {string} markdown - The markdown content.
 * @param {string[]} normalizedKeywords - The normalized search keywords.
 * @returns {object[]} Array of search result objects or empty array if no matches.
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
  
  if (score === 0) {
    return []
  }
  
  const results = []
  
  // Check for title/description matches (highest priority)
  const titleMatch = normalizedKeywords.some(keyword => title.toLowerCase().includes(keyword))
  const descriptionMatch = normalizedKeywords.some(keyword => description.toLowerCase().includes(keyword))
  
  // Always look for heading matches first
  const headingMatches = findHeadingMatches(markdown, normalizedKeywords, { title, description, path })
  results.push(...headingMatches)
  
  // If there are title/description matches, add them as well (but avoid duplicates)
  if (titleMatch || descriptionMatch) {
    // For title/description matches, prioritize showing the title/description content
    // rather than body content
    let match = ''
    let bestHeading = ''
    
    if (titleMatch) {
      // If title matches, show the title as the match
      match = title
      bestHeading = '' // No heading for title matches
    } else if (descriptionMatch) {
      // If description matches, show the description as the match
      match = description
      bestHeading = '' // No heading for description matches
    } else {
      // Fallback to body content if neither title nor description match
      match = findBestMatch(normalizedKeywords, {
        title,
        description,
        headings,
        cleanText
      }, markdown)
      
      // Find the best heading that contains keywords
      bestHeading = findBestHeading(normalizedKeywords, headings)
      
      // If we have a body match, also find the closest heading before the match
      if (match) {
        const closestHeading = findClosestHeadingBeforeMatch(markdown, normalizedKeywords)
        if (!bestHeading || closestHeading) {
          bestHeading = closestHeading || bestHeading
        }
      }
    }
    
    // Only add if we don't already have a result with the same heading
    const hasMatchingHeading = results.some(r => r.heading === bestHeading)
    if (!hasMatchingHeading) {
      results.push({ path, title, description, heading: bestHeading, match, priority: score })
    }
  }
  
  // If no matches found yet, check for general body content matches
  if (results.length === 0) {
    const match = findBestMatch(normalizedKeywords, {
      title,
      description,
      headings,
      cleanText
    }, markdown)
    
    if (match) {
      const closestHeading = findClosestHeadingBeforeMatch(markdown, normalizedKeywords)
      results.push({ path, title, description, heading: closestHeading, match, priority: score })
    }
  }
  
  return results
}
