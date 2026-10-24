import {build} from 'vite';
import {resolve} from 'node:path';
await build({configFile:false,publicDir:false,build:{outDir:'public/collectibles',emptyOutDir:false,target:'es2022',lib:{entry:resolve('src/nft/viewer.ts'),formats:['es'],fileName:()=> 'viewer.js'}}});
