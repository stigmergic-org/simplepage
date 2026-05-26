export const updateVirtualLinks = (parsedContent, targetPath = window.location.pathname) => {
  const links = parsedContent.querySelectorAll('a');
  const params = new URLSearchParams();

  links.forEach(link => {
    const href = link.getAttribute('href');

    if (href?.startsWith('/') && !href.startsWith('/spg-')) {
      params.set('path', href);
      link.href = `${targetPath}?${params.toString()}`;
    }
  });
};
