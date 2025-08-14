import React from 'react';
import { ICONS } from '../config/icons';

const VALID_TYPES = ['error', 'warning', 'success', 'info']

const Notice = ({ type = 'info', message, className = '', onClose, children }) => {
  const validType = VALID_TYPES.includes(type) ? type : 'info'
  const icon = ICONS[type === 'success' ? 'check' : type] || ICONS.info

  return (
    <div className={`alert mb-6 alert-${validType} ${className}`}>
      <img 
        src={icon.src} 
        alt={icon.alt} 
        className="stroke-current shrink-0 h-6 w-6" 
      />
      <span>{message || children}</span>
      {onClose && (
        <button 
          className="btn btn-sm btn-ghost btn-circle"
          onClick={onClose}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default Notice;
