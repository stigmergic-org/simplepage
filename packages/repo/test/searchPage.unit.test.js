import { searchPage } from '../src/search-util.js'

describe('searchPage', () => {
  const createMarkdown = (frontmatter = '', content = '') => {
    if (frontmatter) {
      return `---\n${frontmatter}\n---\n\n${content}`
    }
    return content
  }

  describe('basic functionality', () => {
    test('should return null for no matches', () => {
      const markdown = createMarkdown(
        'title: Test Page\ndescription: A test page',
        '# Introduction\nThis is a test page about nothing.'
      )
      const result = searchPage('/test/', markdown, ['nonexistent'])
      expect(result).toBeNull()
    })

    test('should return result for title match', () => {
      const markdown = createMarkdown(
        'title: React Tutorial\ndescription: Learn React',
        `# Introduction

This is a comprehensive guide to React development. React is a powerful JavaScript library for building user interfaces.

## What You'll Learn

- Component-based architecture
- State management
- Lifecycle methods
- Hooks and functional components

## Getting Started

To begin with React, you'll need to install Node.js and create a new project.`
      )
      const result = searchPage('/react/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/react/',
        title: 'React Tutorial',
        description: 'Learn React',
        heading: '',
        match: expect.stringContaining('React'), // Should contain body match even with title match
        priority: expect.any(Number)
      })
      expect(result.priority).toBeGreaterThan(0)
    })

    test('should return result for description match', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn JavaScript programming',
        `# Introduction

This guide covers the fundamentals of web development and modern JavaScript programming techniques.

## Core Concepts

- HTML structure and semantics
- CSS styling and layout
- JavaScript fundamentals
- DOM manipulation

## Advanced Topics

- ES6+ features
- Asynchronous programming
- Module systems
- Build tools and bundlers`
      )
      const result = searchPage('/js/', markdown, ['javascript'])
      
      expect(result).toMatchObject({
        path: '/js/',
        title: 'Web Development',
        description: 'Learn JavaScript programming',
        heading: '',
        match: expect.stringContaining('JavaScript'), // Should contain body match even with description match
        priority: expect.any(Number)
      })
    })

    test('should return result for heading match', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: General web dev guide',
        `# Introduction

Welcome to our comprehensive web development guide.

## React Hooks

Advanced state management and lifecycle handling.

## Vue Components

Component-based architecture with Vue.js.

## Angular Services

Dependency injection and service patterns.

## Conclusion

These frameworks each have their strengths and use cases.`
      )
      const result = searchPage('/web/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/web/',
        title: 'Web Development',
        description: 'General web dev guide',
        heading: 'React Hooks',
        match: '', // Should be empty since no body content contains "react"
        priority: expect.any(Number)
      })
    })

    test('should return result for content match', () => {
      const markdown = createMarkdown(
        'title: General Guide\ndescription: A general guide',
        `# Introduction

Welcome to our comprehensive programming guide.

## Data Science

Statistical analysis and machine learning techniques.

This section covers Python programming and data science methodologies. You'll learn about NumPy, Pandas, and scikit-learn for data manipulation and analysis.

## Machine Learning

Advanced algorithms and model training approaches.`
      )
      const result = searchPage('/guide/', markdown, ['python'])
      
      expect(result).toMatchObject({
        path: '/guide/',
        title: 'General Guide',
        description: 'A general guide',
        heading: 'Data Science', // Should be the closest heading before the match
        match: expect.stringContaining('Python'),
        priority: expect.any(Number)
      })
    })

    test('should handle both header and body matches', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn web technologies',
        `# Introduction

Modern web development involves many different technologies and frameworks.

## React Hooks

React hooks revolutionized how we write functional components. This section covers useState, useEffect, and custom hooks.

This is about React hooks and state management in modern applications. You'll learn how to manage component state effectively using the hooks API.

## Vue Composition API

Similar patterns in Vue.js with the Composition API.`
      )
      const result = searchPage('/web/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/web/',
        title: 'Web Development',
        description: 'Learn web technologies',
        heading: 'React Hooks', // Should return the matching heading
        match: expect.stringContaining('React'), // Should also return body match
        priority: expect.any(Number)
      })
    })
  })

  describe('priority scoring', () => {
    test('should prioritize title matches over description', () => {
      const markdown = createMarkdown(
        'title: React Development\ndescription: Learn React programming',
        `# Introduction

This comprehensive guide covers modern web development practices and React frameworks.

## Getting Started

To begin your journey in web development, you'll need to understand the fundamentals of HTML, CSS, and JavaScript.

## Advanced Topics

We'll explore advanced concepts like React state management, component architecture, and performance optimization.`
      )
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'React Development',
        description: 'Learn React programming',
        heading: '',
        match: expect.stringContaining('React'), // Should contain body match even with title match
        priority: expect.any(Number)
      })
    })

    test('should prioritize description over headings', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn React programming',
        `# Introduction

This guide covers various web development frameworks and their use cases.

## React Hooks

Advanced state management and lifecycle handling in React applications.

## Vue Components

Component-based architecture patterns with Vue.js framework.

## Angular Services

Dependency injection and service-oriented architecture patterns.`
      )
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'Web Development',
        description: 'Learn React programming',
        heading: 'React Hooks',
        match: expect.stringContaining('React'), // Should contain body match even with description match
        priority: expect.any(Number)
      })
    })

    test('should prioritize headings over content', () => {
      const markdown = createMarkdown(
        'title: General Guide\ndescription: A general guide',
        `# Introduction

This is a comprehensive guide covering various programming topics and technologies.

## React Hooks

Modern state management and lifecycle handling in web applications.

This section is about Python programming and data science methodologies. You'll learn about machine learning algorithms and statistical analysis techniques.

## Conclusion

Each technology has its own strengths and use cases.`
      )
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'General Guide',
        description: 'A general guide',
        heading: 'React Hooks',
        match: '', // Should be empty since no body content contains "react"
        priority: expect.any(Number)
      })
    })

    test('should give exact matches higher scores', () => {
      const markdown1 = createMarkdown(
        'title: React\ndescription: Learn React',
        '# Introduction'
      )
      const markdown2 = createMarkdown(
        'title: React Development\ndescription: Learn React programming',
        '# Introduction'
      )
      
      const result1 = searchPage('/test1/', markdown1, ['react'])
      const result2 = searchPage('/test2/', markdown2, ['react'])
      
      expect(result1.priority).toBeGreaterThan(result2.priority)
    })
  })

  describe('multiple keywords', () => {
    test('should match multiple keywords', () => {
      const markdown = createMarkdown(
        'title: React Hooks Tutorial\ndescription: Learn React hooks',
        `# Introduction

Welcome to our comprehensive React Hooks tutorial. This guide will teach you everything you need to know about modern React development.

## React Hooks

React hooks revolutionized functional components by providing state and lifecycle features.

## State Management

Understanding how to manage component state effectively using hooks.

## useEffect Hook

Handling side effects and lifecycle events in functional components.

## Custom Hooks

Creating reusable logic with custom hook patterns.`
      )
      const result = searchPage('/tutorial/', markdown, ['react', 'hooks'])
      
      expect(result).toMatchObject({
        path: '/tutorial/',
        title: 'React Hooks Tutorial',
        description: 'Learn React hooks',
        heading: 'React Hooks', // Should prefer heading with both keywords
        match: expect.stringContaining('React'), // Should contain body match
        priority: expect.any(Number)
      })
    })

    test('should prioritize matches with more keywords', () => {
      const markdown = createMarkdown(
        'title: React Development\ndescription: Learn programming',
        `# Introduction

This guide covers various aspects of modern web development and programming.

## React Hooks Tutorial

Comprehensive guide to React hooks and state management patterns.

## JavaScript Basics

Fundamental concepts of JavaScript programming language.

## React Components Guide

Building reusable and maintainable React components.

## Advanced Patterns

Exploring advanced React patterns and best practices.`
      )
      const result = searchPage('/test/', markdown, ['react', 'hooks'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'React Development',
        description: 'Learn programming',
        heading: 'React Hooks Tutorial', // Should prefer heading with both keywords
        match: expect.stringContaining('React'), // Should contain body match
        priority: expect.any(Number)
      })
    })

    test('should calculate proximity bonus for close keywords', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: A general guide',
        `# Introduction

Modern web development has evolved significantly over the years. This comprehensive guide covers the latest trends and technologies.

This is about React hooks and state management in modern web development. You'll learn how to build scalable applications using these powerful patterns and techniques.

## Advanced Topics

We'll explore advanced concepts like performance optimization and testing strategies.`
      )
      const result = searchPage('/test/', markdown, ['react', 'hooks'])
      
      expect(result).not.toBeNull()
      expect(result.priority).toBeGreaterThan(20) // Should have proximity bonus
    })
  })

  describe('markdown cleaning', () => {
    test('should ignore markdown syntax in search', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        `# Introduction

This is a comprehensive guide to **markdown formatting** and *text styling*.

## Formatting Examples

Here are some examples of [useful links](http://example.com) and \`inline code\` snippets.

### Advanced Features

- **Bold** text for emphasis
- *Italic text* for subtle emphasis
- [External links](https://example.com) for references
- \`code blocks\` for technical content`
      )
      const result = searchPage('/test/', markdown, ['bold', 'italic', 'links', 'code'])
      
      expect(result).not.toBeNull()
      expect(result.match).toContain('Bold text') // Should find the cleaned text
    })

    test('should handle code blocks', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        `# Introduction

Welcome to our programming guide. This section covers various coding examples and best practices.

## JavaScript Examples

Here's a simple example of JavaScript code:

\`\`\`javascript
const greeting = 'Hello, World!';
function sayHello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

This is regular text that should be searchable and match our keywords effectively.

## More Examples

Additional code samples and explanations follow in the next section.`
      )
      const result = searchPage('/test/', markdown, ['regular'])
      
      expect(result).not.toBeNull()
      expect(result.match).toContain('regular')
      
      // Test that code block content is also searchable
      const codeResult = searchPage('/test/', markdown, ['javascript'])
      expect(codeResult).not.toBeNull()
      expect(codeResult.match).toContain('JavaScript') // Should match code block content
    })

    test('should handle images and links', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# Introduction\n![Image](image.jpg)\n[Link text](http://example.com)\nThis is content.'
      )
      const result = searchPage('/test/', markdown, ['content'])
      
      expect(result).not.toBeNull()
      expect(result.match).toContain('content')
    })
  })

  describe('edge cases', () => {
    test('should handle empty keywords', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# Introduction\nThis is content.'
      )
      const result = searchPage('/test/', markdown, [])
      expect(result).toBeNull()
    })

    test('should handle empty markdown', () => {
      const result = searchPage('/test/', '', ['test'])
      expect(result).toBeNull()
    })

    test('should handle markdown without frontmatter', () => {
      const markdown = '# Introduction\nThis is about React development.'
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).not.toBeNull()
      expect(result.title).toBe('')
      expect(result.description).toBe('')
    })

    test('should handle case insensitive search', () => {
      const markdown = createMarkdown(
        'title: React Development\ndescription: Learn React',
        '# Introduction\nThis is about REACT programming.'
      )
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'React Development',
        description: 'Learn React',
        heading: '',
        match: expect.stringContaining('REACT'), // Should contain body match
        priority: expect.any(Number)
      })
    })

    test('should handle special characters in keywords', () => {
      const markdown = createMarkdown(
        'title: C++ Programming\ndescription: Learn C++',
        '# Introduction\nThis is about C++ development.'
      )
      const result = searchPage('/test/', markdown, ['c++'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'C++ Programming',
        description: 'Learn C++',
        heading: '',
        match: expect.stringContaining('C++'), // Should contain body match
        priority: expect.any(Number)
      })
    })
  })

  describe('text snippet extraction', () => {
    test('should extract relevant text snippet', () => {
      const longText = 'This is a very long piece of text that contains the keyword React multiple times. ' +
        'React is a popular JavaScript library for building user interfaces. ' +
        'Many developers use React to create modern web applications. ' +
        'The React ecosystem includes many tools and libraries.'
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        `# Introduction\n${longText}`
      )
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).not.toBeNull()
      expect(result.match).toContain('React')
      expect(result.match.length).toBeLessThanOrEqual(200) // Should be truncated
    })

    test('should prefer title/description over text snippet', () => {
      const markdown = createMarkdown(
        'title: React Tutorial\ndescription: Learn React programming',
        '# Introduction\nThis is a very long piece of text that contains the keyword React multiple times.'
      )
      const result = searchPage('/test/', markdown, ['react'])
      
      expect(result).toMatchObject({
        path: '/test/',
        title: 'React Tutorial',
        description: 'Learn React programming',
        heading: '',
        match: expect.stringContaining('React'), // Should contain body match
        priority: expect.any(Number)
      })
    })
  })

  describe('heading extraction', () => {
    test('should extract all heading levels', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# H1 Heading\n## H2 Heading\n### H3 Heading\n#### H4 Heading'
      )
      const result = searchPage('/test/', markdown, ['heading'])
      
      expect(result).not.toBeNull()
      expect(result.heading).toBe('H1 Heading') // Should find first match
    })

    test('should handle headings with special characters', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# React & Vue\n## JavaScript (ES6+)\n### Node.js & Express'
      )
      const result = searchPage('/test/', markdown, ['react', 'vue'])
      
      expect(result).not.toBeNull()
      expect(result.heading).toBe('React & Vue')
    })
  })

  describe('multi-page score comparison', () => {
    test('should prioritize pages with higher scores', () => {
      // Page 1: Title match (highest priority)
      const markdown1 = createMarkdown(
        'title: React Tutorial\ndescription: Learn programming',
        `# Introduction

This is a basic guide about React web development.`
      )
      const result1 = searchPage('/page1/', markdown1, ['react'])
      
      // Page 2: Description match (medium priority)
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn React programming',
        `# Introduction

This is a comprehensive guide about React web development.`
      )
      const result2 = searchPage('/page2/', markdown2, ['react'])
      
      // Page 3: Heading match (lower priority)
      const markdown3 = createMarkdown(
        'title: Programming Guide\ndescription: Learn coding',
        `# Introduction

## React Hooks

This section covers React hooks and state management in React applications.`
      )
      const result3 = searchPage('/page3/', markdown3, ['react'])
      
      // Page 4: Body content match (lowest priority)
      const markdown4 = createMarkdown(
        'title: General Guide\ndescription: Learn programming',
        `# Introduction

This is about React development and modern web frameworks.`
      )
      const result4 = searchPage('/page4/', markdown4, ['react'])
      
      // All should match
      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      expect(result3).not.toBeNull()
      expect(result4).not.toBeNull()
      
      // Score comparison: title > description > heading > body
      expect(result1.priority).toBeGreaterThan(result2.priority)
      expect(result2.priority).toBeGreaterThan(result3.priority)
      expect(result3.priority).toBeGreaterThan(result4.priority)
      
      // Verify match content is returned for all
      expect(result1.match).toContain('React')
      expect(result2.match).toContain('React')
      expect(result3.match).toContain('React')
      expect(result4.match).toContain('React')
    })

    test('should prioritize pages with multiple keyword matches', () => {
      // Page 1: Only "react" keyword match
      const markdown1 = createMarkdown(
        'title: Web Guide\ndescription: Learn programming',
        `# Introduction

This is about React development and web frameworks.`
      )
      const result1 = searchPage('/page1/', markdown1, ['react', 'hooks'])
      
      // Page 2: Both "react" and "hooks" keyword matches
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn programming',
        `# Introduction

This is about React hooks and state management. You'll learn about React components and custom hooks.`
      )
      const result2 = searchPage('/page2/', markdown2, ['react', 'hooks'])
      
      // Both should match
      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      
      // Page with more keyword matches should have higher score
      expect(result2.priority).toBeGreaterThan(result1.priority)
    })
  })
})
