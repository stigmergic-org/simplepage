import React, { useState, useEffect } from 'react';
import { Renderer } from 'marked';
import { useAccount } from 'wagmi';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import { useRepo } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePagePath } from '../hooks/usePagePath';
import { useNavigation } from '../hooks/useNavigation';
import { mediaType } from '../utils/file-tools';

const renderer = new Renderer();
renderer.image = (href, title, text) => {
  // Parse width and height from title if it contains '=WxH' format
  let extraParams = '';
  if (title) {
    const sizeMatch = title.match(/=(\d+)x(\d+)/);
    if (sizeMatch) {
      let [width, height] = sizeMatch.slice(1);
      const actualTitle = title.replace(/=\d+x\d+/, '').trim();
      extraParams = ` title="${actualTitle}" width="${width}" height="${height}"`;
    } else {
      extraParams = ` title="${title}"`;
      if (href.toLowerCase().endsWith('.pdf')) {
        extraParams += ' width="100%" height="500px"';
      }
    }
  } else if (href.toLowerCase().endsWith('.pdf')) {
    extraParams = ' width="100%" height="500px"';
  }
  switch (mediaType(href)) {
    case 'video':
      return `<video src="${href}" controls${extraParams}>${text}</video>`;
    case 'audio':
      return `<audio src="${href}" controls${extraParams}>${text}</audio>`;
    case 'application':
      // Handle PDF files
      if (href.toLowerCase().endsWith('.pdf')) {
        return `<iframe src="${href}"${extraParams}">Your browser does not support PDF viewing. <a href="${href}" target="_blank">Click here to download the PDF</a></iframe>`;
      }
      // Fall through for other application types
    case 'image':
    default:
      return `<img src="${href}" alt="${text}"${extraParams} />`;
  }
};

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
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
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

const Edit = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [originalContent, setOriginalContent] = useState('');
  const { path } = usePagePath();
  const { repo } = useRepo();
  const { goToNotFound } = useNavigation();

  useEffect(() => {
    if (repo) {
      loadContent();
    }
  }, [repo]);


  const loadContent = async () => {
    try {
      // Ensure the page exists
      if (!await repo.pageExists(path)) {
        goToNotFound(path);
        return;
      }
      
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
      renderingConfig: {
        markedOptions: { renderer }
      },
    });

    editor.value(originalContent);

    editor.codemirror.on("change", () => {
      const markdownContent = editor.value();
      const markdownSplit = markdownContent.split('---');

      // remove frontmatter for the html rendering
      let cleanedMarkdown = markdownContent;
      if (markdownSplit.length >= 3) {
        cleanedMarkdown = markdownSplit.slice(2).join('---');
      }
      const renderedHTML = editor.markdown(cleanedMarkdown).replace('<head></head><body>', '').replace('</body>', '');
      repo.setPageEdit(path, markdownContent, renderedHTML).then(() => {
        repo.getMetadata(path).then(({ title }) => {
          document.title = title
        });
      });
    });

    return () => {
      editor.toTextArea();
    };
  }, [isLoading, originalContent, repo, path]);

  if (isLoading) {
    return (
      <>
        <Navbar 
          activeTab="Edit"
        />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <Navbar 
        activeTab="Edit"
      />
      <div className="min-h-70 flex items-center justify-center pt-6">
        <div className="w-full max-w-3xl">
          <textarea id="markdown-editor" />
        </div>
      </div>
    </>
  );
};

export default Edit;
