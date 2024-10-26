import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';

const rootElement = document.getElementById('root');
const existingContent = document.getElementById('content-container')?.innerHTML;

const root = createRoot(rootElement);
root.render(<App existingContent={existingContent} />);





