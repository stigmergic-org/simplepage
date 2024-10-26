import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import { useRepo } from '../hooks/useRepo';
import Navbar from '../components/navbar';
import { usePagePath } from '../hooks/usePagePath';
import { useNavigation } from '../hooks/useNavigation';

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
        console.log('Page does not exist:', path);
        goToNotFound(path);
        return;
      }
      
      const content = await repo.getMarkdown(path);
      setOriginalContent(content);
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
      repo.setPageEdit(path, markdownContent, renderedHTML);
    });

    return () => {
      editor.toTextArea();
    };
  }, [isLoading, originalContent, repo, path]);

  if (isLoading) {
    return (
      <>
        <Navbar 
          buttons={{
            preview: true,
            publish: true
          }}
        />
        <div className="flex justify-center items-center h-[calc(100vh-8rem)] w-full">
          <span className="loading loading-infinity loading-lg"></span>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar 
        buttons={{
          preview: true,
          publish: true
        }}
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
