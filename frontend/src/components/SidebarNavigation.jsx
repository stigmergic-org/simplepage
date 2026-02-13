import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import { useNavigation } from '../hooks/useNavigation';
import { usePagePath } from '../hooks/usePagePath';
import { useRepo } from '../hooks/useRepo';

const buildSelectedNavItems = (items, selectedPath) => {
  if (!Array.isArray(items)) {
    return { items: [], hasSelection: false };
  }
  let hasSelection = false;
  const mapped = items.map(item => {
    const childResult = buildSelectedNavItems(item.children || [], selectedPath);
    const isSelected = item.path === selectedPath;
    if (isSelected || childResult.hasSelection) {
      hasSelection = true;
    }
    return {
      ...item,
      selected: isSelected,
      children: childResult.items,
    };
  });
  return { items: mapped, hasSelection };
};

const navItemsEqual = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (!leftItem || !rightItem) return false;
    if (leftItem.path !== rightItem.path) return false;
    if (leftItem.title !== rightItem.title) return false;
    if (leftItem.priority !== rightItem.priority) return false;
    if (Boolean(leftItem.virtual) !== Boolean(rightItem.virtual)) return false;
    if (Boolean(leftItem.selected) !== Boolean(rightItem.selected)) return false;
    if (!navItemsEqual(leftItem.children || [], rightItem.children || [])) return false;
  }
  return true;
};

const NavItem = ({ item, depth = 0, parent, isVirtual, goToViewWithPreview }) => {
  const isSelected = item.selected;
  const hasChildren = item.children && item.children.length > 0;
  const isFirstLevel = depth === 0;
  
  const checkSelected = (item) => {
    return item.selected || (item.children && item.children.some(c => checkSelected(c)));
  }
  // Hide third level items unless their parent second level item is selected
  if (depth >= 2) {
    if (!parent || !(checkSelected(parent))) {
      return null;
    }
  }
  
  const handleClick = (e) => {
    e.preventDefault();
    if (!item.virtual) {
      goToViewWithPreview(item.path);
    }
  };

  const itemContent = (
    <div 
      className={`
        flex items-center justify-between py-2 px-3 rounded-lg transition-colors duration-200
        ${item.virtual ? 'cursor-default' : 'cursor-pointer hover:bg-base-200'}
        ${isSelected 
          ? 'bg-primary/10 text-primary font-medium' 
          : 'text-base-content/80'
        }
      `}
      style={{ 
        paddingLeft: `${depth * 0.75 + 0.5}rem`,
        fontSize: depth === 0 ? '0.875rem' : depth === 1 ? '0.8125rem' : '0.75rem'
      }}
      onClick={isVirtual ? handleClick : undefined}
    >
      <span className={`truncate ${isFirstLevel ? 'font-bold' : ''}`}>
        {item.title}
      </span>
    </div>
  );

  return (
    <div key={item.path} className="mb-1">
      {isVirtual || item.virtual ? (
        itemContent
      ) : (
        <a href={item.path} className="block">
          {itemContent}
        </a>
      )}
      
      {hasChildren && (
        <div className="mt-1">
          {item.children.map(child => (
            <NavItem
              key={child.path}
              item={child}
              depth={depth + 1}
              parent={item}
              isVirtual={isVirtual}
              goToViewWithPreview={goToViewWithPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SidebarNavigation = ({ navItems = [], isVirtual = false }) => {
  const { goToViewWithPreview } = useNavigation();

  const items = navItems.filter(item => item.path !== '/');

  return (
    <div className="space-y-2">
      {items.map(item => (
        <NavItem
          key={item.path}
          item={item}
          isVirtual={isVirtual}
          goToViewWithPreview={goToViewWithPreview}
        />
      ))}
    </div>
  );
};

const SidebarNavigationPanel = ({ effectiveTop = 64, contentWidth = 0, semaphoreState }) => {
  const { repo } = useRepo();
  const { path, isVirtual } = usePagePath();
  const { goToViewWithPreview, goToRoot } = useNavigation();
  const [repoNavItems, setRepoNavItems] = useState(null);
  const [fallbackNavItems, setFallbackNavItems] = useState(null);

  const fallbackSelection = useMemo(
    () => buildSelectedNavItems(fallbackNavItems, path),
    [fallbackNavItems, path]
  );
  const fallbackSelectionRef = useRef(fallbackSelection);

  useEffect(() => {
    fallbackSelectionRef.current = fallbackSelection;
  }, [fallbackSelection]);

  const navItems = useMemo(() => {
    if (repoNavItems !== null) {
      return repoNavItems;
    }
    return fallbackSelection.hasSelection ? fallbackSelection.items : [];
  }, [repoNavItems, fallbackSelection]);

  const rootNavItem = navItems.find(item => item.path === '/');

  useEffect(() => {
    let isActive = true;

    const loadFallbackNavigation = async () => {
      try {
        const response = await fetch('/sidenav.json');
        if (!response.ok) return;
        const data = await response.json();
        const items = Array.isArray(data) ? data : data?.items;
        if (!Array.isArray(items)) return;
        if (isActive) {
          setFallbackNavItems(items);
        }
      } catch (error) {
        console.warn('Failed to load fallback sidenav.json:', error);
      }
    };

    loadFallbackNavigation();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    setRepoNavItems(null);
    const loadNavigation = async () => {
      if (!repo) return;
      try {
        const items = await repo.getSidebarNavInfo(path, !isVirtual);
        if (isActive) {
          const currentFallback = fallbackSelectionRef.current;
          if (currentFallback?.hasSelection && navItemsEqual(items, currentFallback.items)) {
            return;
          }
          setRepoNavItems(items);
        }
      } catch (error) {
        console.error('Failed to load sidebar navigation:', error);
      }
    };

    loadNavigation();
    return () => {
      isActive = false;
    };
  }, [repo, path, isVirtual]);

  if (navItems.length === 0) return null;

  return (
    <Sidebar
      position="left"
      title={rootNavItem?.title || 'Navigation'}
      onTitleClick={rootNavItem ? () => { isVirtual ? goToViewWithPreview(rootNavItem?.path) : goToRoot() } : undefined}
      icon="map"
      effectiveTop={effectiveTop}
      contentWidth={contentWidth}
      semaphoreState={semaphoreState}
    >
      <SidebarNavigation navItems={navItems} isVirtual={isVirtual} />
    </Sidebar>
  );
};

export { SidebarNavigationPanel };
export default SidebarNavigation;
