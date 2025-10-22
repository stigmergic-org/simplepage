import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { CHANGE_TYPE } from '@simplepg/repo';
import { useRepo, ensurePageExists } from '../hooks/useRepo';
import { useDomain } from '../hooks/useDomain';
import Navbar from '../components/navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import Notice from '../components/Notice';
import Icon from '../components/Icon';


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

  document.title = `Pages - ${domain}`;

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
    const pattern = /^\/[a-z0-9\-/]+$/;
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
    // const editPaths = new Set(unstagedEdits.map(edit => edit.path));
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
    // const isExistingPage = allPages.includes(path);
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
          activePage="Pages"
        />
        <LoadingSpinner />
      </>
    );
  }

  const allItems = getAllItems();

  return (
    <>
      <Navbar 
        activePage="Pages"
      />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* <h1 className="text-3xl font-bold mb-8">Pages ({allItems.length})</h1> */}
          
          {error && (
            <Notice type="error" message={error} onClose={() => setError(null)} />
          )}

          {/* Pages List Section */}
          <div className="bg-base-100 border-base-300 border mb-8 rounded-md">
            <div className="card-body">
              
              {allItems.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-4">
                    <Icon name="document" className='mx-auto' size={12} />
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
                        // const isExistingPage = allPages.includes(path);
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
                                  <Icon name="plus" size={3} disableInvert={true} />
                                  New
                                </span>
                              )}
                              {status === 'edited' && (
                                <span className="badge badge-warning gap-1">
                                  <Icon name="warning" size={3} disableInvert={true} />
                                  Edited
                                </span>
                              )}
                              {status === 'deleted' && (
                                <span className="badge badge-error gap-1">
                                  <Icon name="trash" size={3} disableInvert={true} />
                                  Deleted
                                </span>
                              )}
                              {status === 'published' && (
                                <span className="badge badge-info gap-1">
                                  <Icon name="check" size={3} disableInvert={true} />
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
                                      <Icon name="preview" />
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => goToEdit(path)}
                                      title="Edit page"
                                    >
                                      <Icon name="edit" />
                                    </button>
                                  </>
                                )}
                                {(status === 'edited' || status === 'deleted') && (
                                  <button
                                    className="btn btn-sm btn-ghost btn-success"
                                    onClick={() => handleRestore(path)}
                                    title={status === 'deleted' ? 'Revert delete' : 'Restore to published'}
                                  >
                                    <Icon name="restore" />
                                  </button>
                                )}
                                {path !== '/' && status !== 'deleted' && (
                                  <button
                                    className="btn btn-sm btn-ghost btn-error"
                                    onClick={() => handleDeleteFile(path)}
                                    title="Delete page"
                                  >
                                    <Icon name="trash" />
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
                  <Icon name="document" className='h-[1em] opacity-50' />
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