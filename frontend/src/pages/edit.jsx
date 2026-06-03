import React, { useState, useEffect, useRef } from 'react';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import { renderMarkdownBody } from '@simplepg/repo';
import { useRepo } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import Notice from '../components/Notice';
import { usePagePath } from '../hooks/usePagePath';
import { useNavigation } from '../hooks/useNavigation';
import { updateVirtualLinks } from '../utils/virtual-links';
import { restorePromotedCssElements } from '../utils/promoted-css-elements';

const SIDE_BY_SIDE_PREVIEW_STORAGE_KEY = 'simplepage-edit-side-by-side-preview';
const parser = new DOMParser();

// Define a stateless overlay mode for frontmatter
const frontmatterOverlay = {
  token: function (stream) {
    // Only match frontmatter at the very top of the file
    if (stream.lineOracle.line === 0 && stream.match(/^---\s*$/)) {
      stream.skipToEnd();
      return 'frontmatter';
    }
    // If we're in the first 20 lines, check if we're still in frontmatter
    if (stream.lineOracle.line > 0 && stream.lineOracle.line < 20) {
      // Find the first and second --- lines
      const lines = stream.lineOracle.doc.children[0].lines;
      let firstDash = -1, secondDash = -1;
      for (let i = 0; i < Math.min(lines?.length, 20); i++) {
        if (/^---\s*$/.test(lines[i].text)) {
          if (firstDash === -1) firstDash = i;
          else if (secondDash === -1) { secondDash = i; break; }
        }
      }
      // If this line is between the first and second --- lines, style it
      if (firstDash !== -1 && secondDash !== -1 &&
        stream.lineOracle.line > firstDash && stream.lineOracle.line < secondDash) {
        stream.skipToEnd();
        return 'frontmatter';
      }
      // Also style the --- lines themselves
      if ((stream.lineOracle.line === firstDash || stream.lineOracle.line === secondDash) &&
        /^---\s*$/.test(stream.string)) {
        stream.skipToEnd();
        return 'frontmatter';
      }
    }
    stream.skipToEnd();
    return null;
  }
};

const renderPreviewMarkdown = (markdownContent) => {
  const renderedHtml = renderMarkdownBody(markdownContent);
  const parsedContent = parser.parseFromString(renderedHtml, 'text/html');

  restorePromotedCssElements(parsedContent);
  updateVirtualLinks(parsedContent);

  return parsedContent.body.innerHTML;
};

const updateSideBySideHeight = (editor) => {
  const container = editor.codemirror.getWrapperElement().parentNode;
  const wrapper = editor.codemirror.getWrapperElement();
  const scroller = editor.codemirror.getScrollerElement();
  const toolbar = container.querySelector('.editor-toolbar');
  const statusBar = container.querySelector('.editor-statusbar');
  const wrapperStyles = window.getComputedStyle(wrapper);
  const wrapperVerticalChrome = [
    'paddingTop',
    'paddingBottom',
    'borderTopWidth',
    'borderBottomWidth',
  ].reduce((total, key) => total + parseFloat(wrapperStyles[key] || '0'), 0);
  const availableHeight = Math.max(
    320,
    Math.floor(
      window.innerHeight
      - container.getBoundingClientRect().top
      - (toolbar?.offsetHeight ?? 0)
      - (statusBar?.offsetHeight ?? 0)
      - wrapperVerticalChrome
      - 8
    )
  );

  editor.options.maxHeight = `${availableHeight}px`;
  scroller.style.height = editor.options.maxHeight;
  editor.setPreviewMaxHeight();
};

const resetSideBySideHeight = (editor) => {
  const wrapper = editor.codemirror.getWrapperElement();
  const scroller = editor.codemirror.getScrollerElement();
  const previewPane = wrapper.nextSibling;

  editor.options.maxHeight = undefined;
  scroller.style.removeProperty('height');
  previewPane?.style.removeProperty('height');
  previewPane?.style.removeProperty('max-height');
};

const Edit = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [originalContent, setOriginalContent] = useState('');
  const [isOutdatedEdit, setIsOutdatedEdit] = useState(false);
  const [isSideBySideActive, setIsSideBySideActive] = useState(false);
  const editorRef = useRef(null);
  const { path } = usePagePath();
  const { repo } = useRepo();
  const { goToNotFound } = useNavigation();

  useEffect(() => {
    if (repo) {
      loadContent();
    }
  }, [repo]);

  useEffect(() => {
    const syncEditorLayout = () => {
      if (!editorRef.current) return;

      if (isSideBySideActive) {
        updateSideBySideHeight(editorRef.current);
      } else {
        resetSideBySideHeight(editorRef.current);
      }

      editorRef.current.codemirror.refresh();
    };

    let frameId = requestAnimationFrame(syncEditorLayout);

    if (!isSideBySideActive) {
      return () => cancelAnimationFrame(frameId);
    }

    const handleResize = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(syncEditorLayout);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isSideBySideActive, isOutdatedEdit]);


  const loadContent = async () => {
    try {
      // Ensure the page exists
      if (!await repo.pageExists(path)) {
        goToNotFound(path);
        return;
      }
      
      // Check if the edit is outdated
      const outdated = repo.isOutdatedEdit(path);
      setIsOutdatedEdit(outdated);
      
      const content = await repo.getMarkdown(path);
      setOriginalContent(content);
      const { title } = await repo.getMetadata(path);
      document.title = title
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading content:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;

    const version = document.querySelector('meta[name="version"]').getAttribute('content');


    const editor = new EasyMDE({
      element: document.getElementById('markdown-editor'),
      autofocus: true,
      spellChecker: false,
      sideBySideFullscreen: false,
      autoDownloadFontAwesome: false,
      insertTexts: {
        image: ["![](", ")"],
        link: ["[", "]()"],
      },
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', 'code', '|',
        'side-by-side', '|',
        'guide',
      ],
      status: ["lines", "words", "cursor", {
        className: "version",
        defaultValue: (el) => {
            el.innerHTML = `<u>
              <a href="https://simplepage.eth.link" target="_blank" style="color: inherit;">SimplePage v${version}</a>
            </u>`;
        },
      }],
      overlayMode: {
        mode: frontmatterOverlay,
        combine: true
      },
      previewRender: function (plainText) {
        return renderPreviewMarkdown(plainText);
      },
    });

    editorRef.current = editor;

    editor.value(originalContent);

    const previewPane = editor.codemirror.getWrapperElement().nextSibling;
    const syncSideBySideState = (persist = true) => {
      const isActive = previewPane?.classList.contains('editor-preview-active-side') ?? false;

      setIsSideBySideActive(isActive);
      if (persist) {
        localStorage.setItem(SIDE_BY_SIDE_PREVIEW_STORAGE_KEY, String(isActive));
      }
    };
    const sideBySideObserver = previewPane
      ? new MutationObserver(() => syncSideBySideState())
      : null;

    sideBySideObserver?.observe(previewPane, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const shouldRestoreSideBySide = localStorage.getItem(SIDE_BY_SIDE_PREVIEW_STORAGE_KEY) === 'true';

    if (shouldRestoreSideBySide && editor.toolbarElements?.['side-by-side']) {
      editor.toggleSideBySide();
    } else {
      syncSideBySideState(!shouldRestoreSideBySide);
    }

    editor.codemirror.on("change", () => {
      const markdownContent = editor.value();
      const renderedHTML = renderMarkdownBody(markdownContent);
      repo.setPageEdit(path, markdownContent, renderedHTML).then(() => {
        repo.getMetadata(path).then(({ title }) => {
          document.title = title
        });
      });
    });

    return () => {
      sideBySideObserver?.disconnect();
      editorRef.current = null;
      editor.toTextArea();
    };
  }, [isLoading, originalContent, repo, path]);

  if (isLoading) {
    return (
      <>
        <Navbar 
          activePage="Edit"
        />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <Navbar 
        activePage="Edit"
      />
      
      {/* Outdated Edit Warning */}
      {isOutdatedEdit && (
        <div className="container mx-auto px-4 py-4">
          <Notice 
            type="warning" 
            message="This page was edited based on an older version of the website. Your changes may not include the latest content."
            onClose={() => setIsOutdatedEdit(false)}
          />
        </div>
      )}
      
      <div className={isSideBySideActive ? 'min-h-70 flex items-start justify-center pt-6' : 'min-h-70 flex items-center justify-center pt-6'}>
        <div className={isSideBySideActive ? 'w-full px-4' : 'w-full max-w-3xl'}>
          <textarea id="markdown-editor" />
        </div>
      </div>
    </>
  );
};

export default Edit;
