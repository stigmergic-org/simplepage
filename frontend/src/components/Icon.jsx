// src/components/Icon.jsx
import React from 'react';
import { ICONS } from '../config/icons';

const Icon = ({ name, size = 4, className = '', ...props }) => {
  const icon = ICONS[name];
  if (!icon) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Icon "${name}" not found in ICONS`);
    }
    return null;
  }

  const sizeClass = `w-${size} h-${size}`;

  // Render a masked span that inherits text color
  return (
    <span
      role="img"
      aria-label={icon.alt}
      className={`inline-block align-middle ${sizeClass} ${className}`}
      style={{
        WebkitMask: `url(${icon.src}) no-repeat center / contain`,
        mask: `url(${icon.src}) no-repeat center / contain`,
        backgroundColor: 'currentColor',
      }}
      {...props}
    />
  );
};

export default Icon;