const chainFlavor = (process.env.NEXT_PUBLIC_CHAIN_FLAVOR ?? 'onechain').toLowerCase();
const chainNetwork = process.env.NEXT_PUBLIC_CHAIN_NETWORK ?? process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

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
export const CHAIN_LABEL = process.env.NEXT_PUBLIC_CHAIN_LABEL
  ?? `${chainFlavor === 'sui' ? 'Sui' : 'OneChain'} ${titleCase(chainNetwork)}`;
export const CHAIN_RPC_URL = process.env.NEXT_PUBLIC_CHAIN_RPC_URL ?? defaultRpcUrl();
export const EXPLORER_TX_URL_PREFIX = process.env.NEXT_PUBLIC_EXPLORER_TX_URL_PREFIX
  ?? (chainFlavor === 'sui' ? 'https://suiexplorer.com/txblock/' : '');
export const CHAIN_DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.onelabs.cc/DevelopmentDocument';
export const ONEBOX_URL = process.env.NEXT_PUBLIC_ONEBOX_URL ?? 'https://onebox.onelabs.cc/chat';
export const ONEPLAY_URL = process.env.NEXT_PUBLIC_ONEPLAY_URL ?? 'https://hash.one-play.cc';
export const ONEPREDICT_URL = process.env.NEXT_PUBLIC_ONEPREDICT_URL ?? 'https://onepredict.cc';

export function buildExplorerTxUrl(digest: string): string | null {
  if (!EXPLORER_TX_URL_PREFIX) {
    return null;
  }

  if (CHAIN_FLAVOR === 'sui') {
    return `${EXPLORER_TX_URL_PREFIX}${digest}?network=${CHAIN_NETWORK}`;
  }

  return `${EXPLORER_TX_URL_PREFIX}${digest}`;
}
