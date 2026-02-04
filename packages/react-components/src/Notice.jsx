import React from 'react';
import { ICONS } from './icons.js';
import Icon from './Icon.jsx';

const VALID_TYPES = ['alert-error', 'alert-warning', 'alert-success', 'alert-info'];

const Notice = ({ type = 'info', message, className = '', onClose, children, buttonText }) => {
  const validType = VALID_TYPES.find((item) => item.includes(type)) || 'alert-info';
  const baseIconName = type === 'success' ? 'check' : type;
  const iconName = ICONS[baseIconName] ? baseIconName : 'info';

  return (
    <div className={`alert mb-6 ${validType} alert-outline ${className}`}>
      <Icon name={iconName} size={6} className="shrink-0" />
      <div>{message || children}</div>
      {onClose && (
        <button
          className={`btn btn-sm ${buttonText ? '' : 'btn-ghost btn-circle'}`}
          onClick={onClose}
        >
          {buttonText ? (
            buttonText
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};

export default Notice;
