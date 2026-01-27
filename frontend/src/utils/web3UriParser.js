/**
 * Web3 URI Parser - ERC-6860 Compliant
 * 
 * Parses web3:// URIs according to ERC-6860 specification:
 * - web3://contract[:chainId]/method[/type!value...]?[query]
 * - Type specifications: type!value (explicit type with value)
 * - Query parameters: value, payable, returns, mode
 */

/**
 * Validates if a string is a valid Solidity type
 * @param {string} type - Type to validate
 * @returns {boolean} True if valid Solidity type
 */
const isValidSolidityType = (type) => {
  if (!type || typeof type !== 'string') return false;

  const lowerType = type.toLowerCase();

  // Basic types
  if (['bool', 'address', 'string', 'bytes'].includes(lowerType)) {
    return true;
  }

  // Integer types (int/uint with optional size)
  if (/^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/.test(lowerType)) {
    return true;
  }

  // Fixed-size bytes
  if (/^bytes(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32)?$/.test(lowerType)) {
    return true;
  }

  return false;
};

/**
 * Convert value string to wei as a number
 * @param {string} valueStr - Value string like "1.5eth", "1000000000000000000", etc.
 * @returns {number|null} Value in wei as a number, or null if invalid
 */
const parseValueToWei = (valueStr) => {
  if (!valueStr) return null;

  try {
    // Handle eth units
    const ethMatch = valueStr.match(/^(\d+(?:\.\d+)?)eth$/i);
    if (ethMatch) {
      const ethValue = parseFloat(ethMatch[1]);
      return Math.floor(ethValue * 1e18); // Convert to wei
    }

    // Handle direct wei values (numeric strings)
    if (/^\d+$/.test(valueStr)) {
      return parseInt(valueStr, 10);
    }

    // Invalid format
    return null;
  } catch (_error) {
    return null;
  }
};

/**
 * Parses a web3 URI according to ERC-6860 spec
 * @param {string} uri - The URI to parse
 * @returns {Object|null} Parsed URI object with error property if invalid, or null for empty input
 */
export const parseWeb3Uri = (uri) => {
  // Return null for empty input
  if (!uri || uri.trim() === '') {
    return null;
  }

  // Basic validation - must start with web3://
  if (!uri.toLowerCase().startsWith('web3://')) {
    return null;
  }

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

  // Parse authority: contract[:chainId]
  const [contract, chainIdRaw] = authority.split(':');
  let chainId = chainIdRaw;
  if (chainId) {
    chainId = Number.parseInt(chainId, 10) || undefined;
  }

  // Validate contract name format (ERC-6860: address or domainName)
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(contract);
  const isValidDomainName = /^[a-zA-Z0-9.-]+$/.test(contract) && contract.includes('.');
  if (!isValidAddress && !isValidDomainName) {
    return {
      uri,
      error: 'Invalid contract name format. Must be a valid Ethereum address (0x + 40 hex digits) or domain name.',
    };
  }

  // Parse path segments
  const pathSegments = pathSegmentsRaw.map(decodeURIComponent).filter(Boolean);
  const method = pathSegments[0] || 'call';

  // Parse arguments from path segments (everything after method)
  const args = [];
  for (let i = 1; i < pathSegments.length; i++) {
    const segment = pathSegments[i];

    if (!segment.includes('!')) {
      return {
        uri,
        error: 'All arguments must use explicit type notation: "type!value". Auto-detection is not supported.',
      };
    }

    // Explicit type with value: "type!value" format
    const [type, ...valueParts] = segment.split('!');
    const value = valueParts.join('!'); // Rejoin in case value contains !

    // Validate that the type is a valid Solidity type
    if (!isValidSolidityType(type)) {
      return {
        uri,
        error: `Invalid Solidity type "${type}" in web3 URI. Only valid Solidity types are supported.`,
      };
    }

    if (!value) {
      return {
        uri,
        error: 'All arguments must have values. Use "type!0x" for null values.',
      };
    }

    // Valid format with value
    args.push({
      label: value, // Use value as label
      type: type.toLowerCase(), // Convert to lowercase
      placeholder: value // Use value as placeholder
    });
  }

  // Parse query parameters
  let value = null;
  let payable = false;
  let mode = 'auto';
  let returns = null;

  if (queryString) {
    try {
      const params = new URLSearchParams(queryString);
      const valueStr = params.get('value');
      value = valueStr ? parseValueToWei(valueStr) : null;
      payable = params.get('payable') === 'true' || params.get('stateMutability') === 'payable';

      // If payable=true, set value to 0 if not specified
      if (payable && value === null) {
        value = 0;
      }

      const returnsStr = params.get('returns');
      if (returnsStr) {
        // Parse returns format like "(uint256)" or "()" for void - must be wrapped in parentheses
        const returnsMatch = returnsStr.match(/^\(([^)]*)\)$/);
        if (!returnsMatch) {
          return {
            uri,
            error: 'Invalid returns format. Expected format: "(type)" or "()" for void',
          };
        }
        const returnType = returnsMatch[1];
        // Empty string means void/no return value
        if (returnType === '') {
          returns = null;
        } else if (!isValidSolidityType(returnType)) {
          return {
            uri,
            error: `Invalid Solidity return type "${returnType}". Only valid Solidity types are supported.`,
          };
        } else {
          returns = returnType;
        }
      }
      mode = params.get('mode') || 'auto';
    } catch (_error) {
      return {
        uri,
        error: 'Invalid query parameter format.',
      };
    }
  }

  return {
    uri,
    contract,
    chainId: chainId || 1, // Default to mainnet (chain ID 1) when undefined
    method,
    args,
    value,
    payable,
    returns,
    mode,
    fragment,
  };
};



/**
 * Parses flag string into object with typed values
 * @param {string} flagsStr - Space-separated key=value pairs
 * @returns {Object} Parsed flags object
 */
const parseFlags = (flagsStr) => {
  const flags = {};
  const flagPairs = flagsStr.trim().split(/\s+/);
  
  for (const pair of flagPairs) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      // Convert string values to appropriate types
      if (value === 'true') flags[key] = true;
      else if (value === 'false') flags[key] = false;
      else if (!isNaN(value)) flags[key] = Number(value);
      else flags[key] = value;
    }
  }
  
  return flags;
};

/**
 * Parses markdown metadata for form title, parameter names, and flags
 * Format: "Title params=(param1,param2) flag1=value1 flag2=value2"
 * @param {string} metadata - Raw metadata string from markdown
 * @returns {Object} Parsed metadata with formTitle, params, and flags
 */
export const parseWeb3Metadata = (metadata) => {
  if (!metadata || typeof metadata !== 'string') {
    return { formTitle: '', params: null, flags: {} };
  }

  const trimmed = metadata.trim();

  // Check if the string contains params: "Title params=(p1,p2) flags..."
  const paramsMatch = trimmed.match(/^(.+?)\s+params=\(([^)]+)\)(?:\s+(.+))?$/);
  if (paramsMatch) {
    const [, title, paramsStr, flagsStr] = paramsMatch;
    const params = paramsStr.split(',').map(p => p.trim()).filter(Boolean);
    const flags = flagsStr ? parseFlags(flagsStr) : {};

    return {
      formTitle: title.trim(),
      params,
      flags
    };
  }

  // No params, but might have flags: "Title flag1=value1 flag2=value2"
  const parts = trimmed.split(/\s+/);
  const titleParts = [];
  const flagParts = [];

  for (const part of parts) {
    if (part.includes('=')) {
      flagParts.push(part);
    } else {
      titleParts.push(part);
    }
  }

  return {
    formTitle: titleParts.join(' '),
    params: null,
    flags: flagParts.length > 0 ? parseFlags(flagParts.join(' ')) : {}
  };
};

/**
 * Validates metadata against parsed URI
 * @param {Object} parsedUri - Result from parseWeb3Uri
 * @param {Array} params - Parameter names from metadata
 * @param {Object} flags - Flags from metadata
 * @returns {Array} Array of error messages (empty if valid)
 */
const validateMetadata = (parsedUri, params, flags) => {
  const errors = [];

  // Validate params count matches args count
  if (params && params.length > 0 && parsedUri.args) {
    if (params.length !== parsedUri.args.length) {
      const paramWord = params.length === 1 ? 'parameter' : 'parameters';
      const argWord = parsedUri.args.length === 1 ? 'argument' : 'arguments';
      errors.push(`Parameter mismatch: The form description specifies ${params.length} ${paramWord}, but the web3 link expects ${parsedUri.args.length} ${argWord}.`);
    }
  }

  // Validate call flag conflicts
  if (flags.call === true) {
    const hasExplicitValue = parsedUri.uri.includes('value=') && parsedUri.value !== null && parsedUri.value !== undefined;
    if (hasExplicitValue) {
      errors.push('Conflict: Metadata specifies call=true (state-modifying operation) but URI contains a value parameter. State-modifying operations should not include value transfers.');
    }
    if (parsedUri.payable === true) {
      errors.push('Conflict: Metadata specifies call=true (state-modifying operation) but URI has payable=true. State-modifying operations should not be payable.');
    }
  }

  return errors;
};

/**
 * Consolidated function to parse URI and metadata into complete form data structure
 * @param {string} uri - The web3 URI to parse
 * @param {string} metadata - The metadata string for form title and parameter names
 * @returns {Object} Result object with contract, method, formTitle, args, and errors
 */
export const parseFormData = (uri, metadata) => {
  const emptyResult = {
    contract: null,
    method: null,
    formTitle: '',
    value: null,
    chainId: null,
    returns: null,
    args: [],
    call: false,
    flags: {},
    errors: []
  };

  // Handle empty URI
  if (!uri) {
    return {
      ...emptyResult,
      errors: ['No web3 link found. Please check the markdown syntax.']
    };
  }

  try {
    // Parse the web3 URI
    const parsed = parseWeb3Uri(decodeURIComponent(uri));
    
    if (!parsed) {
      return {
        ...emptyResult,
        errors: ['Unable to understand the web3 link format. Please check the URL.']
      };
    }

    // Check for parsing errors in the URI itself
    if (parsed.error) {
      return {
        ...emptyResult,
        errors: [parsed.error]
      };
    }

    // Parse the metadata (form title, parameter names, and flags)
    const parsedMeta = parseWeb3Metadata(metadata);

    // Validate metadata against parsed URI
    const validationErrors = validateMetadata(parsed, parsedMeta.params, parsedMeta.flags);

    // Build consolidated args with parameter names
    const consolidatedArgs = parsed.args.map((arg, index) => ({
      label: parsedMeta.params?.[index] || arg.type,
      type: arg.type,
      placeholder: arg.placeholder
    }));

    return {
      contract: parsed.contract,
      method: parsed.method,
      formTitle: parsedMeta.formTitle,
      value: parsed.value,
      chainId: parsed.chainId,
      returns: parsed.returns,
      args: consolidatedArgs,
      call: parsedMeta.flags.call === true,
      flags: parsedMeta.flags,
      errors: validationErrors
    };

  } catch (err) {
    console.error('Error parsing URI or metadata:', err);
    return {
      ...emptyResult,
      errors: ['Something went wrong while processing the web3 link. Please check the format.']
    };
  }
};
