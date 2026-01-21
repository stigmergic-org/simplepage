export const isWeb3Uri = (href = '') =>
  typeof href === 'string' && href.toLowerCase().startsWith('web3://');

export const web3FormIframe = ({ uri }) => {
  // Always return iframe HTML - let the iframe app handle validation and errors
  const encodedUri = encodeURIComponent(uri || '');
  return `
    <iframe
      src="/_assets/web3form.html?uri=${encodedUri}"
      class="web3-form-iframe"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      style="width: 100%; border: none; min-height: 400px;"
      loading="lazy"
    ></iframe>
  `;
};
