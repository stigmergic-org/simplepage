import React, { useState, useEffect, useRef } from 'react';
import { CHANGE_TYPE } from '@simplepg/repo';
import { useRepo } from '../hooks/useRepo';
import { useDomain } from '../hooks/useDomain';
import Navbar from '../components/navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import MediaModal from '../components/MediaModal';
import { formatFileSize } from '../utils/file-tools';
import { ICONS } from '../config/icons';

const Files = () => {
  const domain = useDomain();
  const { repo } = useRepo();
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState(() => {
    // Initialize from localStorage or default to '/'
    const savedPath = localStorage.getItem(`files-currentPath-${domain}`);
    return savedPath || '/';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('name'); // 'name', 'modified', 'lastModified'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [copiedFile, setCopiedFile] = useState(null);
  const [selectedMediaFile, setSelectedMediaFile] = useState(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  document.title = `Files - ${domain}`;

  // Save currentPath to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(`files-currentPath-${domain}`, currentPath);
  }, [currentPath, domain]);

  // Load files when repo or currentPath changes
  useEffect(() => {
    loadFiles();
  }, [repo, currentPath]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const fileList = await repo.files.ls(currentPath);
      setFiles(fileList);
      setError(null);
    } catch (err) {
      console.error('Error loading files:', err);
      setError('Failed to load files');
      setCurrentPath('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const sortFiles = (fileList) => {
    return [...fileList].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'modified':
          // Sort by change type (new, edited, deleted, published)
          const typeOrder = { [CHANGE_TYPE.NEW]: 0, [CHANGE_TYPE.EDIT]: 1, [CHANGE_TYPE.DELETE]: 2, undefined: 3 };
          comparison = (typeOrder[a.change] || 3) - (typeOrder[b.change] || 3);
          break;
        case 'lastModified':
          // For now, sort by name as a fallback
          comparison = a.name.localeCompare(b.name);
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const handleFolderClick = (folderName) => {
    const newPath = currentPath + folderName + '/';
    setCurrentPath(newPath);
  };

  const handleBreadcrumbClick = (index) => {
    const pathParts = currentPath.split('/').filter(part => part);
    const newPath = '/' + pathParts.slice(0, index + 1).join('/') + '/';
    setCurrentPath(newPath);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    const folderPath = currentPath.endsWith('/') 
      ? currentPath + newFolderName + '/'
      : currentPath + '/' + newFolderName + '/';
    
    try {
      await repo.files.mkdir(folderPath);
      setNewFolderName('');
      setShowNewFolderInput(false);
      loadFiles();
      setError(null);
    } catch (err) {
      console.error('Error creating folder:', err);
      setError('Failed to create folder');
    }
  };

  const handleFileUpload = async (files) => {
    for (const file of files) {
      try {
        const content = new Uint8Array(await file.arrayBuffer());
        const pathSplit = currentPath.split('/').filter(Boolean)
        const filePath = [...pathSplit, file.name.replaceAll(' ', '_')].join('/')
        
        await repo.files.add(filePath, content);
        

      } catch (err) {
        console.error('Error uploading file:', err);
        setError(`Failed to upload ${file.name}`);
      }
    }
    loadFiles();
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    handleFileUpload(files);
    e.target.value = ''; // Reset input
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDeleteFile = async (file) => {
    // Check if it's a directory and if it's empty
    if (file.type === 'directory') {
      try {
        const directoryContents = await repo.files.ls(file.path);
        if (directoryContents.length > 0) {
          setError(`Cannot delete non-empty directory "${file.name}".`);
          return;
        }
      } catch (err) {
        console.error('Error checking directory contents:', err);
        setError('Failed to check directory contents');
        return;
      }
    }

    if (window.confirm(`Are you sure you want to delete ${file.name}?`)) {
      try {
        await repo.files.rm(file.path);
        loadFiles();
        setError(null);
      } catch (err) {
        console.error('Error deleting file:', err);
        setError('Failed to delete file');
      }
    }
  };

  const handleRestore = async (file) => {
    try {
      await repo.files.restore(file.path);
      loadFiles();
      setError(null);
    } catch (err) {
      console.error('Error restoring file:', err);
      setError('Failed to restore file');
    }
  };

  const handleCopyPath = async (file) => {
    const fullPath = `/_files/${file.path}`;
    try {
      await navigator.clipboard.writeText(fullPath);
      setCopiedFile(file.path);
      // Clear the copied state after 2 seconds
      setTimeout(() => setCopiedFile(null), 2000);
    } catch (err) {
      console.error('Error copying path:', err);
      setError('Failed to copy path');
    }
  };

  const handleMediaFileClick = (file) => {
    setSelectedMediaFile(file);
    setIsMediaModalOpen(true);
  };

  const closeMediaModal = () => {
    setIsMediaModalOpen(false);
    setSelectedMediaFile(null);
  };

  // Status mapping constants
  const STATUS_MAP = {
    [CHANGE_TYPE.DELETE]: 'deleted',
    [CHANGE_TYPE.NEW]: 'new',
    [CHANGE_TYPE.EDIT]: 'modified',
    [CHANGE_TYPE.MKDIR]: 'new',
    undefined: 'published'
  };

  const STATUS_ICONS = {
    new: <img src="/_assets/images/icons/plus.svg" alt="New" className="w-3 h-3" />,
    modified: <img src="/_assets/images/icons/warning.svg" alt="Modified" className="w-3 h-3" />,
    deleted: <img src="/_assets/images/icons/trash.svg" alt="Deleted" className="w-3 h-3" />,
    published: <img src="/_assets/images/icons/check.svg" alt="Published" className="w-3 h-3" />
  };

  const STATUS_BADGES = {
    new: "badge gap-1 badge-success",
    modified: "badge gap-1 badge-warning",
    deleted: "badge gap-1 badge-error",
    published: "badge gap-1 badge-info"
  };

  const getFileStatus = (file) => STATUS_MAP[file.change] || 'published';

  const getStatusIcon = (status) => STATUS_ICONS[status] || null;

  const getStatusBadge = (status) => STATUS_BADGES[status] || "badge gap-1 badge-neutral";

  const renderBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(part => part);
    return (
      <div className="bg-base-100 border-base-300 border rounded-md mb-4 px-3" >
        <div className="breadcrumbs max-w-xs text-sm">
          <ul>
            <li>
              <a onClick={() => setCurrentPath('/')} className="cursor-pointer">
                <img src={ICONS.folder} alt="📁" className="w-4 h-4 dark:invert" />
                ~
              </a>
            </li>
            {parts.map((part, index) => (
              <li key={index}>
                <a onClick={() => handleBreadcrumbClick(index)} className="cursor-pointer">
                  {part}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <>
        <Navbar activeTab="Files" />
        <LoadingSpinner />
      </>
    );
  }

  const sortedFiles = sortFiles(files);

  return (
    <>
      <Navbar activeTab="Files" />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          
          {error && (
            <div className="alert alert-error mb-6">
              <img src={ICONS.error} alt="Error" className="stroke-current shrink-0 h-6 w-6" />
              <span>{error}</span>
            </div>
          )}

          {/* Breadcrumbs */}
          {renderBreadcrumbs()}

          {/* Files List */}
          <div 
            ref={dropZoneRef}
            className="bg-base-100 border-base-300 border rounded-md"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="card-body">
              {sortedFiles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-4">
                    <img src={ICONS.folder} alt="Folder" className="mx-auto h-12 w-12 dark:invert" />
                  </div>
                  <p className="text-gray-600">No files or folders found</p>
                  <p className="text-sm text-gray-500 mt-2">Upload files or create folders to get started</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFiles.map((file, index) => {
                        const status = getFileStatus(file);
                        const isFolder = file.type === 'directory';
                        return (
                          <tr key={index} className="hover:bg-base-300" >
                            <td>
                              <div
                                className="flex items-center gap-3 cursor-pointer"
                                onClick={() => {
                                  if (isFolder) {
                                    handleFolderClick(file.name);
                                  } else {
                                    handleMediaFileClick(file);
                                  }
                                }}
                              >
                                <img 
                                  src={isFolder ? ICONS.folder : ICONS.document} 
                                  alt={isFolder ? "📁" : "📄"} 
                                  className="w-4 h-4 dark:invert" 
                                />
                                <span className="">
                                  {file.name}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="text-sm text-gray-500">
                                {formatFileSize(file.size) || '-'}
                              </span>
                            </td>
                            <td>
                              <span className={getStatusBadge(status)}>
                                {getStatusIcon(status)}
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </span>
                            </td>
                            <td>
                              <div className="flex space-x-2">
                                {status !== 'deleted' && !isFolder && (
                                  <div className="tooltip" data-tip={copiedFile === file.path ? "Copied to clipboard" : "Copy path"}>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => handleCopyPath(file)}
                                    >
                                      <img src={ICONS.copy} alt="Copy" className="w-4 h-4 dark:invert" />
                                    </button>
                                  </div>
                                )}
                                {(status === 'modified' || status === 'deleted') && (
                                  <div className="tooltip" data-tip={status === 'deleted' ? 'Revert delete' : 'Restore to published'}>
                                    <button
                                      className="btn btn-sm btn-ghost btn-success"
                                      onClick={() => handleRestore(file)}
                                    >
                                      <img src={ICONS.restore} alt="Restore" className="w-4 h-4 dark:invert" />
                                    </button>
                                  </div>
                                )}
                                {status !== 'deleted' && (
                                  <div className="tooltip" data-tip="Delete">
                                    <button
                                      className="btn btn-sm btn-ghost btn-error"
                                      onClick={() => handleDeleteFile(file)}
                                    >
                                      <img src={ICONS.trash} alt="Delete" className="w-4 h-4 dark:invert" />
                                    </button>
                                  </div>
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



          {/* New Folder Input */}
          {showNewFolderInput && (
            <div className="bg-base-100 border-base-300 border rounded-md mb-6">
              <div className="card-body">
                <h3 className="card-title">Create New Folder</h3>
                <div className="form-control">
                  <input
                    type="text"
                    className="input input-bordered"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateFolder();
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                  >
                    Create
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowNewFolderInput(false);
                      setNewFolderName('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Drag and Drop Zone */}
          <div className="mt-4 p-8 border-2 border-dashed border-gray-300 rounded-lg text-center">
            <p className="text-gray-500 mb-4">Drag and drop files here to upload</p>
            
            {/* Action Buttons */}
            <div className="flex gap-2 justify-center">
              <button
                className="btn btn-soft btn-primary"
                onClick={() => setShowNewFolderInput(true)}
              >
                <img src={ICONS.folder} alt="📁" className="w-4 h-4 dark:invert" />
                New Folder
              </button>
              <button
                className="btn btn-soft btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <img src={ICONS.upload} alt="⬆️" className="w-4 h-4 dark:invert" />
                Upload Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Media Modal */}
      <MediaModal
        file={selectedMediaFile}
        isOpen={isMediaModalOpen}
        onClose={closeMediaModal}
        repo={repo}
      />
    </>
  );
};

export default Files; 