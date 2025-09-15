import React from 'react';
import { ICONS } from '../config/icons';

const VALID_TYPES = ['alert-error', 'alert-warning', 'alert-success', 'alert-info']

const Notice = ({ type = 'info', message, className = '', onClose, children, buttonText }) => {
  const validType = VALID_TYPES.find(t => t.includes(type)) || 'alert-info'
  const icon = ICONS[type === 'success' ? 'check' : type] || ICONS.info

  return (
    <div className={`alert mb-6 ${validType} alert-outline ${className}`}>
      <img 
        src={icon.src} 
        alt={icon.alt} 
        className="stroke-current shrink-0 h-6 w-6 dark:invert"
      />
      <div>{message || children}</div>
      {onClose && (
        <button 
          className={`btn btn-sm ${buttonText ? '' : 'btn-ghost btn-circle'}`}
          onClick={onClose}
        >
          {buttonText ? buttonText : (
            <img src={ICONS.close.src} alt={ICONS.close.alt} size={4} />
          )}
        </button>
      )}
    </div>
  );
};

export default Notice;
