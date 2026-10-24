// Validate exported files, without browser visual QA or external services.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
import {collectibles} from '../../src/nft/collection.ts';
const manifest=[];
const sources=JSON.parse(await readFile('public/collectibles/sources.json','utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const item of collectibles){
 const metadata=JSON.parse(await readFile('public/collectibles/drafts/'+item.id+'.json','utf8'));
 if(!metadata.properties.draft||metadata.properties.collectible_id!==item.id)throw new Error('Wrong draft identity: '+item.slug);
 const imagePath='images/'+item.slug+'.png',image=await readFile('public/collectibles/'+imagePath),info=await sharp(image).metadata();
 if(info.format!=='png'||!info.width||!info.height)throw new Error('Invalid PNG: '+item.slug);
 const record={id:item.id,slug:item.slug,image:{path:imagePath,bytes:image.length,width:info.width,height:info.height,sha256:createHash('sha256').update(image).digest('hex')},modelStatus:item.preview.kind==='local'?(item.preview.source==='sketchfab'?'original-downloaded':'exported'):'original-download-pending'};
 if(item.preview.kind==='local'){
  const path='models/'+item.preview.model,buffer=await readFile('public/collectibles/'+path);
  if(buffer.toString('ascii',0,4)!=='glTF'||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)throw new Error('Invalid GLB: '+item.slug);
  if(item.preview.source==='sketchfab'&&sources.find(source=>source.slug===item.slug)?.modelSha256!==createHash('sha256').update(buffer).digest('hex'))throw new Error('Original GLB checksum differs from download provenance: '+item.slug);
  const doc=await io.read('public/collectibles/'+path);if(!doc.getRoot().listMeshes().length)throw new Error('No meshes: '+item.slug);
  for(const accessor of doc.getRoot().listAccessors()){const data=accessor.getArray();if(data)for(const n of data)if(!Number.isFinite(n))throw new Error('Non-finite export geometry');}
  record.model={path,bytes:buffer.length,meshes:doc.getRoot().listMeshes().length,sha256:createHash('sha256').update(buffer).digest('hex')};
 }
 manifest.push(record);console.log('Verified '+item.slug+' PNG, metadata'+(record.model?' and GLB':' (original GLB pending)'));
}
await writeFile('public/collectibles/manifest.json',JSON.stringify(manifest,null,2)+'\n');
