#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const CONTRACTS_JS_PATH = path.join(__dirname, '../../packages/common/src/contracts.js');
const OUT_DIR = path.join(__dirname, '../out');
const BROADCAST_DIR = path.join(__dirname, '../broadcast');

// Contract names to track
const CONTRACT_NAMES = ['SimplePage', 'SimplePageManager', 'TokenRenderer'];
const UNIVERSAL_RESOLVER_CONTRACTS = ['MockUniversalResolver', 'UniversalResolver'];

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return null;
  }
}

function getAvailableDeploymentScripts() {
  const scripts = [];
  
  if (fs.existsSync(BROADCAST_DIR)) {
    const scriptDirs = fs.readdirSync(BROADCAST_DIR);
    
    for (const scriptDir of scriptDirs) {
      if (scriptDir.endsWith('.s.sol')) {
        scripts.push(scriptDir);
      }
    }
  }
  
  return scripts;
}

function getDeployedAddresses(chainId) {
  const addresses = {};
  let universalResolverAddress = null;
  
  // Look for deployment artifacts in the broadcast directory structure
  // Format: broadcast/{ScriptName}.s.sol/{chainId}/run-latest.json
  const scriptDirs = getAvailableDeploymentScripts();
  
  if (scriptDirs.length === 0) {
    console.warn(`Warning: No deployment scripts found in ${BROADCAST_DIR}`);
    return { addresses, universalResolverAddress };
  }
  
  for (const scriptDir of scriptDirs) {
    // First try runWithManager-latest.json, then fall back to run-latest.json
    let deploymentPath = path.join(BROADCAST_DIR, scriptDir, chainId.toString(), 'runWithManager-latest.json');
    let foundFile = false;
    
    if (fs.existsSync(deploymentPath)) {
      foundFile = true;
      console.log(`Found deployment file: ${deploymentPath}`);
    } else {
      deploymentPath = path.join(BROADCAST_DIR, scriptDir, chainId.toString(), 'run-latest.json');
      if (fs.existsSync(deploymentPath)) {
        foundFile = true;
        console.log(`Found deployment file: ${deploymentPath}`);
      }
    }
    
    if (foundFile) {
      const deploymentData = readJsonFile(deploymentPath);
      if (deploymentData && deploymentData.transactions) {
        // Parse deployment transactions to find contract addresses
        for (const tx of deploymentData.transactions) {
          if (tx.contractName && CONTRACT_NAMES.includes(tx.contractName)) {
            addresses[tx.contractName] = tx.contractAddress;
            console.log(`Found ${tx.contractName} at ${tx.contractAddress} from ${scriptDir}`);
          }
          
          // Also look for universal resolver contracts
          if (tx.contractName && UNIVERSAL_RESOLVER_CONTRACTS.includes(tx.contractName)) {
            universalResolverAddress = tx.contractAddress;
            console.log(`Found ${tx.contractName} (universal resolver) at ${tx.contractAddress} from ${scriptDir}`);
          }
        }
      }
    }
  }
  
  if (Object.keys(addresses).length === 0) {
    console.warn(`Warning: No deployment files found for chain ID ${chainId}`);
    console.warn(`Checked paths:`);
    for (const scriptDir of scriptDirs) {
      const deploymentPath = path.join(BROADCAST_DIR, scriptDir, chainId.toString(), 'run-latest.json');
      console.warn(`  - ${deploymentPath}`);
    }
  }
  
  return { addresses, universalResolverAddress };
}

function getContractABI(contractName) {
  const abiPath = path.join(OUT_DIR, contractName + '.sol', contractName + '.json');
  const artifact = readJsonFile(abiPath);
  
  if (artifact && artifact.abi) {
    return artifact.abi;
  }
  
  console.warn(`Warning: Could not find ABI for ${contractName}`);
  return [];
}

function updateContractsJs(deployedAddresses, chainId, universalResolverAddress) {
  // Read existing contracts.js
  let contractsJsContent;
  try {
    contractsJsContent = fs.readFileSync(CONTRACTS_JS_PATH, 'utf8');
  } catch (error) {
    console.error(`Error reading contracts.js: ${error.message}`);
    return false;
  }
  
  try {
    // Extract the contracts object by removing the export statement
    const contractsMatch = contractsJsContent.match(/export const contracts = ([\s\S]*?)(?:\s*;?\s*)$/);
    if (!contractsMatch) {
      console.error('Could not parse contracts.js structure');
      return false;
    }
    
    // Parse the contracts object
    const contractsStr = contractsMatch[1];
    const contracts = eval(`(${contractsStr})`);
    
    // Update deployments for the specific chain ID only
    if (!contracts.deployments) {
      contracts.deployments = {};
    }
    
    if (!contracts.deployments[chainId]) {
      contracts.deployments[chainId] = {};
    }
    
    // Update addresses for the specific chain ID only
    for (const [contractName, address] of Object.entries(deployedAddresses)) {
      if (address) {
        contracts.deployments[chainId][contractName] = address;
        console.log(`Updated ${contractName} address to: ${address} for chain ${chainId}`);
      }
    }
    
    // Update ABIs - preserve single line format
    if (!contracts.abis) {
      contracts.abis = {};
    }
    
    for (const contractName of CONTRACT_NAMES) {
      const abi = getContractABI(contractName);
      if (abi.length > 0) {
        // Keep ABI on a single line as it was originally
        contracts.abis[contractName] = abi;
        console.log(`Updated ${contractName} ABI`);
      }
    }
    
    // Convert back to JavaScript string with proper formatting
    // Preserve the original structure and formatting
    let updatedContent = 'export const contracts = {\n';
    
    // Deployments section
    updatedContent += '  deployments: {\n';
    const chainIds = Object.keys(contracts.deployments).sort();
    for (const cid of chainIds) {
      updatedContent += `    "${cid}": {\n`;
      const contractNames = Object.keys(contracts.deployments[cid]).sort();
      for (const contractName of contractNames) {
        const address = contracts.deployments[cid][contractName];
        updatedContent += `      "${contractName}": "${address}",\n`;
      }
      updatedContent += '    },\n';
    }
    updatedContent += '  },\n';
    
    // UniversalResolver section - preserve exactly as it was
    updatedContent += '  universalResolver: {\n';
    const resolverChainIds = Object.keys(contracts.universalResolver || {}).sort();
    for (const resolverChainId of resolverChainIds) {
      const resolver = contracts.universalResolver[resolverChainId];
      // Update the resolver for chain 1337 if we found a new one
      if (resolverChainId === chainId && chainId === '1337' && universalResolverAddress) {
        updatedContent += `    "${resolverChainId}": "${universalResolverAddress}",\n`;
        console.log(`Updated universal resolver to: ${universalResolverAddress} for chain ${chainId}`);
      } else {
        updatedContent += `    "${resolverChainId}": "${resolver}",\n`;
      }
    }
    // Add universal resolver for chain 1337 if we found one and it doesn't already exist
    if (chainId === '1337' && universalResolverAddress && !contracts.universalResolver?.[chainId]) {
      updatedContent += `    "${chainId}": "${universalResolverAddress}",\n`;
      console.log(`Updated universal resolver to: ${universalResolverAddress} for chain ${chainId}`);
    }
    updatedContent += '  },\n';
    
    // ABIs section - keep on single lines
    updatedContent += '  abis: {\n';
    const abiContractNames = Object.keys(contracts.abis).sort();
    for (const contractName of abiContractNames) {
      const abi = contracts.abis[contractName];
      updatedContent += `    ${contractName}: ${JSON.stringify(abi)},\n`;
    }
    updatedContent += '  }\n';
    
    updatedContent += '};';
    
    // Write the updated content back
    fs.writeFileSync(CONTRACTS_JS_PATH, updatedContent, 'utf8');
    console.log(`Successfully updated ${CONTRACTS_JS_PATH}`);
    return true;
    
  } catch (error) {
    console.error(`Error updating contracts.js: ${error.message}`);
    return false;
  }
}

function main() {
  // Get chain ID from command line arguments
  const args = process.argv.slice(2);
  const chainId = args[0];
  
  if (!chainId) {
    console.error('Error: Chain ID is required');
    console.log('Usage: node updateContracts.js <chainId>');
    console.log('Example: node updateContracts.js 11155111');
    process.exit(1);
  }
  
  console.log(`Updating contracts.js for chain ID: ${chainId}`);
  
  // Get deployed addresses from artifacts
  const { addresses: deployedAddresses, universalResolverAddress } = getDeployedAddresses(chainId);
  
  if (Object.keys(deployedAddresses).length === 0) {
    console.log('No deployment artifacts found. Make sure to run the deployment first.');
    return;
  }
  
  console.log('Found deployed contracts:');
  for (const [name, address] of Object.entries(deployedAddresses)) {
    console.log(`  ${name}: ${address}`);
  }
  
  if (universalResolverAddress) {
    console.log(`Found universal resolver: ${universalResolverAddress}`);
  }
  
  // Update contracts.js
  const success = updateContractsJs(deployedAddresses, chainId, universalResolverAddress);
  
  if (success) {
    console.log('✅ Contracts.js updated successfully!');
  } else {
    console.error('❌ Failed to update contracts.js');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateContractsJs, getDeployedAddresses, getContractABI }; 