import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { assert } from '@simplepg/common';

const Sidebar = ({ 
  position = 'left', 
  children, 
  title,
  onTitleClick,
  icon,
  className = '',
  width = 'w-64',
  effectiveTop = 64,
  contentWidth = 0,
  semaphoreState
}) => {
  assert(Boolean(semaphoreState), 'Semaphore state is required');
  const [internalIsOpen, setInternalIsOpen] = useState(false); // Start closed initially
  const [wouldOverlap, setWouldOverlap] = useState(false);
  const [semaphore, setSemaphore] = semaphoreState;
  // Determine if this sidebar should be open based on semaphore or internal state
  const isOpen = internalIsOpen && (semaphore === position || !wouldOverlap);

  useEffect(() => {
    if (!contentWidth) return;
    
    // Calculate if sidebar would overlap content
    const checkOverlap = () => {
      const sidebarWidth = 256; // w-64 = 16rem = 256px
      const viewportWidth = window.innerWidth;
      
      // Check if there's enough space for content + sidebar
      // Logic: fullWidth - contentWidth < 2x sidebarWidth
      const totalSpaceNeeded = contentWidth + (sidebarWidth * 2); // Content + space for sidebars on both sides
      setWouldOverlap(viewportWidth < totalSpaceNeeded);
      setInternalIsOpen(!wouldOverlap);
    };
    
    // Set initial state
    checkOverlap();
    
    // Listen for resize events
    window.addEventListener('resize', checkOverlap);
    
    return () => {
      window.removeEventListener('resize', checkOverlap);
    };
  }, [contentWidth, position]);
  
  const handleToggle = () => {
    if (isOpen) {
      setSemaphore(null);
      setInternalIsOpen(false);
    } else {
      setSemaphore(position);
      setInternalIsOpen(true);
    }
  };
  
  const positionClasses = position === 'right' ? 'right-0' : 'left-0';
  const transformClasses = isOpen 
    ? 'translate-x-0' 
    : position === 'right' 
      ? 'translate-x-full' 
      : '-translate-x-full';

  const borderClass = position === 'right' ? 'border-l' : 'border-r';
  
  // Toggle button positioning
  const toggleButtonPosition = position === 'right' ? 'right-4' : 'left-4';
  
  return (
    <>
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className={`fixed ${toggleButtonPosition} z-50 btn btn-sm btn-circle bg-base-200 border-base-300 hover:bg-base-300`}
        style={{
          top: `${effectiveTop + 16}px`,
          transition: 'top 0.1s ease-out'
        }}
        aria-label="Toggle sidebar"
      >
        <Icon name={icon} size={4} />
      </button>

      {/* Sidebar */}
      <div 
        className={`fixed top-0 ${positionClasses} h-full ${width} bg-base-100 ${borderClass} border-base-300 transform transition-all duration-300 ease-in-out z-40 ${transformClasses} ${className} flex flex-col`}
        style={{ 
          paddingTop: `${effectiveTop}px`,
          transition: 'padding-top 0.1s ease-out, transform 0.3s ease-in-out'
        }}
      >
        {/* Sidebar Header */}
        <div 
          className={`flex items-center justify-between p-4 border-b border-base-300 flex-shrink-0 ${position === 'left' ? 'pl-16' : ''} ${onTitleClick ? 'cursor-pointer' : ''}`}
          onClick={onTitleClick}
        >
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
        </div>

        {/* Sidebar Content */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>

      {/* Overlay when sidebar overlaps content */}
      {isOpen && contentWidth > 0 && (() => {
        const sidebarWidth = 256;
        const viewportWidth = window.innerWidth;
        
        // Same logic: check if there's enough space for content + sidebars
        const totalSpaceNeeded = contentWidth + (sidebarWidth * 2);
        const wouldOverlap = viewportWidth < totalSpaceNeeded;
        
        return wouldOverlap ? (
          <div 
            className="fixed inset-0 z-30"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={handleToggle}
          />
        ) : null;
      })()}
    </>
  );
};

export default Sidebar;
