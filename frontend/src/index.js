import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import Plausible from 'plausible-tracker';
import '../public/styles/content.css';

// Initialize Plausible analytics
const { enableAutoPageviews } = Plausible({
  domain: 'simplepage.eth.link',
  trackLocalhost: true,
})
enableAutoPageviews()


const rootElement = document.getElementById('root');
const existingContent = document.getElementById('content-container')?.innerHTML;

const root = createRoot(rootElement);
root.render(<App existingContent={existingContent} />);





