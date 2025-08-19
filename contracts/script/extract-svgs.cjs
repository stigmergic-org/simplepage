#!/usr/bin/env node

const fs = require('fs');

const FOLDER_NAME = './test-render-outputs';

// Create test-outputs directory if it doesn't exist
if (!fs.existsSync(FOLDER_NAME)) {
    fs.mkdirSync(FOLDER_NAME);
}

console.log('🔍 Parsing forge script output for tokenURI data...');

let svgCount = 0;
let jsonCount = 0;

// Function to extract and save SVG from tokenURI
function extractAndSaveSVG(tokenURI, domain, version) {
    try {
        // Extract the base64 JSON part
        const jsonBase64 = tokenURI.replace('data:application/json;base64,', '');
        
        // Decode the JSON
        const jsonData = JSON.parse(Buffer.from(jsonBase64, 'base64').toString());
        
        // Extract and save the SVG
        if (jsonData.image && jsonData.image.includes('data:image/svg+xml;base64,')) {
            const svgBase64 = jsonData.image.replace('data:image/svg+xml;base64,', '');
            const svgContent = Buffer.from(svgBase64, 'base64').toString();
            
            // Save the SVG file
            const svgFilename = `${domain}-${version}.svg`;
            const svgFilepath = `${FOLDER_NAME}/${svgFilename}`;
            fs.writeFileSync(svgFilepath, svgContent);
            console.log(`✅ Saved SVG: ${svgFilename}`);
            svgCount++;
            
            // Save the JSON metadata
            const jsonFilename = `${domain}-${version}.json`;
            const jsonFilepath = `${FOLDER_NAME}/${jsonFilename}`;
            fs.writeFileSync(jsonFilepath, JSON.stringify(jsonData, null, 2));
            console.log(`✅ Saved JSON: ${jsonFilename}`);
            jsonCount++;
            
            // Show some SVG details
            const width = svgContent.match(/width="(\d+)"/)?.[1] || 'not found';
            const height = svgContent.match(/height="(\d+)"/)?.[1] || 'not found';
            console.log(`   📐 SVG: ${width}x${height}, ${svgContent.length} chars`);
            
            return true;
        }
    } catch (error) {
        console.warn(`⚠️  Failed to process ${domain}-${version}:`, error.message);
    }
    return false;
}

// Read from stdin (piped from forge script)
let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
    inputData += chunk;
});

process.stdin.on('end', () => {
    // Find all tokenURI data in the input
    const tokenURIPattern = /TOKEN_URI: (data:application\/json;base64,[A-Za-z0-9+/=]+)/g;
    const matches = [...inputData.matchAll(tokenURIPattern)];
    
    if (matches.length === 0) {
        console.log('❌ No tokenURI data found in the input');
        console.log('Make sure to run: forge script script/TestRenderers.s.sol --rpc-url http://localhost:8545 | node extract-svgs.cjs');
        process.exit(1);
    }
    
    console.log(`🔍 Found ${matches.length} tokenURI(s) in the output`);
    
    // Process each tokenURI
    matches.forEach((match, index) => {
        const tokenURI = match[1];
        
        try {
            // Decode the JSON to get domain and determine version
            const jsonBase64 = tokenURI.replace('data:application/json;base64,', '');
            const jsonData = JSON.parse(Buffer.from(jsonBase64, 'base64').toString());
            
            // Extract domain from description
            let domain = 'unknown';
            if (jsonData.description) {
                const domainMatch = jsonData.description.match(/Domain: ([^\s]+)/);
                if (domainMatch) {
                    domain = domainMatch[1];
                }
            }
            
            // Determine version based on SVG content
            let version = 'unknown';
            if (jsonData.image && jsonData.image.includes('data:image/svg+xml;base64,')) {
                const svgBase64 = jsonData.image.replace('data:image/svg+xml;base64,', '');
                const svgContent = Buffer.from(svgBase64, 'base64').toString();
                
                if (svgContent.includes('SimplePage Subscription')) {
                    version = 'v1';
                } else if (svgContent.includes('Simple Page')) {
                    version = 'v2';
                }
            }
            
            console.log(`\n🎯 Processing ${domain} (${version})...`);
            extractAndSaveSVG(tokenURI, domain, version);
            
        } catch (error) {
            console.warn(`⚠️  Failed to process match ${index + 1}:`, error.message);
        }
    });
    
    // Summary
    console.log('\n📊 Extraction Summary:');
    console.log(`   SVG files: ${svgCount}`);
    console.log(`   JSON files: ${jsonCount}`);
    
    if (svgCount > 0) {
        console.log(`\n🎉 Successfully extracted ${svgCount} SVG files!`);
        console.log('📁 Check the test-render-outputs/ directory for the generated files.');
        console.log('You can open the .svg files in a web browser to view the rendered tokens.');
    } else {
        console.log('\n❌ No SVG files were extracted. Check the input data.');
    }
});

