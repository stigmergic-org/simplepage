import React, { useEffect, useState } from 'react';

const TableOfContents = ({ content, className = '' }) => {
  const [headings, setHeadings] = useState([]);
  const [activeHeading, setActiveHeading] = useState('');

  useEffect(() => {
    if (!content) return;

    // Parse the content to extract headings
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    const extractedHeadings = Array.from(headingElements).map(heading => {
      const text = heading.textContent || '';
      const level = parseInt(heading.tagName.charAt(1));
      // Use the same ID generation logic as addHeadingLinks in view.jsx
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      return {
        id,
        text,
        level,
        element: heading
      };
    });

    setHeadings(extractedHeadings);
  }, [content]);

  useEffect(() => {
    // Set up intersection observer to track which heading is currently visible
    if (headings.length === 0) return;

    const updateActiveHeading = () => {
      // Get all heading elements and their positions
      const headingElements = headings.map(({ id }) => ({
        id,
        element: document.getElementById(id)
      })).filter(({ element }) => element);

      if (headingElements.length === 0) return;

      // Find the heading that's closest to the top of the viewport
      // but still above the middle of the screen
      const scrollTop = window.scrollY;
      const viewportMiddle = scrollTop + window.innerHeight / 6; // Use top sixth as trigger point

      let activeId = headingElements[0].id; // Default to first heading

      for (const { id, element } of headingElements) {
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top + scrollTop;
        
        if (elementTop <= viewportMiddle) {
          activeId = id;
        } else {
          break; // Stop at first heading that's below the trigger point
        }
      }

      setActiveHeading(activeId);
    };

    // Initial check
    updateActiveHeading();

    // Listen for scroll events
    const handleScroll = () => {
      updateActiveHeading();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [headings]);

  const handleHeadingClick = (id) => {
    const element = document.getElementById(id);
    if (element) {
      // Update URL hash
      window.history.pushState(null, null, `#${id}`);
      // Scroll to element
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (headings.length === 0) {
    return (
      <div className={`text-sm text-base-content/60 ${className}`}>
        No headings found in this page.
      </div>
    );
  }

  return (
    <nav className={`text-sm ${className}`}>
      <ul className="space-y-1">
        {headings.map(({ id, text, level }) => (
          <li key={id}>
            <button
              onClick={() => handleHeadingClick(id)}
              className={`
                w-full text-left px-2 py-1 rounded transition-colors duration-200 hover:bg-base-200
                ${activeHeading === id ? 'bg-primary/10 text-primary font-medium' : 'text-base-content/80'}
              `}
              style={{ 
                paddingLeft: `${(level - 1) * 0.75 + 0.5}rem`,
                fontSize: level === 1 ? '0.875rem' : level === 2 ? '0.8125rem' : '0.75rem'
              }}
              title={text}
            >
              <span className="line-clamp-2 text-left">
                {text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TableOfContents;
