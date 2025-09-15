#!/usr/bin/env node

const { readFileSync } = require('fs');
const { join } = require('path');

const htmlFile = join(__dirname, 'public', 'index.html');

try {
  const html = readFileSync(htmlFile, 'utf8');
  
  // Check 1: ens-domain meta should be "new.simplepage.eth"
  const ensDomainMatch = html.match(/<meta name="ens-domain" content="(.*?)">/);
  if (!ensDomainMatch || ensDomainMatch[1].trim() !== 'new.simplepage.eth') {
    console.error('❌ ENS domain validation failed: Expected "new.simplepage.eth", got:', ensDomainMatch?.[1] || 'no ens-domain meta found');
    process.exit(1);
  }
  
  // Check 2: content-container div should be empty
  const contentContainerMatch = html.match(/<div id="content-container"[^>]*>(.*?)<\/div>/s);
  if (!contentContainerMatch) {
    console.error('❌ Content container validation failed: No div with id="content-container" found');
    process.exit(1);
  }
  
  const content = contentContainerMatch[1].trim();
  if (content !== '') {
    console.error('❌ Content container validation failed: Expected empty div, got:', JSON.stringify(content));
    process.exit(1);
  }
  
  console.log('✅ HTML validation passed!');
  console.log('  - ens-domain meta is "new.simplepage.eth"');
  console.log('  - content-container div is empty');
  
} catch (error) {
  console.error('❌ Error reading HTML file:', error.message);
  process.exit(1);
} 