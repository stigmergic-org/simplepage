import React, { useState, useEffect, useRef, useCallback } from 'react';

// Constants for line drawing
const ICON_RADIUS = 12;
const ICON_OFFSET = ICON_RADIUS + 4;
const VERTICAL_OFFSET = 60;

// Helper functions for line calculations
const getIconCenter = (iconElement, svgRect) => {
  const rect = iconElement.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - svgRect.left,
    y: rect.top + rect.height / 2 - svgRect.top
  };
};

const normalizeVector = (dx, dy) => {
  const length = Math.sqrt(dx * dx + dy * dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
};

const createLine = (key, x1, y1, x2, y2) => ({ key, x1, y1, x2, y2 });

const isValidParent = (parentCid, entryMap, historyData) => {
  return entryMap.get(parentCid) && historyData.findIndex(e => e.cid === parentCid) !== -1;
};

const calculateConnectionLines = (currentPos, parentPos, entryCid, parentIndex) => {
  const lines = [];
  const goingLeftToRight = parentPos.x > currentPos.x;

  if (goingLeftToRight) {
    const verticalY = currentPos.y + VERTICAL_OFFSET;
    const diagonalEnd = { x: parentPos.x, y: verticalY };
    const diagonalUnit = normalizeVector(diagonalEnd.x - currentPos.x, diagonalEnd.y - currentPos.y);
    
    if (diagonalUnit.x !== 0 || diagonalUnit.y !== 0) {
      const diagonalStart = {
        x: currentPos.x + diagonalUnit.x * ICON_OFFSET,
        y: currentPos.y + diagonalUnit.y * ICON_OFFSET
      };
      
      lines.push(createLine(`line-${entryCid}-${parentIndex}-1`, diagonalStart.x, diagonalStart.y, diagonalEnd.x, diagonalEnd.y));
      lines.push(createLine(`line-${entryCid}-${parentIndex}-2`, diagonalEnd.x, diagonalEnd.y, parentPos.x, parentPos.y - ICON_OFFSET));
    }
  } else {
    const verticalY = parentPos.y - VERTICAL_OFFSET;
    lines.push(createLine(`line-${entryCid}-${parentIndex}-1`, currentPos.x, currentPos.y + ICON_OFFSET, currentPos.x, verticalY));
    
    const diagonalUnit = normalizeVector(parentPos.x - currentPos.x, parentPos.y - verticalY);
    if (diagonalUnit.x !== 0 || diagonalUnit.y !== 0) {
      const diagonalEnd = {
        x: parentPos.x - diagonalUnit.x * ICON_OFFSET,
        y: parentPos.y - diagonalUnit.y * ICON_OFFSET
      };
      lines.push(createLine(`line-${entryCid}-${parentIndex}-2`, currentPos.x, verticalY, diagonalEnd.x, diagonalEnd.y));
    }
  }
  
  return lines;
};

const processConnection = (entry, parentCid, parentIndex, svgRect) => {
  const currentIcon = document.getElementById(`icon-${entry.cid}`);
  const parentIcon = document.getElementById(`icon-${parentCid}`);
  
  if (!currentIcon || !parentIcon) return [];
  
  const currentPos = getIconCenter(currentIcon, svgRect);
  const parentPos = getIconCenter(parentIcon, svgRect);
  return calculateConnectionLines(currentPos, parentPos, entry.cid, parentIndex);
};

// Helper function to check if all required icons are present in DOM
const areAllIconsReady = (historyData) => {
  return historyData.every(entry => {
    const currentIcon = document.getElementById(`icon-${entry.cid}`);
    return currentIcon !== null;
  });
};

// Component to draw lines using actual DOM element positions
const TimelineConnections = ({ historyData, entryMap, columnsByCid }) => {
  const svgRef = useRef(null);
  const [lines, setLines] = useState([]);
  const timeoutRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const mutationObserverRef = useRef(null);

  const drawLines = useCallback(() => {
    if (!svgRef.current || !historyData.length) return;

    // Check if all required icons are present
    if (!areAllIconsReady(historyData)) {
      // If not ready, schedule another attempt
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(drawLines, 50);
      return;
    }

    const svgRect = svgRef.current.getBoundingClientRect();
    const newLines = [];

    historyData.forEach((entry) => {
      entry.parents?.filter(parentCid => parentCid !== "").forEach((parentCid, parentIndex) => {
        if (isValidParent(parentCid, entryMap, historyData)) {
          newLines.push(...processConnection(entry, parentCid, parentIndex, svgRect));
        }
      });
    });

    setLines(newLines);
  }, [historyData, entryMap]);

  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Initial attempt with a longer delay
    timeoutRef.current = setTimeout(drawLines, 200);

    // Set up ResizeObserver to redraw when container size changes
    if (svgRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => {
        drawLines();
      });
      resizeObserverRef.current.observe(svgRef.current);
    }

    // Set up MutationObserver to detect when timeline entries are added
    mutationObserverRef.current = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(mutation => 
        mutation.type === 'childList' && 
        mutation.addedNodes.length > 0 &&
        Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node.id?.startsWith('icon-') || node.querySelector?.('[id^="icon-"]'))
        )
      );
      
      if (hasRelevantChanges) {
        // Small delay to ensure layout is complete
        setTimeout(drawLines, 100);
      }
    });

    // Observe the timeline container for changes
    const timelineContainer = document.querySelector('.space-y-0');
    if (timelineContainer) {
      mutationObserverRef.current.observe(timelineContainer, {
        childList: true,
        subtree: true
      });
    }

    // Also listen for window resize
    const handleResize = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(drawLines, 100);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (mutationObserverRef.current) mutationObserverRef.current.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [drawLines]);

  return (
    <svg 
      ref={svgRef}
      className="absolute inset-0 w-full h-full pointer-events-none" 
      style={{ zIndex: 1 }}
    >
      {lines.map(line => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#6b7280"
          strokeWidth="3"
        />
      ))}
    </svg>
  );
};

export default TimelineConnections;
