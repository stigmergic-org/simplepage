import React from 'react';
import { ICONS } from '../config/icons';

const Icon = ({ name, size = 4, className = '', disableInvert = false, ...props }) => {
  const icon = ICONS[name];
  
  if (!icon) {
    console.warn(`Icon "${name}" not found in ICONS configuration`);
    return null;
  }

  const sizeClass = `w-${size} h-${size}`;
  const invertClass = disableInvert ? '' : 'dark:invert';
  
  return (
    <img
      src={icon.src}
      alt={icon.alt}
      className={`${sizeClass} ${invertClass} ${className}`}
      {...props}
    />
  );
};

export default Icon;
