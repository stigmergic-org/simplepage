import React from 'react';
import { ICONS } from '../config/icons';

const Sizes = {
  '3': ['w-3', 'h-3'],
  '4': ['w-4', 'h-4'],
  '5': ['w-5', 'h-5'],
  '6': ['w-6', 'h-6'],
  '8': ['w-8', 'h-8'],
  '12': ['w-12', 'h-12'],
};

const Icon = ({ name, size = 4, className = '', disableInvert = false, ...props }) => {
  const icon = ICONS[name];
  
  if (!icon) {
    console.warn(`Icon "${name}" not found in ICONS configuration`);
    return null;
  }

  const sizeKey = String(size);
  const sizeClasses = Sizes[sizeKey];
  
  if (!sizeClasses) {
    throw new Error(`Icon size "${size}" is not supported. Supported sizes are: ${Object.keys(Sizes).join(', ')}`);
  }

  const sizeClass = sizeClasses.join(' ');
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
