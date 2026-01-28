export const isWeb3Uri = (href = '') =>
  typeof href === 'string' && href.toLowerCase().startsWith('web3://');

export const web3FormIframe = ({ uri, metadata }) => {
  // Simple iframe with src for testing
  const encodedUri = encodeURIComponent(uri || '');
  const encodedMeta = encodeURIComponent(metadata || '');
  const randomKey = Math.random().toString(36).substr(2, 9); // Random key for React stability
  return `
    <iframe
      key="${randomKey}"
      data-key="${randomKey}"
      src="/_assets/web3form.html?w3uri=${encodedUri}&meta=${encodedMeta}"
      class="web3-form-iframe"
      style="width: 100%;"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    ></iframe>
  `;
};
