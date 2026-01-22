export const isWeb3Uri = (href = '') =>
  typeof href === 'string' && href.toLowerCase().startsWith('web3://');

export const web3FormIframe = ({ uri }) => {
  // Simple iframe with src for testing
  const encodedUri = encodeURIComponent(uri || '');
  const randomKey = Math.random().toString(36).substr(2, 9); // Random key for React stability
  return `
    <iframe
      key="${randomKey}"
      src="/_assets/web3form.html?uri=${encodedUri}"
      class="web3-form-iframe"
      style="width: 100%; border: 1px solid #ccc;"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    ></iframe>
  `;
};
