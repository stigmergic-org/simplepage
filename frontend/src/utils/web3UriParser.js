/**
 * Web3 URI Parser - ERC-6860 Compliant
 * 
 * Parses web3:// URIs according to ERC-6860 specification:
 * - web3://[userinfo@]contract[:chainId]/path[?query]
 * - Auto-mode path: [/method/arg1/arg2/...] (arguments are path segments)
 * - Type specifications: [type!]value (explicit) or [type!] (required, no value)
 * - Auto-detection rules for arguments without explicit types
 */

/**
 * Checks if a string is a valid web3 URI
 * @param {string} href - The URI to validate
 * @returns {boolean} True if valid web3 URI
 */
export const isWeb3Uri = (href = '') =>
  typeof href === 'string' && href.toLowerCase().startsWith('web3://');

/**
 * Escapes HTML characters for safe display
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export const escapeHtml = (text = '') =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/https?:\/\//g, 'https://');

/**
 * Validates a web3 URI according to ERC-6860 spec
 * Returns structured object or error message
 * @param {string} uri - The URI to validate
 * @returns {Object|null} Parsed URI object or null if invalid
 */
export const parseWeb3Uri = (uri) => {
  // Return null for empty input
  if (!uri || uri.trim() === '') {
    return null;
  }

  // Basic validation - must start with web3://
  const rest = uri.slice(uri.indexOf('://') + 3);
  const [authorityAndPath, fragment] = rest.split('#');
  const [pathPart, queryString] = authorityAndPath.split('?');
  const [authority, ...pathSegmentsRaw] = pathPart.split('/');

  if (!authority) {
    return {
      uri,
      error: 'Missing contract authority in web3 URI',
    };
  }

  // Parse authority: [userinfo@]contract[:chainId]
  let userinfo, contract, chainId;
  const contractSegment = authority;
  if (contractSegment.includes('@')) {
    [userinfo, contractSegment] = contractSegment.split('@');
  } else {
    contract = contractSegment;
  }

  if (contract.includes(':')) {
    [contract, chainId] = contract.split(':');
    chainId = Number.parseInt(chainId, 10) || undefined;
  } else {
    contract = contract;
  }

  // Parse path segments
  const pathSegments = pathSegmentsRaw.map(decodeURIComponent).filter(Boolean);
  const method = pathSegments[0] || 'call';

  // Parse arguments from path segments (everything after method)
  const args = [];
  for (let i = 1; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    
    if (segment.includes('!')) {
      // Explicit type with value: "type!value" format
      const [type, ...valueParts] = segment.split('!');
      const value = valueParts.join('!'); // Rejoin in case value contains !
      
      if (!value) {
        // Invalid format per ERC-6860 - use "type!0x" for no default input
        args.push({
          label: type, // Use type as label
          type: type.toLowerCase(), // Convert to lowercase
          placeholder: '0x', // Use 0x as placeholder for no default input
          required: true // Required since no explicit value provided
        });
      } else {
        // Valid format with value
        args.push({
          label: value, // Use value as label
          type: type.toLowerCase(), // Convert to lowercase
          placeholder: value, // Use value as placeholder
          required: !value // Required if no value provided
        });
      }
    } else {
      // No explicit type, auto-detect based on value
      let detectedType = 'address'; // Default
      let placeholder = segment;
      
      // Auto-detection rules from ERC-6860 spec
      if (/^\d+$/.test(segment)) {
        detectedType = 'uint256';
        placeholder = segment;
      } else if (/^0x[a-fA-F0-9]{64}$/.test(segment)) {
        detectedType = 'bytes32';
        placeholder = segment;
      } else if (/^0x[a-fA-F0-9]{40}$/.test(segment)) {
        detectedType = 'address';
        placeholder = segment;
      } else if (/^0x[a-fA-F0-9]+$/.test(segment)) {
        detectedType = 'bytes';
        placeholder = segment;
      } else if (segment === 'true' || segment === 'false') {
        detectedType = 'bool';
        placeholder = segment;
      } else {
        // Treat as domain name or string
        detectedType = 'address';
        placeholder = segment;
      }
      
      args.push({
        label: segment,
        type: detectedType,
        placeholder: placeholder,
        required: false // All auto-detected arguments are optional
      });
    }
  }

  // Parse query parameters
  let value = null;
  let payable = false;
  let mode = 'auto';
  
  if (queryString) {
    // Handle malformed query strings like "value0.01eth"
    if (queryString.includes('=')) {
      const params = new URLSearchParams(queryString);
      value = params.get('value') || null;
      payable = params.get('payable') === 'true' || params.get('stateMutability') === 'payable';
      mode = params.get('mode') || 'auto';
    } else {
      // Try to parse simple format like "value0.01eth"
      const valueMatch = queryString.match(/^value(.+)$/);
      if (valueMatch) {
        value = valueMatch[1];
        payable = true; // Assume payable if value is specified
      }
    }
  }

  return {
    uri,
    userinfo,
    contract,
    chainId,
    method,
    args,
    value,
    payable,
    mode,
    fragment,
  };
};

/**
 * Validates that a parsed web3 URI has all required components
 * @param {Object} parsed - Result from parseWeb3Uri
 * @returns {Object} Validation result with error messages
 */
export const validateWeb3Uri = (parsed) => {
  if (!parsed) {
    return {
      valid: false,
      error: 'Invalid URI object',
    };
  }

  const errors = [];

  if (!parsed.method) {
    errors.push('Missing method in web3 URI');
  }

  if (!parsed.contract) {
    errors.push('Missing contract address');
  }

  if (parsed.args.some(arg => arg.required && !arg.placeholder)) {
    const invalidArgs = parsed.args.filter(arg => arg.required && arg.placeholder === '0x');
    const invalidSpecs = invalidArgs.map(arg => `${arg.type}!`).join(', ');
    errors.push(`Invalid type specification: ${invalidSpecs}. According to ERC-6860, use format "type!value" with a value, or "type!0x" for no default input.`);
  }

  if (!getNetworkName(parsed.chainId || 1)) {
    errors.push(`Network not supported: Chain ID ${parsed.chainId || 1}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};