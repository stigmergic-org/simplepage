import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { Repo } from '@simplepg/repo';
import { useDomain } from './useDomain';
import { useDserviceParam } from '@simplepg/react-components';
import { useChainId } from './useChainId';

// Global singleton instance
let repoInstance = null;

// Utility functions for creating default content
const createDefaultMarkdown = (title, actualFileName) => {
  // Get current date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  return `---
title: ${title}
description: ${title} description
sidebar-toc: false
created: ${today}
---

# ${title}

Simply edit this markdown content to customize your page.

This page can be linked to like this: [\`${actualFileName}\`](${actualFileName}).

`;
};

const createDefaultBody = (title, actualFileName) => `<h1>${title}</h1>
<p>Simply edit this markdown content to customize your page.</p>
<p>This page can be linked to like this: <a href="${actualFileName}">${actualFileName}</a>.</p>
`;

// Utility function to ensure page exists, creating it if necessary
export const ensurePageExists = async (repo, path) => {
  const pageExists = await repo.pageExists(path);
  
  if (!pageExists) {
    const title = path.slice(1, -1).split('/').pop();
    const defaultMarkdown = createDefaultMarkdown(title, path);
    const defaultBody = createDefaultBody(title, path);
    
    await repo.setPageEdit(path, defaultMarkdown, defaultBody);
  }
  
  return pageExists;
};

export const useRepo = () => {
  const viemClient = usePublicClient();
  const chainId = useChainId();
  const domain = useDomain();
  const customDserviceUrl = useDserviceParam('new.simplepage.eth');
  const [dserviceFailed, setDserviceFailed] = useState(false);
  const [rpcFailed, setRpcFailed] = useState(false);

  // Create singleton instance if it doesn't exist
  if (!repoInstance) {
    const repoOptions = { apiEndpoint: customDserviceUrl };
    repoInstance = new Repo(domain, localStorage, repoOptions);
  }

  useEffect(() => {
    const initializeRepo = async () => {
      // Only initialize once when we have both viemClient and chainId
      if (viemClient && chainId && !repoInstance.initialized) {
        try {
          await repoInstance.init(viemClient, { chainId });
        } catch (error) {
          if (error.message.includes('HTTP request failed')) {
            setRpcFailed(true);
          } else {
            setDserviceFailed(true);
          }
        }
      }
    };
    initializeRepo();

    // Setup flush on tab unload or hide
    const flush = () => repoInstance.blockstore.flush().catch(console.error);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    });
  }, [viemClient, chainId]);

  return {
    repo: repoInstance,
    dserviceFailed,
    rpcFailed,
  };
}; 
