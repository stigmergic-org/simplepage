import { parseFormData, parseWeb3Uri, parseWeb3Metadata } from '../../src/utils/web3UriParser.js';

// Test vectors for valid parsing scenarios
const validTestVectors = [
  {
    name: 'basic transfer URI with metadata',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/uint256!1000',
    metadata: 'Transfer Tokens params=(to,amount)',
     expected: {
       contract: '0x1234567890123456789012345678901234567890',
       method: 'transfer',
       formTitle: 'Transfer Tokens',
       value: null,
       chainId: 1,
       returns: null,
       args: [
         {
           label: 'to',
           type: 'address',
           placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
         },
         {
           label: 'amount',
           type: 'uint256',
           placeholder: '1000'
         }
        ],
        call: false,
        flags: {},
        errors: []
      }
  },
  {
    name: 'URI with explicit type specifications',
    uri: 'web3://0x1234567890123456789012345678901234567890/mint/uint256!1000/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    metadata: 'Mint Tokens params=(amount,to)',
     expected: {
       contract: '0x1234567890123456789012345678901234567890',
       method: 'mint',
       formTitle: 'Mint Tokens',
       value: null,
       chainId: 1,
       returns: null,
       args: [
         {
           label: 'amount',
           type: 'uint256',
           placeholder: '1000'
         },
         {
           label: 'to',
           type: 'address',
           placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
         }
       ],
       call: false,
       flags: {},
       errors: []
     }
  },
  {
    name: 'URI with value parameter',
    uri: 'web3://0x1234567890123456789012345678901234567890/donate?value=1.5eth',
    metadata: 'Make Donation',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'donate',
      formTitle: 'Make Donation',
      value: 1500000000000000000, // 1.5 * 10^18 wei
      chainId: 1,
      returns: null,
      args: [],
      call: false,
      flags: {},
      errors: []
    }
  },
  {
    name: 'URI with payable flag',
    uri: 'web3://0x1234567890123456789012345678901234567890/donate?payable=true&value=0.1eth',
    metadata: 'Make Donation',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'donate',
      formTitle: 'Make Donation',
      value: 100000000000000000, // 0.1 * 10^18 wei
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with payable flag but no value',
    uri: 'web3://0x1234567890123456789012345678901234567890/donate?payable=true',
    metadata: 'Make Donation',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'donate',
      formTitle: 'Make Donation',
      value: 0, // payable=true sets value to 0
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'explicit address type',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    metadata: 'Transfer params=(to)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: 'Transfer',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'to',
          type: 'address',
          placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        }
      ],
      errors: []
    }
  },
  {
    name: 'explicit bool type',
    uri: 'web3://0x1234567890123456789012345678901234567890/setFlag/bool!true',
    metadata: 'Set Flag params=(enabled)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'setFlag',
      formTitle: 'Set Flag',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'enabled',
          type: 'bool',
          placeholder: 'true'
        }
      ],
      errors: []
    }
  },


   {
     name: 'metadata with extra whitespace',
     uri: 'web3://0x1234567890123456789012345678901234567890/transfer/uint256!1000',
     metadata: '  Transfer Tokens   params=(  amount  )  ',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: 'Transfer Tokens',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      errors: []
    }
  },
   {
     name: 'explicit type specs with and without values',
     uri: 'web3://0x1234567890123456789012345678901234567890/mint/uint256!0x/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
     metadata: 'Mint Tokens params=(amount,to)',
      expected: {
       contract: '0x1234567890123456789012345678901234567890',
       method: 'mint',
       formTitle: 'Mint Tokens',
       value: null,
       chainId: 1,
       returns: null,
       args: [
          {
            label: 'amount',
            type: 'uint256',
            placeholder: '0x'
          },
          {
            label: 'to',
            type: 'address',
            placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
          }
        ],
        errors: []
      }
   },
  {
    name: 'URI with chain ID',
    uri: 'web3://0x1234567890123456789012345678901234567890:42161/bridge/uint256!1000',
    metadata: 'Bridge Tokens params=(amount)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'bridge',
      formTitle: 'Bridge Tokens',
      value: null,
      chainId: 42161,
      returns: null,
      args: [
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      errors: []
    }
  },
  {
    name: 'default to chain ID 1 when not specified',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/uint256!1000',
    metadata: 'Transfer params=(amount)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: 'Transfer',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      errors: []
    }
  },
  {
    name: 'metadata without params',
    uri: 'web3://0x1234567890123456789012345678901234567890/greet',
    metadata: 'Say Hello',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'greet',
      formTitle: 'Say Hello',
      value: null,
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'use type names when metadata params not provided',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/uint256!1000',
    metadata: 'Transfer Tokens',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: 'Transfer Tokens',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'address',
          type: 'address',
          placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        },
        {
          label: 'uint256',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      errors: []
    }
  },
  {
    name: 'empty metadata',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/uint256!1000',
    metadata: '',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: '',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'uint256',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      errors: []
    }
  },
  {
    name: 'null metadata',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/uint256!1000',
    metadata: null,
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: '',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'uint256',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      errors: []
    }
  },
  {
    name: 'URI with multiple arguments of different types',
    uri: 'web3://0x1234567890123456789012345678901234567890/complexFunction/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/uint256!12345/bool!true/bytes!0x1234567890abcdef/address!mystring.eth',
    metadata: 'Complex Function params=(recipient,amount,enabled,data,name)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'complexFunction',
      formTitle: 'Complex Function',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'recipient',
          type: 'address',
          placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        },
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '12345'
        },
        {
          label: 'enabled',
          type: 'bool',
          placeholder: 'true'
        },
        {
          label: 'data',
          type: 'bytes',
          placeholder: '0x1234567890abcdef'
        },
        {
          label: 'name',
          type: 'address',
          placeholder: 'mystring.eth'
        }
      ],
      errors: []
    }
  },

  {
    name: 'URI with fragment',
    uri: 'web3://0x1234567890123456789012345678901234567890/view#section1',
    metadata: 'View Section',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'view',
      formTitle: 'View Section',
      value: null,
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with complex query parameters',
    uri: 'web3://0x1234567890123456789012345678901234567890/call?value=0.5eth&payable=true&mode=auto',
    metadata: 'Call Function',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'call',
      formTitle: 'Call Function',
      value: 500000000000000000, // 0.5 * 10^18 wei
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with wei value',
    uri: 'web3://0x1234567890123456789012345678901234567890/donate?value=1000000000000000000',
    metadata: 'Make Donation',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'donate',
      formTitle: 'Make Donation',
      value: 1000000000000000000, // Direct wei value
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with only contract (no method)',
    uri: 'web3://0x1234567890123456789012345678901234567890',
    metadata: 'Contract Info',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'call',
      formTitle: 'Contract Info',
      value: null,
      chainId: 1,
      returns: null,
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with encoded characters',
    uri: encodeURIComponent('web3://0x1234567890123456789012345678901234567890/setName/address!Hello%20World'),
    metadata: 'Set Name params=(name)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'setName',
      formTitle: 'Set Name',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'name',
          type: 'address',
          placeholder: 'Hello World'
        }
      ],
      errors: []
    }
  },
  {
    name: 'explicit type specs with null values',
    uri: 'web3://0x1234567890123456789012345678901234567890/mint/uint256!0x/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    metadata: 'Mint Tokens params=(amount,to)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
        method: 'mint',
        formTitle: 'Mint Tokens',
        value: null,
        chainId: 1,
        returns: null,
        args: [
          {
            label: 'amount',
            type: 'uint256',
            placeholder: '0x'
          },
          {
            label: 'to',
            type: 'address',
            placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
          }
        ],
        errors: []
      }
    },
   {
     name: 'explicit bytes type',
    uri: 'web3://0x1234567890123456789012345678901234567890/setData/bytes!0x1234567890abcdef',
    metadata: 'Set Data params=(data)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'setData',
      formTitle: 'Set Data',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'data',
          type: 'bytes',
          placeholder: '0x1234567890abcdef'
        }
      ],
      errors: []
    }
  },
  {
    name: 'explicit address type for domain',
    uri: 'web3://0x1234567890123456789012345678901234567890/setName/address!vitalik.eth',
    metadata: 'Set Name params=(name)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'setName',
      formTitle: 'Set Name',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'name',
          type: 'address',
          placeholder: 'vitalik.eth'
        }
      ],
      errors: []
    }
  },
  {
    name: 'URI with returns parameter',
    uri: 'web3://0x1234567890123456789012345678901234567890/getBalance?returns=(uint256)',
    metadata: 'Get Balance',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'getBalance',
      formTitle: 'Get Balance',
      value: null,
      chainId: 1,
      returns: 'uint256',
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with returns parameter',
    uri: 'web3://0x1234567890123456789012345678901234567890/getOwner?returns=(address)',
    metadata: 'Get Owner',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'getOwner',
      formTitle: 'Get Owner',
      value: null,
      chainId: 1,
      returns: 'address',
      args: [],
      errors: []
    }
  },
  {
    name: 'URI with returns parameter and arguments',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/uint256!1000?returns=(bool)',
    metadata: 'Transfer params=(amount)',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: 'Transfer',
      value: null,
      chainId: 1,
      returns: 'bool',
      args: [
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      call: false,
      flags: {},
      errors: []
    }
  },
  {
    name: 'URI with empty returns parameter (void function)',
    uri: 'web3://0x1234567890123456789012345678901234567890/execute?returns=()',
    metadata: 'Execute Transaction',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'execute',
      formTitle: 'Execute Transaction',
      value: null,
      chainId: 1,
      returns: null,
      args: [],
      call: false,
      flags: {},
      errors: []
    }
  },
  {
    name: 'metadata with call=true flag',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/uint256!1000',
    metadata: 'Transfer Tokens params=(to,amount) call=true',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'transfer',
      formTitle: 'Transfer Tokens',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'to',
          type: 'address',
          placeholder: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        },
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      call: true,
      flags: { call: true },
      errors: []
    }
  },
  {
    name: 'metadata with multiple flags',
    uri: 'web3://0x1234567890123456789012345678901234567890/mint/uint256!1000',
    metadata: 'Mint Tokens params=(amount) call=true payable=false',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'mint',
      formTitle: 'Mint Tokens',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'amount',
          type: 'uint256',
          placeholder: '1000'
        }
      ],
      call: true,
      flags: { call: true, payable: false },
      errors: []
    }
  },
  {
    name: 'metadata with numeric and string flags',
    uri: 'web3://0x1234567890123456789012345678901234567890/setValue/uint256!42',
    metadata: 'Set Value params=(value) version=1.0 gasLimit=21000',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'setValue',
      formTitle: 'Set Value',
      value: null,
      chainId: 1,
      returns: null,
      args: [
        {
          label: 'value',
          type: 'uint256',
          placeholder: '42'
        }
      ],
      call: false,
      flags: { version: 1.0, gasLimit: 21000 },
      errors: []
    }
  },
  {
    name: 'metadata with flags but no params',
    uri: 'web3://0x1234567890123456789012345678901234567890/initialize',
    metadata: 'Initialize Contract call=true',
    expected: {
      contract: '0x1234567890123456789012345678901234567890',
      method: 'initialize',
      formTitle: 'Initialize Contract',
      value: null,
      chainId: 1,
      returns: null,
      args: [],
      call: true,
      flags: { call: true },
      errors: []
    }
  },

];

// Test vectors for invalid parsing scenarios
const invalidTestVectors = [
  {
    name: 'empty URI',
    uri: '',
    metadata: 'Some Form',
    error: 'No web3 link found'
  },
  {
    name: 'null URI',
    uri: null,
    metadata: 'Some Form',
    error: 'No web3 link found'
  },
  {
    name: 'invalid web3 URI format',
    uri: 'not-a-web3-uri',
    metadata: 'Some Form',
    error: 'Unable to understand the web3 link format'
  },
   {
     name: 'URI with invalid contract address format',
     uri: 'web3://invalid-contract/transfer/1000',
     metadata: 'Transfer',
     error: 'Invalid contract name format. Must be a valid Ethereum address (0x + 40 hex digits) or domain name.'
   },
   {
     name: 'URI with userinfo (not supported)',
     uri: 'web3://user@0x1234567890123456789012345678901234567890/transfer/uint256!1000',
     metadata: 'Transfer params=(amount)',
     error: 'Invalid contract name format. Must be a valid Ethereum address (0x + 40 hex digits) or domain name.'
   },
   {
     name: 'metadata parameter count mismatch',
     uri: 'web3://0x1234567890123456789012345678901234567890/transfer/address!0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/uint256!1000',
     metadata: 'Transfer params=(to)',
     error: 'Parameter mismatch: The form description specifies 1 parameter, but the web3 link expects 2 arguments'
   },
  {
    name: 'invalid Solidity type in explicit specification',
    uri: 'web3://0x1234567890123456789012345678901234567890/set/invalidtype!value',
    metadata: 'Set Value params=(value)',
    error: 'Invalid Solidity type "invalidtype" in web3 URI. Only valid Solidity types are supported.'
  },
   {
     name: 'malformed query parameters',
     uri: 'web3://0x1234567890123456789012345678901234567890/donate?value0.1eth',
     metadata: 'Donate'
   },
  {
    name: 'URI without explicit types',
    uri: 'web3://0x1234567890123456789012345678901234567890/transfer/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/1000',
    metadata: 'Transfer params=(to,amount)',
    error: 'All arguments must use explicit type notation: "type!value". Auto-detection is not supported.'
  },
   {
     name: 'URI with empty argument value',
     uri: 'web3://0x1234567890123456789012345678901234567890/mint/uint256!',
     metadata: 'Mint Tokens params=(amount)',
     error: 'All arguments must have values. Use "type!0x" for null values.'
   },
   {
     name: 'invalid returns format - missing parentheses',
     uri: 'web3://0x1234567890123456789012345678901234567890/getData?returns=uint256',
     metadata: 'Get Data',
     error: 'Invalid returns format. Expected format: "(type)"'
   },
    {
      name: 'invalid Solidity return type',
      uri: 'web3://0x1234567890123456789012345678901234567890/getData?returns=(invalidtype)',
      metadata: 'Get Data',
      error: 'Invalid Solidity return type "invalidtype". Only valid Solidity types are supported.'
    },
    {
      name: 'call=true with value parameter conflict',
      uri: 'web3://0x1234567890123456789012345678901234567890/transfer/uint256!1000?value=0.1eth',
      metadata: 'Transfer params=(amount) call=true',
      error: 'Conflict: Metadata specifies call=true'
    },
    {
      name: 'call=true with payable=true conflict',
      uri: 'web3://0x1234567890123456789012345678901234567890/donate?payable=true',
      metadata: 'Donate call=true',
      error: 'Conflict: Metadata specifies call=true'
    }
 ];

describe('parseWeb3Metadata', () => {
  describe('Valid metadata parsing', () => {
    const testCases = [
      {
        name: 'basic form title only',
        input: 'Transfer Tokens',
        expected: { formTitle: 'Transfer Tokens', params: null, flags: {} }
      },
      {
        name: 'form title with params',
        input: 'Transfer Tokens params=(to,amount)',
        expected: {
          formTitle: 'Transfer Tokens',
          params: ['to', 'amount'],
          flags: {}
        }
      },
      {
        name: 'form title with params and single flag',
        input: 'Transfer Tokens params=(to,amount) call=true',
        expected: {
          formTitle: 'Transfer Tokens',
          params: ['to', 'amount'],
          flags: { call: true }
        }
      },
      {
        name: 'form title with multiple flags',
        input: 'Mint Tokens params=(amount) call=true payable=false version=2',
        expected: {
          formTitle: 'Mint Tokens',
          params: ['amount'],
          flags: { call: true, payable: false, version: 2 }
        }
      },
      {
        name: 'form title with flags but no params',
        input: 'Initialize Contract call=true payable=false',
        expected: {
          formTitle: 'Initialize Contract',
          params: null,
          flags: { call: true, payable: false }
        }
      },
      {
        name: 'flags with different value types',
        input: 'Set Value gasLimit=21000 version=1.5 enabled=true disabled=false',
        expected: {
          formTitle: 'Set Value',
          params: null,
          flags: { gasLimit: 21000, version: 1.5, enabled: true, disabled: false }
        }
      },
      {
        name: 'empty string',
        input: '',
        expected: { formTitle: '', params: null, flags: {} }
      },
      {
        name: 'null input',
        input: null,
        expected: { formTitle: '', params: null, flags: {} }
      }
    ];

    testCases.forEach(({ name, input, expected }) => {
      it(`should parse: ${name}`, () => {
        const result = parseWeb3Metadata(input);
        expect(result).toEqual(expected);
      });
    });
  });
});

describe('parseFormData', () => {
  describe('Valid parsing scenarios', () => {
    validTestVectors.forEach(({ name, uri, metadata, expected }) => {
      it(`should handle: ${name}`, () => {
        const result = parseFormData(uri, metadata);

        expect(result.errors).toHaveLength(0);

        // Check that new fields are present
        expect(result).toHaveProperty('call');
        expect(result).toHaveProperty('flags');
        expect(typeof result.call).toBe('boolean');
        expect(typeof result.flags).toBe('object');

        // Check specific expected values, allowing for new fields
        Object.keys(expected).forEach(key => {
          expect(result[key]).toEqual(expected[key]);
        });
      });
    });
  });

  describe('Invalid parsing scenarios', () => {
    invalidTestVectors.forEach(({ name, uri, metadata, error }) => {
      it(`should handle: ${name}`, () => {
        const result = parseFormData(uri, metadata);

        if (error) {
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toMatch(error);
        } else {
          // Some invalid cases don't produce errors but handle gracefully
          expect(result.contract).toBeDefined();
        }
      });
    });
  });
});