import { toString } from 'uint8arrays/to-string';
import { assert, mimeType as getMimeType, mediaType as getMediaType } from '@simplepg/common'
export { getMimeType as mimeType, getMediaType as mediaType }
import imageType from 'image-type';


/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes) => {
  if (bytes === undefined || bytes === null) return '';
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Encode file content to base64 data URL
 * @param {Uint8Array} fileContent - File content as Uint8Array
 * @param {string} filePath - File path to determine MIME type
 * @returns {string} Data URL (e.g., "data:image/jpeg;base64,/9j/4AAQ...")
 */
export const encodeFileToDataUrl = (fileContent, filePath) => {
  // Get file extension to determine MIME type
  const mime = getMimeType(filePath);
  
  // If we can't determine MIME type, return null
  if (!mime) {
    console.warn(`Unknown media extension: ${filePath}`);
    return null;
  }
  
  // Convert Uint8Array to base64
  const base64 = toString(fileContent, 'base64');
  
  // Return data URL
  return `data:${mime};base64,${base64}`;
};

/**
 * Convert avatar URL to File
 * @param {string} url - Avatar URL
 * @returns {Promise<{data: Uint8Array, name: string}>} File
 */
export const avatarUrlToFile = async (url) => {
  assert(url.startsWith('http'), `URL ${url} not supported`)
  const response = await fetch(url)
  const blob = await response.blob()
  const data = new Uint8Array(await blob.arrayBuffer())
  // Use image-type to detect the actual file extension from the binary data
  const imageInfo = await imageType(data)
  const fileExt = imageInfo ? imageInfo.ext : 'jpg' // fallback to 'jpg' if detection fails
  return {
    data,
    fileExt,
  }
}