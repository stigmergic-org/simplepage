import React from 'react';
import { formatScaledValue, parseScaledInput } from '../utils/web3FormUtils';

const UnitToggle = ({
  leftLabel,
  rightLabel,
  value,
  onChange,
  inputValue,
  onValueChange,
  decimals = null,
  leftValue = 'scaled',
  rightValue = 'raw',
  size = 'xs',
}) => {
  const handleToggle = (nextUnit) => {
    if (value === nextUnit) {
      return;
    }

    if (decimals !== null && decimals !== undefined && inputValue && onValueChange) {
      try {
        const converted = nextUnit === rightValue
          ? parseScaledInput(inputValue, decimals)
          : formatScaledValue(BigInt(inputValue), decimals);
        onValueChange(converted);
      } catch (_error) {
        return;
      }
    }

    if (onChange) {
      onChange(nextUnit);
    }
  };

  return (
    <div className="join">
      <button
        type="button"
        className={`btn btn-${size} join-item ${value === leftValue ? 'btn-primary btn-soft' : 'btn-ghost'}`}
        onClick={() => handleToggle(leftValue)}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        className={`btn btn-${size} join-item ${value === rightValue ? 'btn-primary btn-soft' : 'btn-ghost'}`}
        onClick={() => handleToggle(rightValue)}
      >
        {rightLabel}
      </button>
    </div>
  );
};

export default UnitToggle;
