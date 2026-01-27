const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : null;

export const DOMAIN_SUFFIX = chainId === 11155111 ? '.sepoliaens.eth.link' : '.link';
