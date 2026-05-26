export const restorePromotedCssElements = (parsedContent) => {
  const elements = Array.from(parsedContent.head.querySelectorAll(
    'style, link[rel="stylesheet"], link[rel="preload"][as="style"]'
  ));
  if (elements.length === 0) return;

  const fragment = parsedContent.createDocumentFragment();
  elements.forEach(element => fragment.appendChild(element));
  parsedContent.body.insertBefore(fragment, parsedContent.body.firstChild);
};
