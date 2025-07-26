import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { CHANGE_TYPE } from '@simplepg/repo';
import { useRepo, ensurePageExists } from '../hooks/useRepo';
import { useDomain } from '../hooks/useDomain';
import Navbar from '../components/navbar';


const Pages = () => {
  const domain = useDomain();
  const { repo } = useRepo();
  const [unstagedEdits, setUnstagedEdits] = useState([]);
  const [newFileName, setNewFileName] = useState('');
  const [allPages, setAllPages] = useState([]);
  const [pageMetadata, setPageMetadata] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { goToEdit, goToViewWithPreview } = useNavigation();

  useEffect(() => {
    loadPages();
  }, [repo]);

  const loadPages = async () => {
    try {
      setIsLoading(true);
      const [edits, pages] = await Promise.all([
        repo.getChanges(),
        repo.getAllPages()
      ]);

      setUnstagedEdits(edits);
      setAllPages(pages);
      
      // Load metadata for all pages and edits
      const metadata = {};
      const allPaths = [...new Set([...pages, ...edits.map(edit => edit.path)])]; // Combine and deduplicate
      
      for (const path of allPaths) {
        try {
          const meta = await repo.getMetadata(path);
          metadata[path] = meta;
        } catch (err) {
          console.warn(`Failed to load metadata for ${path}:`, err);
          metadata[path] = { title: formatPath(path) };
        }
      }
      setPageMetadata(metadata);
      setError(null);
    } catch (err) {
      console.error('Error loading pages:', err);
      setError('Failed to load pages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewFileNameChange = (e) => {
    let value = e.target.value;
    
    // Convert to lowercase
    value = value.toLowerCase();
    
    // Ensure the path starts with /
    if (value && !value.startsWith('/')) {
      value = '/' + value;
    }
    
    setNewFileName(value);
  };

  // Check if the filename is valid according to the pattern
  const isFileNameValid = () => {
    if (!newFileName || newFileName === '/') {
      return false;
    }
    const pattern = /^\/[a-z0-9\-\/]+$/;
    if (!pattern.test(newFileName)) {
      return false;
    }
    
    // Check if file already exists (either in published pages or unstaged changes)
    const actualFileName = newFileName.endsWith('/') ? newFileName : newFileName + '/';
    if (allPages.includes(actualFileName)) {
      return false;
    }
    
    // Check if file exists in unstaged changes
    const editExists = unstagedEdits.some(edit => edit.path === actualFileName);
    if (editExists) {
      return false;
    }
    
    return true;
  };

  const handleCreateFile = async () => {
    if (!newFileName || newFileName === '/') {
      setError('Please enter a valid file path');
      return;
    }

    const actualFileName = newFileName.endsWith('/') ? newFileName : newFileName + '/';
    
    try {
      await ensurePageExists(repo, actualFileName);
      setNewFileName('');
      loadPages();
      setError(null);
    } catch (err) {
      console.error('Error creating file:', err);
      setError('Failed to create file');
    }
  };

  const handleDeleteFile = async (path) => {
    if (path === '/') {
      setError('Cannot delete the home page');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${path}?`)) {
      try {
        await repo.deletePage(path);
        await loadPages();
        setError(null);
      } catch (err) {
        console.error('Error deleting file:', err);
        setError('Failed to delete file');
      }
    }
  };

  const handleRestore = async (path) => {
    try {
      await repo.restorePage(path);
      await loadPages();
      setError(null);
    } catch (err) {
      console.error('Error restoring page:', err);
      setError('Failed to restore page');
    }
  };

  const formatPath = (path) => {
    if (path === '/') return 'Home Page';
    return path.slice(1, -1); // Remove leading and trailing slashes
  };

  const getPageTitle = (path) => {
    const metadata = pageMetadata[path];
    if (metadata && metadata.title) {
      return metadata.title;
    }
    return formatPath(path);
  };

  // Get all items to display (existing pages + new edits)
  const getAllItems = () => {
    const existingPages = new Set(allPages);
    const editPaths = new Set(unstagedEdits.map(edit => edit.path));
    const allItems = [...allPages]; // Start with existing pages
    
    // Add unstaged edits that aren't yet pages
    unstagedEdits.forEach(edit => {
      if (!existingPages.has(edit.path)) {
        allItems.push(edit.path);
      }
    });
    
    return allItems.sort(); // Sort alphabetically
  };

  const getItemStatus = (path) => {
    const isExistingPage = allPages.includes(path);
    const edit = unstagedEdits.find(edit => edit.path === path);
    
    
    if (edit && edit.type === CHANGE_TYPE.DELETE) {
      return 'deleted';
    } else if (edit && edit.type === CHANGE_TYPE.NEW) {
      return 'new';
    } else if (edit && edit.type === CHANGE_TYPE.EDIT) {
      return 'edited';
    }
    return 'published';
  };

  if (isLoading) {
    return (
      <>
        <Navbar 
          logo={false}
          buttons={{ publish: true}}
        />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="loading loading-spinner loading-lg"></div>
          </div>
        </div>
      </>
    );
  }

  const allItems = getAllItems();

  return (
    <>
      <Navbar 
        logo={false}
        buttons={{ publish: true}}
      />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Pages ({allItems.length})</h1>
          
          {error && (
            <div className="alert alert-error mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Pages List Section */}
          <div className="bg-base-100 border-base-300 border mb-8 rounded-md">
            <div className="card-body">
              
              {allItems.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-600">No pages found</p>
                  <p className="text-sm text-gray-500 mt-2">Create a new page below to get started</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Path</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allItems.map((path, index) => {
                        const status = getItemStatus(path);
                        const isExistingPage = allPages.includes(path);
                        return (
                          <tr key={index}>
                            <td>
                              <div className="font-medium">{getPageTitle(path)}</div>
                            </td>
                            <td>
                              <code className="text-sm bg-base-200 px-2 py-1 rounded">{(path)}</code>
                            </td>
                            <td>
                              {status === 'new' && (
                                <span className="badge badge-success gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-3 h-3 stroke-current">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                  </svg>
                                  New
                                </span>
                              )}
                              {status === 'edited' && (
                                <span className="badge badge-warning gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-3 h-3 stroke-current">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                  </svg>
                                  Edited
                                </span>
                              )}
                              {status === 'deleted' && (
                                <span className="badge badge-error gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-3 h-3 stroke-current">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                  </svg>
                                  Deleted
                                </span>
                              )}
                              {status === 'published' && (
                                <span className="badge badge-info gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-3 h-3 stroke-current">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                  </svg>
                                  Published
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="flex space-x-2">
                                {status !== 'deleted' && (
                                  <>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => goToViewWithPreview(path)}
                                      title="Preview page"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                      </svg>
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => goToEdit(path)}
                                      title="Edit page"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                      </svg>
                                    </button>
                                  </>
                                )}
                                {(status !== 'published' || status === 'deleted') && (
                                  <button
                                    className="btn btn-sm btn-ghost btn-success"
                                    onClick={() => handleRestore(path)}
                                    title={status === 'deleted' ? 'Revert delete' : 'Restore to published'}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
                                    </svg>
                                  </button>
                                )}
                                {path !== '/' && status !== 'deleted' && (
                                  <button
                                    className="btn btn-sm btn-ghost btn-error"
                                    onClick={() => handleDeleteFile(path)}
                                    title="Delete page"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Create New File Section */}
          <div className="bg-base-100 border-base-300 border rounded-md">
            <div className="card-body">
              <h2 className="card-title">Create New Page</h2>
              <div className="form-control">
                <label className="input validator">
                  <svg className="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <g
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeWidth="2.5"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </g>
                  </svg>
                  <input
                    type="text"
                    required
                    placeholder="/blog/post/"
                    pattern="^\/[a-z0-9\-\/]+$"
                    title="Must contain only lowercase letters, numbers, hyphens, and slashes"
                    value={newFileName}
                    onChange={handleNewFileNameChange}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateFile();
                      }
                    }}
                  />
                </label>
                <p className="validator-hint">
                  Must contain only lowercase letters [a-z], numbers [0-9], hyphens -, and slashes /
                </p>
                <div className="mt-4">
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateFile}
                    disabled={!isFileNameValid()}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Pages; 