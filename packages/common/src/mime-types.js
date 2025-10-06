export const MIME_TYPES = {
  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',
  'avif': 'image/avif',
  
  // Videos
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogg': 'video/ogg',
  'mov': 'video/quicktime',
  'avi': 'video/x-msvideo',
  'wmv': 'video/x-ms-wmv',
  'flv': 'video/x-flv',
  'mkv': 'video/x-matroska',
  'm4v': 'video/x-m4v',
  '3gp': 'video/3gpp',
  
  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'aac': 'audio/aac',
  'flac': 'audio/flac',
  'm4a': 'audio/mp4',
  'wma': 'audio/x-ms-wma',
  
  // Documents
  'pdf': 'application/pdf'
};

/**
 * Get MIME type from file path
 * @param {string} path - File path
 * @returns {string|null} MIME type or null if not found
 */
export const mimeType = (path) => {
  const extension = path.split('.').pop().toLowerCase()
  return MIME_TYPES[extension]
}

/**
 * Get media type from file path
 * @param {string} path - File path
 * @returns {string|null} Media type (image, video, audio) or null if not found
 */
export const mediaType = path => mimeType(path)?.split('/')[0]
