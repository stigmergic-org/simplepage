import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { Repo } from '@simplepg/repo';
import { useDomain } from './useDomain';
import { useDserviceParam } from './useDserviceParam';
import { useChainId } from './useChainId';

// Global singleton instance
let repoInstance = null;

// Utility functions for creating default content
const createDefaultMarkdown = (title, actualFileName) => `---
title: ${title}
description: ${title} description
---

# ${title}

Simply edit this markdown content to customize your page.

This page can be linked to like this: [\`${actualFileName}\`](${actualFileName}).

`;

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

  // Create singleton instance if it doesn't exist
  if (!repoInstance) {
    const repoOptions = { apiEndpoint: customDserviceUrl };
    repoInstance = new Repo(domain, localStorage, repoOptions);
  }

  useEffect(() => {
    const initializeRepo = async () => {
      // Only initialize once when we have both viemClient and chainId
      if (viemClient && chainId && !repoInstance.initialized) {
        await repoInstance.init(viemClient, { chainId });
      }
    };
    initializeRepo();
  }, [viemClient, chainId]);

  return {
    repo: repoInstance,
  };
}; 