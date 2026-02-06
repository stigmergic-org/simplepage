export const hexToNumber = (value) => (value ? parseInt(value, 16) : null);

export const toHex = (value) => {
  if (value === null || value === undefined) return null;
  return `0x${value.toString(16)}`;
};

export const formatTimestamp = (value) => {
  if (!value) return 'Unknown';
  const date = new Date(hexToNumber(value) * 1000);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

export const formatTime = (value) => {
  if (!value) return '—';
  return new Date(hexToNumber(value) * 1000).toLocaleTimeString();
};

export const shorten = (value, chars = 6) => {
  if (!value) return '';
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
};
