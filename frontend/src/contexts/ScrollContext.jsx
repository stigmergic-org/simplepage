import React, { createContext, useContext, useState } from 'react';

const ScrollContext = createContext();

export const useScrollContext = () => {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error('useScrollContext must be used within a ScrollProvider');
  }
  return context;
};

export const ScrollProvider = ({ children }) => {
  const [scrollPositions, setScrollPositions] = useState({});

  // Save scroll position for a specific container
  const saveScrollPosition = (containerId, position) => {
    setScrollPositions(prev => ({
      ...prev,
      [containerId]: position
    }));
  };

  // Get scroll position for a specific container
  const getScrollPosition = (containerId) => {
    return scrollPositions[containerId] || 0;
  };

  // Clear scroll position for a specific container
  const clearScrollPosition = (containerId) => {
    setScrollPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[containerId];
      return newPositions;
    });
  };

  // Clear all scroll positions
  const clearAllScrollPositions = () => {
    setScrollPositions({});
  };

  const value = {
    saveScrollPosition,
    getScrollPosition,
    clearScrollPosition,
    clearAllScrollPositions,
    scrollPositions
  };

  return (
    <ScrollContext.Provider value={value}>
      {children}
    </ScrollContext.Provider>
  );
}; 