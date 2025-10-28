import { parseFrontmatter } from '../src/utils/template.js'

describe('parseFrontmatter', () => {
  describe('basic functionality', () => {
    test('should parse title and description', () => {
      const markdown = `---
title: My Page
description: This is a test page
---

# Content goes here`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test page'
      })
    })

    test('should handle quoted values', () => {
      const markdown = `---
title: "My Page"
description: 'This is a test page'
---

# Content goes here`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test page'
      })
    })

    test('should return empty object for markdown without frontmatter', () => {
      const markdown = `# Content without frontmatter`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({})
    })

    test('should return empty object for empty markdown', () => {
      const result = parseFrontmatter('')
      expect(result).toEqual({})
    })

    test('should handle empty frontmatter', () => {
      const markdown = `---
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({})
    })
  })

  describe('boolean fields', () => {
    test('should parse sidebar-toc boolean', () => {
      const markdown = `---
sidebar-toc: true
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-toc': true })
    })

    test('should parse rss boolean', () => {
      const markdown = `---
rss: true
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ rss: true })
    })

    test('should handle false boolean values', () => {
      const markdown = `---
sidebar-toc: false
rss: false
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-toc': false, rss: false })
    })

    test('should be case insensitive for boolean values', () => {
      const markdown = `---
sidebar-toc: True
rss: FALSE
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-toc': true, rss: false })
    })
  })

  describe('number fields', () => {
    test('should parse sidebar-nav-prio as integer', () => {
      const markdown = `---
sidebar-nav-prio: 5
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-nav-prio': 5 })
    })

    test('should handle zero priority', () => {
      const markdown = `---
sidebar-nav-prio: 0
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-nav-prio': 0 })
    })

    test('should handle negative priority', () => {
      const markdown = `---
sidebar-nav-prio: -5
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-nav-prio': -5 })
    })

    test('should parse integer from string', () => {
      const markdown = `---
sidebar-nav-prio: 10
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ 'sidebar-nav-prio': 10 })
    })
  })

  describe('date fields', () => {
    test('should parse created date', () => {
      const markdown = `---
created: 2024-01-15
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ created: '2024-01-15' })
    })

    test('should parse updated date', () => {
      const markdown = `---
updated: 2024-01-16T12:00:00Z
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ updated: '2024-01-16T12:00:00Z' })
    })

    test('should parse both created and updated', () => {
      const markdown = `---
created: 2024-01-15
updated: 2024-01-16T12:00:00Z
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        created: '2024-01-15',
        updated: '2024-01-16T12:00:00Z'
      })
    })

    test('should handle quoted dates', () => {
      const markdown = `---
created: "2024-01-15"
updated: '2024-01-16'
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        created: '2024-01-15',
        updated: '2024-01-16'
      })
    })

    test('should handle date only format (YYYY-MM-DD)', () => {
      const markdown = `---
created: 2025-02-12
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ created: '2025-02-12' })
    })

    test('should handle full ISO timestamp', () => {
      const markdown = `---
created: 2024-01-15T10:00:00Z
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({ created: '2024-01-15T10:00:00Z' })
    })
  })

  describe('tags parsing', () => {
    test('should parse comma-separated tags', () => {
      const markdown = `---
tags: tutorial, introduction, getting-started
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction', 'getting-started']
      })
    })

    test('should parse YAML list format tags', () => {
      const markdown = `---
tags:
  - tutorial
  - introduction
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction']
      })
    })

    test('should handle quoted tags in list', () => {
      const markdown = `---
tags:
  - "tutorial"
  - 'introduction'
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction']
      })
    })

    test('should parse array notation tags', () => {
      const markdown = `---
tags: [tutorial, introduction, getting-started]
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction', 'getting-started']
      })
    })

    test('should parse single tag', () => {
      const markdown = `---
tags: tutorial
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial']
      })
    })

    test('should handle empty tags list', () => {
      const markdown = `---
tags: []
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: []
      })
    })

    test('should handle tags list with empty value', () => {
      const markdown = `---
tags:
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: []
      })
    })

    test('should handle spaces in tags', () => {
      const markdown = `---
tags: getting started, web development
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['getting started', 'web development']
      })
    })

    test('should filter out empty tags', () => {
      const markdown = `---
tags: tutorial, , introduction,
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction']
      })
    })
  })

  describe('language field', () => {
    test('should parse language field', () => {
      const markdown = `---
language: en
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        language: 'en'
      })
    })

    test('should handle language codes with region', () => {
      const markdown = `---
language: en-US
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        language: 'en-US'
      })
    })
  })

  describe('edge cases', () => {
    test('should handle extra whitespace', () => {
      const markdown = `---
title:   My Page   
description:   This is a test page   
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test page'
      })
    })

    test('should handle empty lines in frontmatter', () => {
      const markdown = `---
title: My Page

description: This is a test page
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test page'
      })
    })

    test('should handle colons in values', () => {
      const markdown = `---
title: My Page: A Guide
description: This is: a test page
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page: A Guide',
        description: 'This is: a test page'
      })
    })

    test('should handle special characters in values', () => {
      const markdown = `---
title: My Page & More
description: This is a test (page) with @special #chars
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page & More',
        description: 'This is a test (page) with @special #chars'
      })
    })

    test('should handle unicode characters', () => {
      const markdown = `---
title: 我的页面
description: 这是一个测试页面
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: '我的页面',
        description: '这是一个测试页面'
      })
    })

    test('should handle newlines in quoted values (first line only)', () => {
      const markdown = `---
title: "My Page
with newlines"
description: Regular description
---

# Content`
      const result = parseFrontmatter(markdown)
      // The parser only handles the first line before multiline values
      expect(result).toEqual({
        title: '"My Page', // Only parses first line when newline is in value
        description: 'Regular description'
      })
    })

    test('should ignore unknown fields', () => {
      const markdown = `---
title: My Page
unknown-field: some value
another-field: another value
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page'
      })
    })

    test('should handle very long field values', () => {
      const longDescription = 'A'.repeat(1000)
      const markdown = `---
title: My Page
description: ${longDescription}
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: longDescription
      })
    })

    test('should handle mixed case field names', () => {
      const markdown = `---
Title: My Page
Description: This is a test page
rSS: true
---

# Content`
      const result = parseFrontmatter(markdown)
      // Field names must be lowercase (title, description, rss) to be parsed
      expect(result).toEqual({})
    })

    test('should handle frontmatter with extra dashes', () => {
      const markdown = `---
title: My Page
description: This is a test page
---

Some text with --- dashes here

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test page'
      })
    })

    test('should handle missing closing frontmatter delimiter', () => {
      const markdown = `---
title: My Page
description: This is a test page

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({})
    })

    test('should handle content starting with dashes', () => {
      const markdown = `---
title: My Page
---

# Content with --- dashes
Some more content here`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page'
      })
    })
  })

  describe('complex combinations', () => {
    test('should parse all field types together', () => {
      const markdown = `---
title: My Blog Post
description: A comprehensive guide to RSS feeds
created: 2024-01-15
updated: 2024-01-16T12:00:00Z
tags:
  - tutorial
  - rss
  - web-development
sidebar-toc: true
rss: true
sidebar-nav-prio: 5
language: en
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Blog Post',
        description: 'A comprehensive guide to RSS feeds',
        created: '2024-01-15',
        updated: '2024-01-16T12:00:00Z',
        tags: ['tutorial', 'rss', 'web-development'],
        'sidebar-toc': true,
        rss: true,
        'sidebar-nav-prio': 5,
        language: 'en'
      })
    })

    test('should handle multiple date formats', () => {
      const markdown = `---
created: 2025-02-12
updated: "2025-02-13T14:30:00Z"
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        created: '2025-02-12',
        updated: '2025-02-13T14:30:00Z'
      })
    })

    test('should handle both tag formats in different frontmatters', () => {
      // Test comma-separated
      const markdown1 = `---
tags: tutorial, introduction
---

# Content`
      const result1 = parseFrontmatter(markdown1)
      expect(result1).toEqual({
        tags: ['tutorial', 'introduction']
      })

      // Test YAML list
      const markdown2 = `---
tags:
  - tutorial
  - introduction
---

# Content`
      const result2 = parseFrontmatter(markdown2)
      expect(result2).toEqual({
        tags: ['tutorial', 'introduction']
      })

      // Results should be identical
      expect(result1).toEqual(result2)
    })
  })

  describe('malformed frontmatter', () => {
    test('should handle lines without colons gracefully', () => {
      const markdown = `---
title: My Page
this line has no colon
description: This is a test page
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test page'
      })
    })

    test('should handle empty values', () => {
      const markdown = `---
title: My Page
description:
tags:
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: '', // Empty values are preserved
        tags: []
      })
    })

    test('should handle duplicate keys (take last one)', () => {
      const markdown = `---
title: First Title
title: Second Title
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'Second Title'
      })
    })

    test('should handle tags without proper formatting', () => {
      const markdown = `---
tags: [tutorial , introduction ]
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction']
      })
    })

    test('should handle tags with varying quote styles', () => {
      const markdown = `---
tags: ["tutorial", 'introduction', getting-started]
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction', 'getting-started']
      })
    })

    test('should handle mixed tag formats', () => {
      const markdown = `---
tags: [tutorial, "introduction", getting-started, 'advanced']
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction', 'getting-started', 'advanced']
      })
    })

    test('should handle single tag in brackets', () => {
      const markdown = `---
tags: [tutorial]
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial']
      })
    })

    test('should handle quoted single tag', () => {
      const markdown = `---
tags: "tutorial"
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial']
      })
    })

    test('should handle tags with commas in values', () => {
      const markdown = `---
tags: [getting started, "web dev, frontend", advanced]
---

# Content`
      const result = parseFrontmatter(markdown)
      // The parser splits on commas and strips quotes/whitespace from individual items
      expect(result).toEqual({
        tags: ['getting started', 'web dev', 'frontend', 'advanced']
      })
    })

    test('should handle nested brackets (only outer)', () => {
      const markdown = `---
tags: [[nested], tutorial]
---

# Content`
      const result = parseFrontmatter(markdown)
      // Outer brackets are stripped, inner stays as content, spaces trimmed
      expect(result).toEqual({
        tags: ['[nested]', 'tutorial']
      })
    })

    test('should handle tags with special YAML characters', () => {
      const markdown = `---
tags: [c++, node.js, "c#"]
---

# Content`
      const result = parseFrontmatter(markdown)
      // Brackets stripped, then quotes stripped from individual items
      expect(result).toEqual({
        tags: ['c++', 'node.js', 'c#']
      })
    })

    test('should handle tags list with items on same line', () => {
      const markdown = `---
tags:
  - tutorial - introduction
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial - introduction']
      })
    })

    test('should handle tags list with trailing commas in items', () => {
      const markdown = `---
tags:
  - tutorial,
  - introduction
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial,', 'introduction']
      })
    })

    test('should handle empty tags with brackets', () => {
      const markdown = `---
tags: []
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: []
      })
    })

    test('should handle tag with empty string', () => {
      const markdown = `---
tags: ""
---

# Content`
      const result = parseFrontmatter(markdown)
      // Empty strings are filtered out by .filter(Boolean)
      expect(result).toEqual({
        tags: []
      })
    })

    test('should handle tag value with only commas', () => {
      const markdown = `---
tags: [,,]
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: []
      })
    })

    test('should handle tags with different indentation in list', () => {
      const markdown = `---
tags:
      - tutorial
    - introduction
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction']
      })
    })

    test('should handle tags list with comments-like text', () => {
      const markdown = `---
tags:
  - tutorial
  - introduction # comment here should be part of tag
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['tutorial', 'introduction # comment here should be part of tag']
      })
    })

    test('should handle malformed tags with mixed dashes and commas', () => {
      const markdown = `---
tags: tutorial, -introduction
---

# Content`
      const result = parseFrontmatter(markdown)
      // Spaces trimmed from individual items
      expect(result).toEqual({
        tags: ['tutorial', '-introduction']
      })
    })

    test('should handle tags with unclosed brackets', () => {
      const markdown = `---
tags: [tutorial, introduction
---

# Content`
      const result = parseFrontmatter(markdown)
      // Leading [ is captured in first tag when no closing ]
      expect(result).toEqual({
        tags: ['[tutorial', 'introduction']
      })
    })

    test('should handle tags with extra opening bracket', () => {
      const markdown = `---
tags: [[tutorial, introduction]
---

# Content`
      const result = parseFrontmatter(markdown)
      // Only first [ is stripped, second [ stays, last ] is stripped
      expect(result).toEqual({
        tags: ['[tutorial', 'introduction']
      })
    })

    test('should handle multiple tag fields (takes last)', () => {
      const markdown = `---
tags: first
tags: second
tags: third
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        tags: ['third']
      })
    })

    test('should handle tags that look like other fields', () => {
      const markdown = `---
title: My Page
tags:
  - title: not a title
  - description: not description
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        tags: ['title: not a title', 'description: not description']
      })
    })
  })

  describe('badly formatted YAML - general issues', () => {
    test('should handle missing spaces after colon', () => {
      const markdown = `---
title:My Page
description:This is a test
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test'
      })
    })

    test('should handle extra spaces before colon', () => {
      const markdown = `---
title : My Page
description : This is a test
---

# Content`
      const result = parseFrontmatter(markdown)
      // Key is trimmed before checking whitelist
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test'
      })
    })

    test('should handle tabs instead of spaces', () => {
      const markdown = `---
title:	My Page
description:	This is a test
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'This is a test'
      })
    })

    test('should handle values with newlines (first line only)', () => {
      const markdown = `---
title: My
Page
description: Second part
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My',
        description: 'Second part'
      })
    })

    test('should handle frontmatter with only one dash', () => {
      const markdown = `-
title: My Page
-

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({})
    })

    test('should handle frontmatter with three dashes after', () => {
      const markdown = `---
title: My Page
---
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page'
      })
    })

    test('should handle quoted keys', () => {
      const markdown = `---
"title": "My Page"
'description': 'This is a test'
---

# Content`
      const result = parseFrontmatter(markdown)
      // Keys with quotes are not whitelisted, so they're ignored
      expect(result).toEqual({})
    })

    test('should handle keys with colons in them', () => {
      const markdown = `---
title: My Page
description:value: This is a test
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page',
        description: 'value: This is a test'
      })
    })

    test('should handle values starting with hash', () => {
      const markdown = `---
title: # My Page
description: # This is a test
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: '# My Page',
        description: '# This is a test'
      })
    })

    test('should handle values that look like YAML', () => {
      const markdown = `---
title: My Page
description: something: value
tags: [item1, item2: value]
---

# Content`
      const result = parseFrontmatter(markdown)
      // Regex strips brackets, including content after :
      expect(result).toEqual({
        title: 'My Page',
        description: 'something: value',
        tags: ['item1', 'item2: value']
      })
    })

    test('should handle boolean values without key', () => {
      const markdown = `---
title: My Page
true
false
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page'
      })
    })

    test('should handle numeric-looking strings', () => {
      const markdown = `---
title: 42
description: 0
sidebar-nav-prio: "100"
---

# Content`
      const result = parseFrontmatter(markdown)
      // Quoted numbers lose quotes but are still strings
      expect(result).toEqual({
        title: '42',
        description: '0',
        'sidebar-nav-prio': NaN // Quoted strings with numbers become NaN when parseInt
      })
    })

    test('should handle pipe character in values', () => {
      const markdown = `---
title: My Page | Section
description: A | B | C
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My Page | Section',
        description: 'A | B | C'
      })
    })

    test('should handle asterisks and other special chars', () => {
      const markdown = `---
title: My * Page
description: This (is) a test {value} [brackets]
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        title: 'My * Page',
        description: 'This (is) a test {value} [brackets]'
      })
    })

    test('should handle empty key', () => {
      const markdown = `---
: empty key
title: My Page
---

# Content`
      const result = parseFrontmatter(markdown)
      // Empty key doesn't match the regex pattern
      expect(result).toEqual({
        title: 'My Page'
      })
    })

    test('should handle very long keys', () => {
      const longKey = 'title'.repeat(100)
      const markdown = `---
${longKey}: My Page
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({})
    })

    test('should handle malformed closing delimiter', () => {
      const markdown = `---
title: My Page
-- -
---

# Content`
      const result = parseFrontmatter(markdown)
      // Malformed delimiter still picks up the content between dashes
      expect(result).toEqual({
        title: 'My Page'
      })
    })

    test('should handle incomplete boolean values', () => {
      const markdown = `---
sidebar-toc: tru
rss: fals
---

# Content`
      const result = parseFrontmatter(markdown)
      expect(result).toEqual({
        'sidebar-toc': false,
        rss: false
      })
    })
  })
})

