// Asset creation only. Does not perform browser/visual QA or call any wallet/backend.
import {chromium} from 'playwright';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld} from '@gltf-transform/functions';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,sep} from 'node:path';
const requested=process.argv.slice(2);
const slugs=requested.length?requested:['sppg-truck','burger-car'];
if(slugs.some(slug=>!['sppg-truck','burger-car'].includes(slug)))throw new Error('Unknown procedural collectible');
const root=resolve('public');
// Private temporary asset server: no dependency on the user's dev server or .env.
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+pathname);if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const body=await readFile(path);const ext=path.split('.').pop();
  res.writeHead(200,{'content-type':({html:'text/html',js:'text/javascript',png:'image/png',svg:'image/svg+xml',json:'application/json',glb:'model/gltf-binary'})[ext]||'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});
  page.on('pageerror',error=>console.error('Asset renderer: '+error.message));
  await page.goto(origin+'/collectibles/index.html',{waitUntil:'networkidle',timeout:120000});
  await page.waitForFunction(()=>window.collectibleReady,{},{timeout:60000}).catch(async error=>{console.error('Asset renderer state',await page.evaluate(()=>({ready:window.collectibleReady,status:document.getElementById('asset-status')?.textContent})));throw error;});
  await mkdir('public/collectibles/models',{recursive:true});await mkdir('public/collectibles/images',{recursive:true});
  for(const slug of slugs){
    const asset=await page.evaluate(slug=>window.collectibleExport(slug),slug);
    const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const doc=await io.readBinary(Buffer.from(asset.glb,'base64'));
    await doc.transform(weld(),dedup(),prune());
    await writeFile('public/collectibles/models/'+slug+'.glb',await io.writeBinary(doc));
    await writeFile('public/collectibles/images/'+slug+'.png',Buffer.from(asset.png,'base64'));
    console.log('Exported '+slug+' GLB and 1024px PNG');
  }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
