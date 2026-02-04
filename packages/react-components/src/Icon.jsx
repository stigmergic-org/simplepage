import React, { useEffect, useState } from 'react';
import { ICONS } from './icons.js';

const SIZE_CLASSES = {
  3: 'w-3 h-3',
  4: 'w-4 h-4',
  5: 'w-5 h-5',
  6: 'w-6 h-6',
  8: 'w-8 h-8',
  12: 'w-12 h-12',
};

const Icon = ({ name, size = 4, className = '', ...props }) => {
  const [svgAvailable, setSvgAvailable] = useState(true);

  const icon = ICONS[name];
  const sizeClass = SIZE_CLASSES[size];

  useEffect(() => {
    if (!icon) return;

    const checkSvgAvailability = async () => {
      try {
        const response = await fetch(icon.src, { method: 'HEAD' });
        if (!response.ok) {
          setSvgAvailable(false);
        }
      } catch (_error) {
        console.log('SVG not available, falling back to emoji:', icon.src);
        setSvgAvailable(false);
      }
    };

    checkSvgAvailability();
  }, [icon?.src]);

  if (!icon) {
    console.warn(`Icon "${name}" not found in ICONS configuration`);
    return null;
  }

  if (!sizeClass) {
    throw new Error(`Invalid icon size: ${size}. Valid sizes are: ${Object.keys(SIZE_CLASSES).join(', ')}`);
  }

  const commonProps = {
    role: 'img',
    'aria-label': icon.alt,
    className: `inline-block align-middle ${sizeClass} ${className}`,
    ...props,
  };

  if (!svgAvailable) {
    return (
      <span
        {...commonProps}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon.alt}
      </span>
    );
  }

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
