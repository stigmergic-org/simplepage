import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import { init } from '@plausible-analytics/tracker';
import '../public/styles/content.css';

// Initialize Plausible analytics
init({
  domain: 'simplepage.eth.link',
  captureOnLocalhost: true,
  autoCapturePageviews: true
})


const rootElement = document.getElementById('root');
const existingContent = document.getElementById('content-container')?.innerHTML;

const root = createRoot(rootElement);
root.render(<App existingContent={existingContent} />);





