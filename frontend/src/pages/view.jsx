import React, { useEffect, useState } from 'react';
import { useRepo, ensurePageExists } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import Sidebar from '../components/Sidebar';
import TableOfContents from '../components/TableOfContents';
import SidebarNavigation from '../components/SidebarNavigation';
import { usePagePath } from '../hooks/usePagePath';
import { useBasename } from '../hooks/useBasename';
import { useNavigation } from '../hooks/useNavigation';
import { encodeFileToDataUrl } from '../utils/file-tools';
import { highlightAll } from '../utils/prism-config';
import { generateAnchorId } from '../utils/anchor-utils';

const parser = new DOMParser();

const View = ({ existingContent }) => {
  const basename = useBasename();
  const [content, setContent] = useState(existingContent);
  const [sidebarToc, setSidebarToc] = useState(false);
  const [navbarEffectiveTop, setNavbarEffectiveTop] = useState(64);
  const [contentWidth, setContentWidth] = useState(0);
  const [navItems, setNavItems] = useState([]);
  const rootNavItem = navItems.find(item => item.path === '/');
  const sidebarSemaphoreState = useState(null);
  const { path, isVirtual } = usePagePath();
  const { repo } = useRepo();
  const { goToNotFound, goToViewWithPreview, goToRoot } = useNavigation();

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
      setSidebarToc(loadedMetadata['sidebar-toc'] || false);
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
  }, [repo, basename, isVirtual, path]);

  // Load navigation items
  useEffect(() => {
    const loadNavigation = async () => {
      if (!repo) return;
      try {
        const items = await repo.getSidebarNavInfo(path, !isVirtual);
        setNavItems(items);
      } catch (error) {
        console.error('Failed to load sidebar navigation:', error);
        setNavItems([]);
      }
    };

    loadNavigation();
  }, [repo, path, isVirtual]);

  useEffect(() => {
    highlightAll();
  }, [content]);

  // Track content container width
  useEffect(() => {
    const updateContentWidth = () => {
      const contentContainer = document.getElementById('content-container');
      if (contentContainer) {
        setContentWidth(contentContainer.getBoundingClientRect().width);
      }
    };
    // Initial measurement
    updateContentWidth();
    // Listen for resize events
    window.addEventListener('resize', updateContentWidth);
    return () => {
      window.removeEventListener('resize', updateContentWidth);
    };
  }, [content]); // Re-measure when content changes

  return (
    <>
      <Navbar 
        activePage={isVirtual ? "Preview" : undefined}
        onNavbarInfoChange={setNavbarEffectiveTop}
      />

      {/* Sidebar with Table of Contents */}
      {sidebarToc && (
        <Sidebar
          position="right"
          title="On this page"
          icon="toc"
          effectiveTop={navbarEffectiveTop}
          contentWidth={contentWidth}
          semaphoreState={sidebarSemaphoreState}
        >
          <TableOfContents content={content} />
        </Sidebar>
      )}
      {/* Navigation Sidebar */}
      {navItems.length > 0 && (
        <Sidebar
          position="left"
          title={rootNavItem?.title || 'Navigation'}
          onTitleClick={() => { isVirtual ? goToViewWithPreview(rootNavItem?.path) : goToRoot() }}
          icon="map"
          effectiveTop={navbarEffectiveTop}
          contentWidth={contentWidth}
          semaphoreState={sidebarSemaphoreState}
        >
          <SidebarNavigation navItems={navItems} isVirtual={isVirtual} />
        </Sidebar>
      )}

      <div id="content" className="min-h-70 flex items-center justify-center pt-8">
        <div id="content-container" className="w-full max-w-4xl editor-preview !px-6" style={{ backgroundColor: 'transparent' }}>
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
    if (href?.startsWith('/') && !href.startsWith('/spg-')) {
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
    const anchorId = generateAnchorId(text);

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