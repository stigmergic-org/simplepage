import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const Sidebar = ({ 
  position = 'left', 
  defaultOpen = true,
  onToggle,
  children, 
  title,
  icon,
  className = '',
  width = 'w-64',
  effectiveTop = 64,
  contentWidth = 0
}) => {
  const [isOpen, setIsOpen] = useState(false); // Start closed initially
  
  useEffect(() => {
    if (!contentWidth) return;
    
    // Calculate if sidebar would overlap content
    const checkOverlap = () => {
      const sidebarWidth = 256; // w-64 = 16rem = 256px
      const viewportWidth = window.innerWidth;
      
      // Check if there's enough space for content + sidebar
      // Logic: fullWidth - contentWidth < 2x sidebarWidth
      const totalSpaceNeeded = contentWidth + (sidebarWidth * 2); // Content + space for sidebars on both sides
      const wouldOverlap = viewportWidth < totalSpaceNeeded;
      
      setIsOpen(wouldOverlap ? false : defaultOpen);
    };
    
    // Set initial state
    checkOverlap();
    
    // Listen for resize events
    window.addEventListener('resize', checkOverlap);
    
    return () => {
      window.removeEventListener('resize', checkOverlap);
    };
  }, [defaultOpen, contentWidth, position]);
  
  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (onToggle) {
      onToggle(!isOpen);
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
        className={`fixed top-0 ${positionClasses} h-full ${width} bg-base-100 ${borderClass} border-base-300 transform transition-all duration-300 ease-in-out z-40 ${transformClasses} ${className}`}
        style={{ 
          paddingTop: `${effectiveTop}px`,
          transition: 'padding-top 0.1s ease-out, transform 0.3s ease-in-out'
        }}
      >
        {/* Sidebar Header */}
        <div className={`flex items-center justify-between p-4 border-b border-base-300 ${position === 'left' ? 'pl-14' : ''}`}>
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
        </div>

        {/* Sidebar Content */}
        <div className="p-4 overflow-y-auto h-full">
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
