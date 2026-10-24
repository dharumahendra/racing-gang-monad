import { monadTestnet } from 'viem/chains';
const mode = import.meta.env.VITE_DATA_MODE || (import.meta.env.DEV ? 'mock' : 'live');
if (mode !== 'mock' && mode !== 'live') throw new Error('VITE_DATA_MODE harus mock atau live.');
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (apiUrl && !/^https?:\/\//.test(apiUrl)) throw new Error('VITE_API_URL harus berupa URL HTTP(S).');
const wsUrl=(import.meta.env.VITE_WS_URL||'').replace(/\/$/,'');
if(wsUrl&&!/^wss?:\/\//.test(wsUrl))throw new Error('VITE_WS_URL harus berupa origin WS(S).');
export const settings = { mode: mode as 'mock' | 'live', apiUrl, wsUrl, chain: monadTestnet, rpcUrl: import.meta.env.VITE_RPC_URL || undefined, privyAppId:(import.meta.env.VITE_PRIVY_APP_ID||'').trim(),privyClientId:(import.meta.env.VITE_PRIVY_CLIENT_ID||'').trim() };
