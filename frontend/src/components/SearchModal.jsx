import React, { useState, useEffect, useRef } from 'react';
import { generateAnchorId } from '../utils/anchor-utils';
import { useRepo } from '../hooks/useRepo';
import Icon from './Icon';

const SearchModal = ({ isOpen, onClose, initialQuery = '' }) => {
  const { repo } = useRepo();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleResultClick(results[selectedIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  }, [selectedIndex, results.length]);

  // Search function
  const performSearch = async (searchQuery) => {
    if (!searchQuery.trim() || !repo) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const keywords = searchQuery.trim().split(/\s+/);
      const searchResults = [];
      
      for await (const result of repo.search(keywords)) {
        // Add new result to the array
        searchResults.push(result);
        
        // Sort by priority (highest first) and update results immediately
        const sortedResults = [...searchResults].sort((a, b) => b.priority - a.priority);
        setResults(sortedResults);
        
        // Reset selected index to 0 when new results come in
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Clear results when we're about to perform the search
      setResults([]);
      performSearch(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle result click
  const handleResultClick = (result) => {
    // Navigate to the result page with anchor hash if heading is available
    let url = result.path;
    if (result.heading) {
      const anchorId = generateAnchorId(result.heading);
      url = `${result.path}#${anchorId}`;
    }
    window.location.href = url;
    onClose();
  };

  // Handle input change
  const handleInputChange = (e) => {
    setQuery(e.target.value);
  };

  // Function to highlight matching keywords in text
  const highlightKeywords = (text, keywords) => {
    if (!text || !keywords || keywords.length === 0) return text;
    
    const regex = new RegExp(`(${keywords.map(keyword => 
      keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|')})`, 'gi');
    
    const parts = text.split(regex);
    return parts.map((part, index) => {
      // Check if this part matches any keyword (case-insensitive)
      const isMatch = keywords.some(keyword => 
        part.toLowerCase() === keyword.toLowerCase()
      );
      return isMatch ? <strong key={index}>{part}</strong> : part;
    });
  };

  // Handle modal backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-20"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-base-100 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-4 border-b border-base-300">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon name="search" size={4} className="text-base-content/60" />
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search pages..."
              value={query}
              onChange={handleInputChange}
              className="input input-bordered w-full pl-10 pr-4"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto" ref={resultsRef}>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="loading loading-spinner loading-md"></div>
              <span className="ml-2 text-base-content/60">Searching...</span>
            </div>
          ) : query.trim() ? (
            results.length > 0 ? (
              <div className="py-2">
                {results.map((result, index) => {
                  const keywords = query.trim().split(/\s+/);
                  return (
                    <div
                      key={`${result.path}-${index}`}
                      data-index={index}
                      className={`px-4 py-3 cursor-pointer hover:bg-base-200 transition-colors ${
                        index === selectedIndex ? 'bg-base-200' : ''
                      }`}
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <Icon name="document" size={4} className="text-base-content/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-base-content truncate">
                            {highlightKeywords(result.title || result.path, keywords)}
                          </div>
                          {result.heading && (
                            <div className="text-xs text-base-content/50 mt-1">
                              #{highlightKeywords(result.heading, keywords)}
                            </div>
                          )}
                          {(result.match || result.description) && (
                            <div className="text-sm text-base-content/60 mt-1 line-clamp-2">
                              {highlightKeywords(result.match || result.description, keywords)}
                            </div>
                          )}
                          <div className="text-xs text-base-content/40 mt-1">
                            {highlightKeywords(result.path, keywords)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Icon name="search" size={8} className="text-base-content/30 mb-2" />
                <p className="text-base-content/60">No results found</p>
                <p className="text-sm text-base-content/40 mt-1">
                  Try different keywords or check your spelling
                </p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Icon name="search" size={8} className="text-base-content/30 mb-2" />
              <p className="text-base-content/60">Start typing to search pages</p>
              <p className="text-sm text-base-content/40 mt-1">
                Search through page titles, descriptions, and content
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-base-300 bg-base-50">
          <div className="flex items-center justify-between text-xs text-base-content/50">
            <div className="flex items-center gap-4">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            <div>
              {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'} + K
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
