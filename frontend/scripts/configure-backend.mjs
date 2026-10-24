// Write public frontend endpoints only; never reads backend keys.
import {readFile,writeFile} from 'node:fs/promises';
const api=new URL(process.argv[2]);
if(!['http:','https:'].includes(api.protocol)||api.username||api.password||api.search||api.hash||api.pathname!=='/')throw new Error('Supply an HTTP(S) backend origin without credentials or path.');
if(api.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(api.hostname))throw new Error('A public backend must use HTTPS.');
const ws=new URL(api);ws.protocol=api.protocol==='https:'?'wss:':'ws:';
const file='.env.local';
let env=await readFile(file,'utf8').catch(()=> '');
for(const [key,value] of Object.entries({VITE_DATA_MODE:'live',VITE_API_URL:api.origin,VITE_WS_URL:ws.origin})){
 const line=key+'='+value;
 const re=new RegExp('^'+key+'=.*$','m');
 env=re.test(env)?env.replace(re,line):env+'\n'+line;
}
await writeFile(file,env);
console.log('Public endpoints updated. Restart Vite. Backend CHAIN_MODE must be configured separately by its owner.');
