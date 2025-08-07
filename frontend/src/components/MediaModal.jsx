import React, { useEffect, useState } from 'react';
import { mediaType, encodeFileToDataUrl, formatFileSize } from '../utils/file-tools';

const MediaModal = ({ file, isOpen, onClose, repo }) => {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const loadMediaContent = async () => {
      if (!isOpen || !file || !repo) return;

      setIsLoading(true);
      try {
        // Get file content from repo
        const fileContent = await repo.files.cat(file.path);
        
        // Encode file content to data URL
        const dataUrl = encodeFileToDataUrl(fileContent, file.path);
        
        if (dataUrl) {
          setMediaUrl(dataUrl);
        } else {
          // Fallback to direct URL if encoding fails
          setMediaUrl(`/_files/${file.path}`);
        }
      } catch (error) {
        console.warn(`Failed to load media ${file.path}:`, error);
        // Fallback to direct URL
        setMediaUrl(`/_files/${file.path}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadMediaContent();
  }, [file, isOpen, repo]);

  if (!isOpen || !file) return null;

  const fileType = mediaType(file.path);

  const renderMedia = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="loading loading-spinner loading-lg"></div>
        </div>
      );
    }

    if (!mediaUrl) {
      return (
        <div className="text-center p-8">
          <p className="text-lg">Failed to load media</p>
          <p className="text-sm text-gray-500">{file.name}</p>
        </div>
      );
    }

    switch (fileType) {
      case 'image':
        return (
          <img
            src={mediaUrl}
            alt={file.name}
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: '90vh' }}
          />
        );
      case 'video':
        return (
          <video
            src={mediaUrl}
            controls
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: '90vh' }}
          >
            Your browser does not support the video tag.
          </video>
        );
      case 'audio':
        return (
          <div className="bg-base-200 p-8 rounded-lg">
            <audio
              src={mediaUrl}
              controls
              className="w-full"
            >
              Your browser does not support the audio tag.
            </audio>
            <div className="text-center mt-4">
              <p className="text-lg font-semibold">{file.name}</p>
            </div>
          </div>
        );
      case 'application':
        // Handle PDF files
        if (file.path.toLowerCase().endsWith('.pdf')) {
          return (
            <div className="w-full h-full flex items-center justify-center">
              <iframe
                src={mediaUrl}
                title={file.name}
                style={{ width: '80vh', height: '80vh' }}
              >
                <p>Your browser does not support PDF viewing. 
                  <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">
                    Click here to download the PDF
                  </a>
                </p>
              </iframe>
            </div>
          );
        }
        // Fall through for other application types
      default:
        return (
          <div className="text-center">
            <p className="text-lg">Unsupported file type</p>
            <p className="text-sm text-gray-500">{file.name}</p>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors cursor-pointer"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Media content */}
        <div className="bg-base-100 rounded-lg shadow-xl overflow-hidden">
          {renderMedia()}
        </div>

        {/* File info */}
        <div className="absolute -bottom-12 left-0 text-white text-sm">
          <p className="font-medium">{file.name}</p>
          {file.size && (
            <p className="text-gray-300">
              {formatFileSize(file.size)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaModal; 