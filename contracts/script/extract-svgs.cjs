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
const renderedEntries = [];

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

            return {
                domain,
                version,
                svgFilename,
                jsonFilename,
                width,
                height,
            };
        }
    } catch (error) {
        console.warn(`⚠️  Failed to process ${domain}-${version}:`, error.message);
    }
    return null;
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
        console.log('Make sure to run: forge script script/DemoRenderers.s.sol:RenderersDemoScript --rpc-url http://localhost:8545 --broadcast | node script/extract-svgs.cjs');
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
                
                if (svgContent.includes('SimplePage Renderer V3')) {
                    version = 'v3';
                } else if (svgContent.includes('SimplePage Subscription')) {
                    version = 'v1';
                } else if (svgContent.includes('Simple Page')) {
                    version = 'v2';
                }
            }
            
            console.log(`\n🎯 Processing ${domain} (${version})...`);
            const entry = extractAndSaveSVG(tokenURI, domain, version);
            if (entry) {
                renderedEntries.push(entry);
            }
            
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

        const indexHtml = buildIndexHtml(renderedEntries);
        const indexPath = `${FOLDER_NAME}/index.html`;
        fs.writeFileSync(indexPath, indexHtml);
        console.log('Saved preview index: index.html');
    } else {
        console.log('\n❌ No SVG files were extracted. Check the input data.');
    }
});

function buildIndexHtml(entries) {
    const versionOrder = { v1: 1, v2: 2, v3: 3 };
    const sorted = entries.slice().sort((a, b) => {
        const orderA = versionOrder[a.version] ?? 99;
        const orderB = versionOrder[b.version] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
        return a.version.localeCompare(b.version);
    });

    const cards = sorted
        .map((entry) => {
            const title = escapeHtml(entry.domain);
            const versionLabel = escapeHtml(entry.version.toUpperCase());
            const sizeLabel = `${entry.width}x${entry.height}`;
            const svgLink = escapeHtml(entry.svgFilename);
            const jsonLink = escapeHtml(entry.jsonFilename);
            return `\n        <article class="card">\n          <div class="thumb">\n            <img src="${svgLink}" alt="${title} ${versionLabel}" />\n          </div>\n          <div class="meta">\n            <div class="title">${title}</div>\n            <div class="sub">${versionLabel} - ${sizeLabel}</div>\n            <div class="links"><a href="${svgLink}">svg</a> | <a href="${jsonLink}">json</a></div>\n          </div>\n        </article>`;
        })
        .join('');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SimplePage Renderer Previews</title>
    <style>
      :root {
        color-scheme: light;
        background: #f8fafc;
        color: #0f172a;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Mono", "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        background: #f8fafc;
      }
      header {
        padding: 24px 32px 8px;
      }
      h1 {
        margin: 0 0 6px;
        font-size: 20px;
        font-weight: 600;
      }
      p {
        margin: 0;
        opacity: 0.7;
      }
      main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 20px;
        padding: 24px 32px 40px;
      }
      .card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 12px;
        display: grid;
        gap: 12px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      .thumb {
        display: grid;
        place-items: center;
        background: #f1f5f9;
        border-radius: 12px;
        padding: 12px;
      }
      .thumb img {
        width: 160px;
        height: auto;
        display: block;
      }
      .meta {
        display: grid;
        gap: 6px;
        font-size: 12px;
      }
      .title {
        font-size: 13px;
        font-weight: 600;
        word-break: break-all;
      }
      .sub {
        color: #475569;
      }
      .links a {
        color: #1d4ed8;
        text-decoration: none;
      }
      .links a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>SimplePage Renderer Previews</h1>
      <p>Generated SVGs from the renderer demo pipeline.</p>
    </header>
    <main>${cards}
    </main>
  </body>
</html>
`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
