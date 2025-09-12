// src/components/Icon.jsx
import React from 'react';
import { ICONS } from '../config/icons';

// Predefined size classes map for Tailwind CSS
const SIZE_CLASSES = {
  3: 'w-3 h-3',
  4: 'w-4 h-4',
  5: 'w-5 h-5',
  8: 'w-8 h-8',
  12: 'w-12 h-12',
};

const Icon = ({ name, size = 4, className = '', ...props }) => {
  const icon = ICONS[name];
  if (!icon) {
    console.warn(`Icon "${name}" not found in ICONS configuration`);
    return null;
  }

  const sizeClass = SIZE_CLASSES[size];
  if (!sizeClass) {
    throw new Error(`Invalid icon size: ${size}. Valid sizes are: ${Object.keys(SIZE_CLASSES).join(', ')}`);
  }
  const [svgError, setSvgError] = React.useState(false);

  // Handle image load error
  const handleImageError = (e) => {
    console.log('Image error', e);
    setSvgError(true);
  };

  // Common props for both fallback and main element
  const commonProps = {
    role: 'img',
    'aria-label': icon.alt,
    className: `inline-block align-middle ${sizeClass} ${className}`,
    ...props,
  };

  // If SVG fails to load, fall back to displaying the alt text (emoji)
  if (svgError) {
    return (
      <span 
        {...commonProps}
        style={{ display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon.alt}
      </span>
    );
  }

  // Use a single img element with CSS mask
  return (
    <img
      {...commonProps}
      src={icon.src}
      alt={icon.alt}
      style={{
        WebkitMask: `url(${icon.src}) no-repeat center / contain`,
        mask: `url(${icon.src}) no-repeat center / contain`,
        backgroundColor: 'currentColor',
      }}
      onError={handleImageError}
    />
  );
};

export default Icon;