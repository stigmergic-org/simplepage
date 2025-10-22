import { CID } from 'multiformats/cid'
import { fromString, toString } from 'uint8arrays'
import { encodeFunctionData, decodeAbiParameters, namehash } from 'viem'
import { contracts } from './contracts.js'

export function ensContentHashToCID(contentHash) {
  // If contentHash starts with 0x, remove it
  contentHash = contentHash.startsWith('0x') ? contentHash.slice(2) : contentHash
  
  // Check if it's an IPFS contenthash (starts with 'e301')
  if (contentHash.startsWith('e301')) {
    // Extract the CID part (skipping 'e301' and '01' bytes)
    const cidHex = contentHash.slice(4)
    // Convert hex to Uint8Array
    const cidBytes = fromString(cidHex, 'base16')
    // Convert bytes to CID object
    return CID.decode(cidBytes)
  } else {
    throw new Error('Unsupported contenthash format')
  }
}


export function cidToENSContentHash(cid) {
  // Ensure the input is a CID instance
  if (!(cid instanceof CID)) {
    throw new Error('Input must be a CID instance')
  }

  // Convert CID to bytes
  const cidBytes = cid.bytes

  // Prepend 'e301' for IPFS and '01' for CIDv1
  const contentHashBytes = new Uint8Array(2 + cidBytes.length)
  contentHashBytes[0] = 0xe3
  contentHashBytes[1] = 0x01
  contentHashBytes.set(cidBytes, 2)

  // Convert to hex string and prepend '0x'
  return '0x' + toString(contentHashBytes, 'base16')
}

/**
 * DNS encode an ENS name as per ENSIP-10
 * Browser-compatible implementation (no Buffer)
 */
function dnsEncodeName(name) {
  if (!name) return '0x00'
  
  // Remove trailing period if present
  if (name.endsWith('.')) {
      name = name.substring(0, name.length - 1)
  }
  
  // Split the name by periods to get the labels
  const labels = name.split('.');
  
  // Encode each label with its length
  const result = [];
  for (const label of labels) {
      // Each label is prefixed with its length as a single byte
      if (label.length > 0) {
          // Add length byte
          result.push(label.length);
          // Add label bytes
          for (let i = 0; i < label.length; i++) {
              result.push(label.charCodeAt(i));
          }
      }
  }
  
  // Add root label (zero length)
  result.push(0);
  
  // Convert to Uint8Array
  const bytes = new Uint8Array(result);
  
  // Convert to hex string with 0x prefix
  const hexString = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  return `0x${hexString}`;
}

// Shared helper function for calling the Universal Resolver
async function callUniversalResolver(viemClient, ensName, universalResolver, calldata) {
    // DNS encode the ENS name
    const dnsEncodedName = dnsEncodeName(ensName);
    try {
        // Call Universal Resolver's resolve function
        const [resolveResult, resolverAddress] = await viemClient.readContract({
            address: universalResolver,
            abi: [{
                name: 'resolve',
                type: 'function',
                stateMutability: 'view',
                inputs: [
                    { name: 'name', type: 'bytes' },
                    { name: 'data', type: 'bytes' }
                ],
                outputs: [
                    { name: 'result', type: 'bytes' },
                    { name: 'resolver', type: 'address' }
                ]
            }],
            functionName: 'resolve',
            args: [dnsEncodedName, calldata],
        });

        return { resolveResult, resolverAddress };
    } catch (error) {
        // Check if the error is due to no resolver (error signature 0x77209fe8)
        if (error.message && error.message.includes('0x77209fe8')) {
            return {
                resolveResult: null,
                resolverAddress: null
            };
        }
        // Re-throw other errors
        throw error;
    }
}

// Function to get the current contentHash from ENS using the Universal Resolver
export async function resolveEnsDomain(viemClient, ensName, universalResolver) {
    // Find the contenthash function in the EnsResolver ABI
    const contenthashAbi = contracts.abis.EnsResolver.find(abi => abi.name === 'contenthash');

    // Encode the function call for contenthash(node)
    const calldata = encodeFunctionData({
        abi: [contenthashAbi],
        functionName: 'contenthash',
        args: [namehash(ensName)]
    });

    const { resolveResult, resolverAddress } = await callUniversalResolver(viemClient, ensName, universalResolver, calldata);
    
    const result = { resolverAddress };

    if (resolveResult) {
        const decoded = decodeAbiParameters(
            contenthashAbi.outputs,
            resolveResult
        );

        if (decoded?.[0] !== '0x') {
            result.cid = ensContentHashToCID(decoded[0]);
        }
    }
    
    return result;
}

// Function to resolve a specific text record from ENS using the Universal Resolver
export async function resolveEnsTextRecord(viemClient, ensName, universalResolver, key) {
    // Find the text function in the EnsResolver ABI
    const textAbi = contracts.abis.EnsResolver.find(abi => abi.name === 'text');

    // Encode the function call for text(node, key)
    const calldata = encodeFunctionData({
        abi: [textAbi],
        functionName: 'text',
        args: [namehash(ensName), key]
    });

    const { resolveResult, resolverAddress } = await callUniversalResolver(viemClient, ensName, universalResolver, calldata);
    
    const result = { resolverAddress };

    if (resolveResult) {
        const decoded = decodeAbiParameters(
            textAbi.outputs,
            resolveResult
        );

        if (decoded?.[0] !== '') {
            result.value = decoded[0];
        }
    }
    
    return result;
}

// Function to resolve the owner of an ENS name by calling the ENS registry directly
export async function resolveEnsOwner(viemClient, ensName, chainId) {
    // Define the minimal ENS registry ABI for the owner(bytes32) function
    const ownerAbi = [{
        name: 'owner',
        type: 'function',
        stateMutability: 'view',
        inputs: [ { name: 'node', type: 'bytes32' } ],
        outputs: [ { name: '', type: 'address' } ]
    }];

    const registryAddress = contracts.ensRegistry[String(chainId)];
    if (!registryAddress) throw new Error('ENS registry address not configured for this chain');

    try {
        const nameHash = namehash(ensName);
        const owner = await viemClient.readContract({
            address: registryAddress,
            abi: ownerAbi,
            functionName: 'owner',
            args: [nameHash]
        });
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
            const nameWrapperAddress = contracts.ensNameWrapper[String(chainId)];
            if (owner.toLowerCase() === nameWrapperAddress.toLowerCase()) {
                const nameWrapperAbi = contracts.abis.EnsNameWrapper;
                const nameHashAsUint256 = BigInt(nameHash);
                const actualOwner = await viemClient.readContract({
                    address: nameWrapperAddress,
                    abi: nameWrapperAbi,
                    functionName: 'ownerOf',
                    args: [nameHashAsUint256]
                });
                return actualOwner;
            }
            return owner;
        }
    } catch (_e) {
        // Optionally log or handle error
    }
    return null;
}