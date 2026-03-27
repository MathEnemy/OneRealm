const chainFlavor = (process.env.CHAIN_FLAVOR ?? 'onechain').toLowerCase();
const chainNetwork = process.env.CHAIN_NETWORK ?? 'testnet';

function titleCase(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

function defaultRpcUrl(): string {
  if (chainFlavor === 'sui') {
    return `https://fullnode.${chainNetwork}.sui.io`;
  }

  return `https://rpc-${chainNetwork}.onelabs.cc:443`;
}

export const CHAIN_FLAVOR = chainFlavor;
export const CHAIN_NETWORK = chainNetwork;
export const CHAIN_LABEL = process.env.CHAIN_LABEL
  ?? `${chainFlavor === 'sui' ? 'Sui' : 'OneChain'} ${titleCase(chainNetwork)}`;
export const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL ?? process.env.SUI_RPC_URL ?? defaultRpcUrl();
export const CHAIN_DOCS_URL = process.env.CHAIN_DOCS_URL ?? 'https://docs.onelabs.cc/DevelopmentDocument';
export const ONEBOX_URL = process.env.ONEBOX_URL ?? 'https://onebox.onelabs.cc/chat';
