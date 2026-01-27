/**
 * Web3 Form Utilities
 * Utilities for encoding, validating, and formatting web3 form data
 */

/**
 * Build minimal ABI from parsed web3 URI data
 * @param {Object} parsedData - Parsed web3 URI data
 * @returns {Array} Minimal ABI array
 */
export const buildMinimalAbi = (parsedData) => {
  if (!parsedData) return [];
  
  return [{
    name: parsedData.method,
    type: 'function',
    stateMutability: parsedData.call ? 'view' : 
                     (parsedData.payable ? 'payable' : 'nonpayable'),
    inputs: parsedData.args.map(arg => ({
      name: arg.label,
      type: arg.type
    })),
    outputs: parsedData.returns ? [{ type: parsedData.returns }] : []
  }];
};

/**
 * Convert form input string to proper Solidity type
 * @param {string} value - Input value as string
 * @param {string} type - Solidity type
 * @returns {*} Converted value
 * @throws {Error} If value is invalid for the type
 */
export const convertInputToType = (value, type) => {
  // Handle empty/null
  if (!value || value === '') {
    throw new Error(`Value required for ${type}`);
  }

  const lowerType = type.toLowerCase();

  // Address
  if (lowerType === 'address') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value) && !value.includes('.')) {
      throw new Error(`Invalid address format: ${value}`);
    }
    return value;
  }

  // Boolean
  if (lowerType === 'bool') {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`Invalid bool: must be "true" or "false"`);
    }
    return value === 'true';
  }

  // Unsigned integers
  if (lowerType.startsWith('uint')) {
    try {
      const bigIntValue = BigInt(value);
      if (bigIntValue < 0n) {
        throw new Error(`Unsigned integer cannot be negative`);
      }
      return bigIntValue;
    } catch {
      throw new Error(`Invalid uint: ${value}`);
    }
  }

  // Signed integers
  if (lowerType.startsWith('int')) {
    try {
      return BigInt(value);
    } catch {
      throw new Error(`Invalid int: ${value}`);
    }
  }

  // Bytes (fixed or dynamic)
  if (lowerType.startsWith('bytes')) {
    if (!/^0x[a-fA-F0-9]*$/.test(value)) {
      throw new Error(`Invalid bytes format: must be hex string starting with 0x`);
    }
    return value;
  }

  // String
  if (lowerType === 'string') {
    return value;
  }

  // Unknown type, pass through
  return value;
};

/**
 * Validate and encode all arguments
 * @param {Object} parsedData - Parsed web3 URI data
 * @param {Object} formInputs - Form input values
 * @returns {Object} { args: Array, errors: Array }
 */
export const encodeArguments = (parsedData, formInputs) => {
  const encodedArgs = [];
  const errors = [];

  if (!parsedData || !parsedData.args) {
    return { args: encodedArgs, errors };
  }

  parsedData.args.forEach((arg) => {
    const inputValue = formInputs[arg.label];
    
    // Check required
    if (!inputValue || inputValue.trim() === '') {
      errors.push(`${arg.label} is required`);
      return;
    }

    // Convert type
    try {
      const converted = convertInputToType(inputValue, arg.type);
      encodedArgs.push(converted);
    } catch (err) {
      errors.push(`${arg.label}: ${err.message}`);
    }
  });

  return { args: encodedArgs, errors };
};

/**
 * Format return value for display
 * @param {*} value - Return value from contract call
 * @param {string} type - Solidity type
 * @returns {string} Formatted value for display
 */
export const formatReturnValue = (value, type) => {
  if (value === null || value === undefined) {
    return 'null';
  }

  const lowerType = type?.toLowerCase() || '';

  // Boolean
  if (lowerType === 'bool') {
    return value ? 'true' : 'false';
  }

  // BigInt/uint/int
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Address - truncate middle
  if (lowerType === 'address' && typeof value === 'string') {
    if (value.length === 42) {
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }
    return value;
  }

  // Bytes - truncate if long
  if (lowerType.startsWith('bytes') && typeof value === 'string') {
    if (value.length > 20) {
      return `${value.slice(0, 10)}...${value.slice(-8)}`;
    }
    return value;
  }

  // Default: toString
  return value.toString();
};

/**
 * Validate that user is on correct chain
 * @param {number} expectedChainId - Expected chain ID
 * @param {number} currentChainId - Current wallet chain ID
 * @returns {boolean} True if chains match
 */
export const validateChainMatch = (expectedChainId, currentChainId) => {
  return expectedChainId === currentChainId;
};
