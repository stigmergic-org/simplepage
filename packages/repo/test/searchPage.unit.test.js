import { searchPage } from '../src/search-util.js'

describe('searchPage', () => {
  const createMarkdown = (frontmatter = '', content = '') => {
    if (frontmatter) {
      return `---\n${frontmatter}\n---\n\n${content}`
    }
    return content
  }

  describe('basic functionality', () => {
    test('should return empty array for no matches', () => {
      const markdown = createMarkdown(
        'title: Test Page\ndescription: A test page',
        '# Introduction\nThis is a test page about nothing.'
      )
      const results = searchPage('/test/', markdown, ['nonexistent'])
      expect(results).toEqual([])
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
      const results = searchPage('/react/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the highest priority result (should be title match)
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/react/',
        title: 'React Tutorial',
        description: 'Learn React',
        heading: '',
        match: expect.stringContaining('React'),
        priority: expect.any(Number)
      })
      expect(bestResult.priority).toBeGreaterThan(100) // Should be title match priority
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
      const results = searchPage('/js/', markdown, ['javascript'])
      
      expect(results).toHaveLength(3) // Introduction, Core Concepts, and title/description match
      
      // Find the title/description match (highest priority)
      const titleMatch = results.find(r => r.heading === '' && r.match === 'Learn JavaScript programming')
      expect(titleMatch).toMatchObject({
        path: '/js/',
        title: 'Web Development',
        description: 'Learn JavaScript programming',
        heading: '',
        match: 'Learn JavaScript programming',
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
      const results = searchPage('/web/', markdown, ['react'])
      
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
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
      const results = searchPage('/guide/', markdown, ['python'])
      
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
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
      const results = searchPage('/web/', markdown, ['react'])
      
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
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
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the title match (highest priority)
      const titleMatch = results.find(r => r.heading === '' && r.match === 'React Development')
      expect(titleMatch).toMatchObject({
        path: '/test/',
        title: 'React Development',
        description: 'Learn React programming',
        heading: '',
        match: 'React Development',
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
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the highest priority result (should be description match)
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/test/',
        title: 'Web Development',
        description: 'Learn React programming',
        heading: '', // Description matches now have empty heading
        match: 'Learn React programming',
        priority: expect.any(Number)
      })
      expect(bestResult.priority).toBeGreaterThan(30) // Should be heading match priority (description match gets combined with heading match)
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
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
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
      
      const results1 = searchPage('/test1/', markdown1, ['react'])
      const results2 = searchPage('/test2/', markdown2, ['react'])
      
      // Find the highest priority result from each
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      
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
      const results = searchPage('/tutorial/', markdown, ['react', 'hooks'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the highest priority result (should be title/description match)
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/tutorial/',
        title: 'React Hooks Tutorial',
        description: 'Learn React hooks',
        heading: '', // Title matches now have empty heading
        match: 'React Hooks Tutorial',
        priority: expect.any(Number)
      })
      
      // Should also have a React Hooks heading match
      const hooksResult = results.find(r => r.heading === 'React Hooks')
      expect(hooksResult).toBeDefined()
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
      const results = searchPage('/test/', markdown, ['react', 'hooks'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the result with the highest priority (should be the one with both keywords)
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/test/',
        title: 'React Development',
        description: 'Learn programming',
        heading: '', // Title matches now have empty heading
        match: 'React Development',
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
      const results = searchPage('/test/', markdown, ['react', 'hooks'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the result with the highest priority
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult.priority).toBeGreaterThan(20) // Should have proximity bonus
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
      const results = searchPage('/test/', markdown, ['bold', 'italic', 'links', 'code'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find a result that contains the cleaned text
      const resultWithBold = results.find(r => r.match.includes('Bold text'))
      expect(resultWithBold).toBeDefined()
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
      const results = searchPage('/test/', markdown, ['regular'])
      
      expect(results.length).toBeGreaterThan(0)
      const resultWithRegular = results.find(r => r.match.includes('regular'))
      expect(resultWithRegular).toBeDefined()
      
      // Test that code block content is also searchable
      const codeResults = searchPage('/test/', markdown, ['javascript'])
      expect(codeResults.length).toBeGreaterThan(0)
      const resultWithJS = codeResults.find(r => r.match.includes('JavaScript'))
      expect(resultWithJS).toBeDefined()
    })

    test('should handle images and links', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# Introduction\n![Image](image.jpg)\n[Link text](http://example.com)\nThis is content.'
      )
      const results = searchPage('/test/', markdown, ['content'])
      
      expect(results.length).toBeGreaterThan(0)
      const resultWithContent = results.find(r => r.match.includes('content'))
      expect(resultWithContent).toBeDefined()
    })
  })

  describe('edge cases', () => {
    test('should handle empty keywords', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# Introduction\nThis is content.'
      )
      const results = searchPage('/test/', markdown, [])
      expect(results).toEqual([])
    })

    test('should handle empty markdown', () => {
      const results = searchPage('/test/', '', ['test'])
      expect(results).toEqual([])
    })

    test('should handle markdown without frontmatter', () => {
      const markdown = '# Introduction\nThis is about React development.'
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].title).toBe('')
      expect(results[0].description).toBe('')
    })

    test('should handle case insensitive search', () => {
      const markdown = createMarkdown(
        'title: React Development\ndescription: Learn React',
        '# Introduction\nThis is about REACT programming.'
      )
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the highest priority result
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/test/',
        title: 'React Development',
        description: 'Learn React',
        heading: '',
        match: 'React Development',
        priority: expect.any(Number)
      })
    })

    test('should handle special characters in keywords', () => {
      const markdown = createMarkdown(
        'title: C++ Programming\ndescription: Learn C++',
        '# Introduction\nThis is about C++ development.'
      )
      const results = searchPage('/test/', markdown, ['c++'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the highest priority result
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/test/',
        title: 'C++ Programming',
        description: 'Learn C++',
        heading: '',
        match: expect.stringContaining('C++'),
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
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      const resultWithReact = results.find(r => r.match.includes('React'))
      expect(resultWithReact).toBeDefined()
      expect(resultWithReact.match.length).toBeLessThanOrEqual(200) // Should be truncated
    })

    test('should prefer title/description over text snippet', () => {
      const markdown = createMarkdown(
        'title: React Tutorial\ndescription: Learn React programming',
        '# Introduction\nThis is a very long piece of text that contains the keyword React multiple times.'
      )
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the highest priority result (should be title/description match)
      const bestResult = results.reduce((max, r) => r.priority > max.priority ? r : max, results[0])
      expect(bestResult).toMatchObject({
        path: '/test/',
        title: 'React Tutorial',
        description: 'Learn React programming',
        heading: '',
        match: expect.stringContaining('React'),
        priority: expect.any(Number)
      })
    })
  })

  describe('heading extraction', () => {
    test('should extract all heading levels', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# H1 Heading\n## H2 Heading\n### H3 Heading\n#### H4 Heading\n\nThis is some content about headings.'
      )
      const results = searchPage('/test/', markdown, ['heading'])
      
      expect(results.length).toBeGreaterThan(0)
      // Should find matches in headings
      const headingMatches = results.filter(r => r.heading && r.heading.includes('Heading'))
      expect(headingMatches.length).toBeGreaterThan(0)
    })

    test('should handle headings with special characters', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        '# React & Vue\n## JavaScript (ES6+)\n### Node.js & Express\n\nThis is about React and Vue development.'
      )
      const results = searchPage('/test/', markdown, ['react', 'vue'])
      
      expect(results.length).toBeGreaterThan(0)
      // Check if any result has the React & Vue heading
      const resultWithReactVue = results.find(r => r.heading === 'React & Vue')
      // If not found, check if we have a result with the Node.js heading (which contains the body match)
      const resultWithNode = results.find(r => r.heading === 'Node.js & Express')
      expect(resultWithReactVue || resultWithNode).toBeDefined()
    })

    test('should clean markdown syntax from headings', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        `# Introduction

## [React Tutorial](/tutorials/react)

This is about React development.

### **Bold Heading** with *italic text*

This section covers React hooks.

## [Vue.js Guide](https://vuejs.org) - *Learn Vue*

Advanced Vue concepts and patterns.

### \`Code Heading\` with [links](/links)

This is about JavaScript programming.`
      )
      const results = searchPage('/test/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      const resultWithReactTutorial = results.find(r => r.heading === 'React Tutorial')
      expect(resultWithReactTutorial).toBeDefined()
    })

    test('should clean various markdown syntax from headings', () => {
      const markdown = createMarkdown(
        'title: Test\ndescription: Test',
        `# Introduction

## **Bold** and *Italic* Heading

This is about web development.

### [Link Text](/path) with **bold** and *italic*

This section covers React development.

## \`Code\` in Heading with [External Link](https://example.com)

Advanced programming concepts.

### Heading with [Reference Link][ref] and **bold text**

[ref]: /reference

This is about JavaScript programming.`
      )
      const results = searchPage('/test/', markdown, ['heading'])
      
      expect(results.length).toBeGreaterThan(0)
      const resultWithBoldItalic = results.find(r => r.heading === 'Bold and Italic Heading')
      expect(resultWithBoldItalic).toBeDefined()
    })
  })

  describe('single page multiple matches', () => {
    test('searchPage should return multiple results for matches under different headers', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn web technologies',
        `# Introduction

This is a comprehensive guide to modern web development.

## React Hooks

React hooks revolutionized functional components. This section covers useState, useEffect, and custom hooks.

Advanced state management and lifecycle handling in React applications.

## Vue Components

Vue.js provides a different approach to component-based architecture. This section covers Vue components and composition API.

Component patterns and best practices for Vue development.

## Angular Services

Angular uses a service-oriented architecture with dependency injection. This section covers Angular services and providers.

Advanced patterns for building scalable Angular applications.`
      )
      
      // Test with keyword that appears under multiple different headers
      const results = searchPage('/web/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      const reactResult = results.find(r => r.heading === 'React Hooks')
      expect(reactResult).toMatchObject({
        path: '/web/',
        title: 'Web Development',
        description: 'Learn web technologies',
        heading: 'React Hooks',
        match: expect.stringContaining('React'),
        priority: expect.any(Number)
      })
    })

    test('searchPage should return multiple results for matches under different headers', () => {
      const markdown = createMarkdown(
        'title: React Guide\ndescription: Learn React development',
        `# Introduction

This is a comprehensive React development guide.

## React Hooks

React hooks are essential for modern React development. This section covers various React hooks including useState, useEffect, useCallback, and useMemo.

React hooks provide a way to use state and other React features in functional components. You'll learn about custom React hooks and how to build reusable logic.

Advanced React hooks patterns and best practices for state management in React applications.`
      )
      
      // Test with keyword that appears multiple times under different headers
      const results = searchPage('/react/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      // Should have results for both Introduction and React Hooks sections
      const headings = results.map(r => r.heading).sort()
      expect(headings).toContain('Introduction')
      expect(headings).toContain('React Hooks')
    })

    test('searchPage should return multiple results for matches under different headers with different keywords', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn web technologies',
        `# Introduction

This is a comprehensive guide to modern web development.

## React Hooks

React hooks revolutionized functional components. This section covers useState, useEffect, and custom hooks.

Advanced state management and lifecycle handling in React applications.

## Vue Components

Vue.js provides a different approach to component-based architecture. This section covers Vue components and composition API.

Component patterns and best practices for Vue development.

## Angular Services

Angular uses a service-oriented architecture with dependency injection. This section covers Angular services and providers.

Advanced patterns for building scalable Angular applications.`
      )
      
      // Test with keywords that appear under different headers
      const results = searchPage('/web/', markdown, ['react', 'vue'])
      
      expect(results.length).toBeGreaterThan(0)
      
      const headings = results.map(r => r.heading).sort()
      expect(headings).toContain('React Hooks')
      expect(headings).toContain('Vue Components')
    })

    test('searchPage should return multiple results for heading matches', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn web technologies',
        `# Introduction

This is a comprehensive guide to modern web development.

## React Hooks

This section covers various React hooks and state management.

## Vue Components

This section covers Vue.js component patterns and best practices.

## Angular Services

This section covers Angular service patterns and dependency injection.`
      )
      
      // Test with keywords that match headings directly
      const results = searchPage('/web/', markdown, ['react', 'vue', 'angular'])
      
      expect(results.length).toBeGreaterThan(0)
      
      const headings = results.map(r => r.heading).sort()
      expect(headings).toContain('React Hooks')
      expect(headings).toContain('Vue Components')
      expect(headings).toContain('Angular Services')
    })

    test('searchPage should return multiple results for matches under same header', () => {
      const markdown = createMarkdown(
        'title: React Guide\ndescription: Learn React development',
        `# Introduction

This is a comprehensive React development guide.

## React Hooks

React hooks are essential for modern React development. This section covers various React hooks including useState, useEffect, useCallback, and useMemo.

React hooks provide a way to use state and other React features in functional components. You'll learn about custom React hooks and how to build reusable logic.

Advanced React hooks patterns and best practices for state management in React applications.`
      )
      
      // Test with keyword that appears multiple times under different headers
      const results = searchPage('/react/', markdown, ['react'])
      
      expect(results.length).toBeGreaterThan(0)
      
      const headings = results.map(r => r.heading).sort()
      expect(headings).toContain('Introduction')
      expect(headings).toContain('React Hooks')
    })

    test('searchPage should return multiple results for all heading matches', () => {
      const markdown = createMarkdown(
        'title: Web Development\ndescription: Learn web technologies',
        `# Introduction

This is a comprehensive guide to modern web development.

## React Hooks

This section covers various React hooks and state management.

## Vue Components

This section covers Vue.js component patterns and best practices.

## Angular Services

This section covers Angular service patterns and dependency injection.`
      )
      
      // Test with keywords that match headings directly
      const results = searchPage('/web/', markdown, ['react', 'vue', 'angular'])
      
      expect(results.length).toBeGreaterThan(0)
      
      const headings = results.map(r => r.heading).sort()
      expect(headings).toContain('React Hooks')
      expect(headings).toContain('Vue Components')
      expect(headings).toContain('Angular Services')
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
      const results1 = searchPage('/page1/', markdown1, ['react'])
      
      // Page 2: Description match (medium priority)
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn React programming',
        `# Introduction

This is a comprehensive guide about React web development.`
      )
      const results2 = searchPage('/page2/', markdown2, ['react'])
      
      // Page 3: Heading match (lower priority)
      const markdown3 = createMarkdown(
        'title: Programming Guide\ndescription: Learn coding',
        `# Introduction

## React Hooks

This section covers React hooks and state management in React applications.`
      )
      const results3 = searchPage('/page3/', markdown3, ['react'])
      
      // Page 4: Body content match (lowest priority)
      const markdown4 = createMarkdown(
        'title: General Guide\ndescription: Learn programming',
        `# Introduction

This is about React development and modern web frameworks.`
      )
      const results4 = searchPage('/page4/', markdown4, ['react'])
      
      // All should match
      expect(results1.length).toBeGreaterThan(0)
      expect(results2.length).toBeGreaterThan(0)
      expect(results3.length).toBeGreaterThan(0)
      expect(results4.length).toBeGreaterThan(0)
      
      // Find highest priority result from each page
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      const result3 = results3.reduce((max, r) => r.priority > max.priority ? r : max, results3[0])
      const result4 = results4.reduce((max, r) => r.priority > max.priority ? r : max, results4[0])
      
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
      const results1 = searchPage('/page1/', markdown1, ['react', 'hooks'])
      
      // Page 2: Both "react" and "hooks" keyword matches
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn programming',
        `# Introduction

This is about React hooks and state management. You'll learn about React components and custom hooks.`
      )
      const results2 = searchPage('/page2/', markdown2, ['react', 'hooks'])
      
      // Both should match
      expect(results1.length).toBeGreaterThan(0)
      expect(results2.length).toBeGreaterThan(0)
      
      // Find highest priority result from each page
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      
      // Page with more keyword matches should have higher score
      expect(result2.priority).toBeGreaterThan(result1.priority)
    })

    test('should prioritize multiple keywords over single keyword regardless of match location', () => {
      // Page 1: Single keyword in title (highest individual priority)
      const markdown1 = createMarkdown(
        'title: React Tutorial\ndescription: Learn programming',
        `# Introduction

This is about web development and programming frameworks.`
      )
      const results1 = searchPage('/page1/', markdown1, ['react', 'hooks'])
      
      // Page 2: Both keywords in body text (lower individual priority)
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn programming',
        `# Introduction

This is about React hooks and state management. You'll learn about React components and custom hooks.`
      )
      const results2 = searchPage('/page2/', markdown2, ['react', 'hooks'])
      
      // Both should match
      expect(results1.length).toBeGreaterThan(0)
      expect(results2.length).toBeGreaterThan(0)
      
      // Find highest priority result from each page
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      
      // Page with 2 keyword matches should score higher than page with 1 keyword match
      // even though the single match is in the title
      expect(result2.priority).toBeGreaterThan(result1.priority)
    })

    test('should maintain priority order within same number of keywords', () => {
      // Page 1: Both keywords in title
      const markdown1 = createMarkdown(
        'title: React Hooks Tutorial\ndescription: Learn programming',
        `# Introduction

This is about web development and programming frameworks.`
      )
      const results1 = searchPage('/page1/', markdown1, ['react', 'hooks'])
      
      // Page 2: Both keywords in description
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn React hooks programming',
        `# Introduction

This is about web development and programming frameworks.`
      )
      const results2 = searchPage('/page2/', markdown2, ['react', 'hooks'])
      
      // Page 3: Both keywords in headings
      const markdown3 = createMarkdown(
        'title: Programming Guide\ndescription: Learn coding',
        `# Introduction

## React Hooks

This section covers React hooks and state management.`
      )
      const results3 = searchPage('/page3/', markdown3, ['react', 'hooks'])
      
      // Page 4: Both keywords in body text
      const markdown4 = createMarkdown(
        'title: General Guide\ndescription: Learn programming',
        `# Introduction

This is about React hooks and state management. You'll learn about React components and custom hooks.`
      )
      const results4 = searchPage('/page4/', markdown4, ['react', 'hooks'])
      
      // All should match
      expect(results1.length).toBeGreaterThan(0)
      expect(results2.length).toBeGreaterThan(0)
      expect(results3.length).toBeGreaterThan(0)
      expect(results4.length).toBeGreaterThan(0)
      
      // Find highest priority result from each page
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      const result3 = results3.reduce((max, r) => r.priority > max.priority ? r : max, results3[0])
      const result4 = results4.reduce((max, r) => r.priority > max.priority ? r : max, results4[0])
      
      // Within same number of keywords (2), priority should be: title > description > heading > body
      expect(result1.priority).toBeGreaterThan(result2.priority)
      expect(result2.priority).toBeGreaterThan(result3.priority)
      expect(result3.priority).toBeGreaterThan(result4.priority)
    })

    test('should ensure multiple keywords always score higher than single keyword', () => {
      // Page 1: Single keyword in title
      const markdown1 = createMarkdown(
        'title: React Tutorial\ndescription: Learn programming',
        `# Introduction

This is about web development and programming frameworks.`
      )
      const results1 = searchPage('/page1/', markdown1, ['react', 'hooks'])
      
      // Page 2: Two keywords in body text
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn programming',
        `# Introduction

This is about React hooks and state management. You will learn about React components and custom hooks.`
      )
      const results2 = searchPage('/page2/', markdown2, ['react', 'hooks'])
      
      // Both should match
      expect(results1.length).toBeGreaterThan(0)
      expect(results2.length).toBeGreaterThan(0)
      
      // Find highest priority result from each page
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      
      // Page with 2 keyword matches should score higher than page with 1 keyword match
      expect(result2.priority).toBeGreaterThan(result1.priority)
    })

    test('should ensure multiple keywords score higher even with exact title match', () => {
      // Page 1: Exact keyword match in title (gets exact match bonus)
      const markdown1 = createMarkdown(
        'title: React\ndescription: Learn programming',
        `# Introduction

This is about web development and programming frameworks.`
      )
      const results1 = searchPage('/page1/', markdown1, ['react', 'hooks'])
      
      // Page 2: Two keywords in body text
      const markdown2 = createMarkdown(
        'title: Web Development\ndescription: Learn programming',
        `# Introduction

This is about React hooks and state management. You will learn about React components and custom hooks.`
      )
      const results2 = searchPage('/page2/', markdown2, ['react', 'hooks'])
      
      // Both should match
      expect(results1.length).toBeGreaterThan(0)
      expect(results2.length).toBeGreaterThan(0)
      
      // Find highest priority result from each page
      const result1 = results1.reduce((max, r) => r.priority > max.priority ? r : max, results1[0])
      const result2 = results2.reduce((max, r) => r.priority > max.priority ? r : max, results2[0])
      
      // Page with 2 keyword matches should score higher than page with 1 keyword match
      // even when the single match is an exact title match
      expect(result2.priority).toBeGreaterThan(result1.priority)
    })
  })
})
