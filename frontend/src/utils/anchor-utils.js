/**
 * Generates an anchor ID from heading text
 * @param {string} text - The heading text
 * @returns {string} - The generated anchor ID
 */
export const generateAnchorId = (text) => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};
