// Set the final public folder after hosting is known; never publish placeholder image URLs.
import {readFile,writeFile} from 'node:fs/promises';
const url=new URL(process.argv[2]);
if(url.protocol!=='https:')throw new Error('Use the permanent HTTPS cars folder.');
const base=url.href.replace(/\/$/,'')+'/';
for(let tier=1;tier<=4;tier++){
 const path='public/cars/'+tier+'.json';
 const metadata=JSON.parse(await readFile(path,'utf8'));
 metadata.image=new URL(tier+'.png',base).href;
 await writeFile(path,JSON.stringify(metadata,null,2)+'\n');
}
console.log('Metadata ready. Send this baseURI after publishing: '+base);
