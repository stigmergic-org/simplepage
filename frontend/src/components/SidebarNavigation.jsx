import React from 'react';
import { useNavigation } from '../hooks/useNavigation';

const SidebarNavigation = ({ navItems = [], isVirtual = false }) => {
  const { goToViewWithPreview } = useNavigation();

  const renderNavItem = (item, depth = 0, parent) => {
    const isSelected = item.selected;
    const hasChildren = item.children && item.children.length > 0;
    const isFirstLevel = depth === 0;
    
    // Hide third level items unless their parent second level item is selected
    if (depth >= 2) {
      if (!parent || !(parent.selected || parent.children.some(c => c.selected))) {
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
            {item.children.map(child => renderNavItem(child, depth + 1, item))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {navItems.map(item => renderNavItem(item))}
    </div>
  );
};

export default SidebarNavigation;
