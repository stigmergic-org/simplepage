// src/components/Icon.jsx
import React, { useEffect, useState } from 'react';
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
  const [svgAvailable, setSvgAvailable] = useState(true);

  // Check SVG availability since CSS mask doesn't trigger onLoad/onError
  useEffect(() => {
    const checkSvgAvailability = async () => {
      try {
        const response = await fetch(icon.src, { method: 'HEAD' });
        if (!response.ok) {
          setSvgAvailable(false);
        }
      } catch (error) {
        console.log('SVG not available, falling back to emoji:', icon.src);
        setSvgAvailable(false);
      }
    };

    checkSvgAvailability();
  }, [icon.src]);

  // Common props for both fallback and main element
  const commonProps = {
    role: 'img',
    'aria-label': icon.alt,
    className: `inline-block align-middle ${sizeClass} ${className}`,
    ...props,
  };

  // If SVG is not available, fall back to displaying the alt text (emoji)
  if (!svgAvailable) {
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

  // Use a single img element with CSS mask for proper colorization
  return (
    <img
      {...commonProps}
      style={{
        WebkitMask: `url(${icon.src}) no-repeat center / contain`,
        mask: `url(${icon.src}) no-repeat center / contain`,
        backgroundColor: 'currentColor',
      }}
    />
  );
};

export default Icon;