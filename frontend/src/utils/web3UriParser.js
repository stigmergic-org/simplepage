/**
 * Web3 URI Parser - ERC-6860 Compliant
 * 
 * Parses web3:// URIs according to ERC-6860 specification:
 * - web3://contract[:chainId]/method[/type!value...]?[query]
 * - Type specifications: type!value (explicit type with value)
 * - Query parameters: value, payable, returns, mode, labels, decimals
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

const isNumericSolidityType = (type) => {
  if (!type || typeof type !== 'string') return false;
  const lowerType = type.toLowerCase();
  return lowerType.startsWith('uint') || lowerType.startsWith('int');
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

const parseDecimalsList = (value) => {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('(') && trimmed.endsWith(')')
    ? trimmed.slice(1, -1)
    : trimmed;

  if (normalized === '') {
    return [];
  }

  return normalized.split(',').map((entry) => {
    const entryValue = entry.trim();
    if (entryValue === '') {
      return null;
    }
    if (!/^\d+$/.test(entryValue)) {
      throw new Error(`Invalid decimals value "${entryValue}". Expected an integer.`);
    }
    return Number(entryValue);
  });
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
  let mode = 'call';
  let returns = null;
  let labels = null;
  let decimals = null;

  if (queryString) {
    try {
      const searchParams = new URLSearchParams(queryString);
      const supportedParams = new Set(['value', 'payable', 'stateMutability', 'returns', 'mode', 'labels', 'decimals']);

      for (const key of searchParams.keys()) {
        if (!supportedParams.has(key)) {
          return {
            uri,
            error: `Unsupported query parameter "${key}". Supported parameters: value, payable, stateMutability, returns, mode, labels, decimals.`,
          };
        }
      }
      const valueStr = searchParams.get('value');
      value = valueStr ? parseValueToWei(valueStr) : null;
      payable = searchParams.get('payable') === 'true' || searchParams.get('stateMutability') === 'payable';

      // If payable=true, set value to 0 if not specified
      if (payable && value === null) {
        value = 0;
      }

      const returnsStr = searchParams.get('returns');
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
      const modeParam = searchParams.get('mode');
      if (modeParam) {
        if (modeParam === 'tx' || modeParam === 'call') {
          mode = modeParam;
        } else {
          return {
            uri,
            error: 'Invalid mode parameter. Use "mode=call" or "mode=tx".',
          };
        }
      }

      const labelsStr = searchParams.get('labels');
      if (labelsStr !== null) {
        const trimmed = labelsStr.trim();
        const normalized = trimmed.startsWith('(') && trimmed.endsWith(')')
          ? trimmed.slice(1, -1)
          : trimmed;
        labels = normalized
          .split(',')
          .map((param) => param.trim())
          .filter(Boolean);
      }

      const decimalsStr = searchParams.get('decimals');
      if (decimalsStr !== null) {
        try {
          decimals = parseDecimalsList(decimalsStr);
        } catch (error) {
          return {
            uri,
            error: error.message,
          };
        }
      }
    } catch (_error) {
      return {
        uri,
        error: 'Invalid query parameter format.',
      };
    }
  }

  let returnDecimals = null;
  if (decimals) {
    const expectedSlots = returns ? args.length + 1 : args.length;
    if (decimals.length !== expectedSlots) {
      return {
        uri,
        error: `Decimals count mismatch: expected ${expectedSlots} slot${expectedSlots === 1 ? '' : 's'} for ${args.length} argument${args.length === 1 ? '' : 's'}.`,
      };
    }

    if (returns) {
      returnDecimals = decimals[decimals.length - 1];
      decimals = decimals.slice(0, -1);
    }

    for (let i = 0; i < decimals.length; i++) {
      if (decimals[i] !== null && !isNumericSolidityType(args[i].type)) {
        return {
          uri,
          error: 'Decimals can only be used with int or uint arguments.',
        };
      }
    }

    if (returnDecimals !== null && returns && !isNumericSolidityType(returns)) {
      return {
        uri,
        error: 'Decimals can only be used with int or uint return values.',
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
    labels,
    decimals,
    returnDecimals,
    fragment,
  };
};



/**
 * Parses markdown metadata for a form title
 * @param {string} metadata - Raw metadata string from markdown
 * @returns {Object} Parsed metadata with formTitle
 */
export const parseWeb3Metadata = (metadata) => {
  if (!metadata || typeof metadata !== 'string') {
    return { formTitle: '' };
  }

  return { formTitle: metadata.trim() };
};

/**
 * Validates labels against parsed URI
 * @param {Object} parsedUri - Result from parseWeb3Uri
 * @returns {Array} Array of error messages (empty if valid)
 */
const validateLabels = (parsedUri) => {
  const errors = [];

  // Validate labels count matches args count
  if (parsedUri.labels && parsedUri.args) {
    if (parsedUri.labels.length !== parsedUri.args.length) {
      const paramWord = parsedUri.labels.length === 1 ? 'parameter' : 'parameters';
      const argWord = parsedUri.args.length === 1 ? 'argument' : 'arguments';
      errors.push(`Label mismatch: The web3 URI provides ${parsedUri.labels.length} label ${paramWord}, but the web3 link has ${parsedUri.args.length} ${argWord}. Add or remove labels so the counts match.`);
    }
  }

  return errors;
};

/**
 * Consolidated function to parse URI and metadata into complete form data structure
 * @param {string} uri - The web3 URI to parse
 * @param {string} metadata - The metadata string for form title
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
    decimals: [],
    returnDecimals: null,
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

    // Parse the metadata (form title)
    const parsedMeta = parseWeb3Metadata(metadata);

    // Validate labels against parsed URI
    const validationErrors = validateLabels(parsed);

    // Build consolidated args with parameter names
    const consolidatedArgs = parsed.args.map((arg, index) => ({
      label: parsed.labels?.[index] || arg.type,
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
      call: parsed.mode !== 'tx',
      flags: {},
      decimals: parsed.decimals || [],
      returnDecimals: parsed.returnDecimals ?? null,
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
