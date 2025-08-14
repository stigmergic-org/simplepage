import React, { useEffect, useState } from 'react';
import { useRepo, ensurePageExists } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import { usePagePath } from '../hooks/usePagePath';
import { useBasename } from '../hooks/useBasename';
import { useNavigation } from '../hooks/useNavigation';
import { encodeFileToDataUrl } from '../utils/file-tools';

const parser = new DOMParser();

const View = ({ existingContent }) => {
  const basename = useBasename();
  const [content, setContent] = useState(existingContent);
  const { path, isVirtual } = usePagePath();
  const { repo } = useRepo();
  const { goToNotFound } = useNavigation();

  useEffect(() => {
    const loadContent = async () => {
      const ignoreEdits = !isVirtual;
      
      // Only check and create page if we have a preview path
      if (!await repo.pageExists(path)) {
        goToNotFound(path);
        return;
      }
      
      let loadedContent = await repo.getHtmlBody(path, ignoreEdits);
      const loadedMetadata = await repo.getMetadata(path, ignoreEdits);
      document.title = loadedMetadata.title
      
      // Parse content once and apply all modifications
      const parsedContent = parser.parseFromString(loadedContent, 'text/html');
      
      addHeadingLinks(parsedContent);
      if (isVirtual) {
        updateVirtualLinks(parsedContent, basename);
        await updateVirtualMedia(parsedContent, repo);
      }
      setContent(parsedContent.body.innerHTML);
    }
    if (repo) {
      loadContent();
    }
  }, [repo, basename, isVirtual]);

  return (
    <>
      <Navbar 
        activePage={isVirtual ? "Preview" : undefined}
      />
      <div id="content" className="min-h-70 flex items-center justify-center pt-6">
        <div className="w-full max-w-4xl editor-preview !px-6" style={{ backgroundColor: 'transparent' }}>
          <div dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      </div>
    </>
  )
};

export default View;


const updateVirtualMedia = async (parsedContent, repo) => {
  const media = parsedContent.querySelectorAll('img, video, audio, iframe');
  
  const processMedia = async (element) => {
    const src = element.getAttribute('src');
    if (src?.startsWith('/_files/')) {
      try {
        // Strip /_files/ prefix
        const filePath = src.substring(8);
        
        // Get file content from repo
        const fileContent = await repo.files.cat(filePath);
        
        // Encode file content to data URL
        const dataUrl = encodeFileToDataUrl(fileContent, filePath);
        
        if (dataUrl) {
          element.src = dataUrl;
        } else {
          // Keep original src if encoding fails
          console.warn(`Unknown media extension: ${filePath}, keeping original src`);
        }
      } catch (error) {
        console.warn(`Failed to load media ${src}:`, error);
        // Keep original src if loading fails
      }
    }
  }
  const promises = []
  for (const element of media) {
    promises.push(processMedia(element));
  }
  await Promise.all(promises);
}

// Function to update links for virtual preview mode
const updateVirtualLinks = (parsedContent, basename) => {
  const links = parsedContent.querySelectorAll('a');
  const params = new URLSearchParams();
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href?.startsWith('/')) {
      params.set('path', href);
      link.href = `${basename}?${params.toString()}`;
    }
  });
};

// Function to add heading links to parsed content
const addHeadingLinks = (parsedContent) => {
  const headings = parsedContent.querySelectorAll('h1, h2, h3, h4, h5, h6');

  headings.forEach((heading) => {
    // Skip if already processed
    if (heading.classList.contains('heading-processed')) return;

    // Generate anchor ID from heading text
    const text = heading.textContent || '';
    const anchorId = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Set the heading's ID
    heading.id = anchorId;

    // Create container div
    const container = parsedContent.createElement('div');
    container.className = 'heading-container align-middle';

    // Create link icon using FontAwesome
    const linkIcon = parsedContent.createElement('a');
    linkIcon.href = `#${anchorId}`;
    linkIcon.className = 'heading-link-icon';
    linkIcon.innerHTML = '<i class="fa fa-link text-gray-500"></i>';
    linkIcon.title = 'Link to this section';

    // Wrap heading in container and add link icon
    heading.parentNode.insertBefore(container, heading);
    container.appendChild(linkIcon);
    container.appendChild(heading);

    // Mark as processed
    heading.classList.add('heading-processed');
  });
};