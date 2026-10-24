// Poly Haven CC0 import: source glTF + dependencies, checksum validation, browser GLB/WebP.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const raw=resolve(process.argv[2]),out=resolve('public/assets/landscape');
await mkdir(raw,{recursive:true});await mkdir(out,{recursive:true});
const assets=[];const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(url+': '+r.status);return r.json();};
async function download(file,path){
 const r=await fetch(file.url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(file.url+': '+r.status);
 const b=Buffer.from(await r.arrayBuffer());
 if(b.length!==file.size || createHash('md5').update(b).digest('hex')!==file.md5)throw Error('Source checksum mismatch: '+file.url);
 await mkdir(dirname(path),{recursive:true});await writeFile(path,b);
 return {url:file.url,bytes:b.length,sha256:sha(b)};
}
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
for(const [id,height,budget] of [['rock_moss_set_02',1.7,6000],['tree_small_02',7,12000]]){
 const meta=await json('https://api.polyhaven.com/files/'+id),entry=meta.gltf['1k'].gltf;
 const dir=resolve(raw,id);const sources=[];
 sources.push(await download(entry,resolve(dir,id+'.gltf')));
 for(const [file,details] of Object.entries(entry.include))sources.push(await download(details,resolve(dir,file)));
 const doc=await io.read(resolve(dir,id+'.gltf')),scene=doc.getRoot().getDefaultScene()??doc.getRoot().listScenes()[0];
 const before=getBounds(scene),s=height/(before.max[1]-before.min[1]);
 const node=doc.createNode(id).setScale([s,s,s]).setTranslation([-s*(before.min[0]+before.max[0])/2,-s*before.min[1],-s*(before.min[2]+before.max[2])/2]);
 for(const child of scene.listChildren()){scene.removeChild(child);node.addChild(child);}scene.addChild(node);
 const triangles=()=>doc.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
 const originalTriangles=triangles();
 await doc.transform(prune(),dedup(),flatten(),join({keepNamed:false}),weld(),simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,budget/originalTriangles),error:.02}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[768,768]}),prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const b=await io.writeBinary(doc);await writeFile(resolve(out,id+'.glb'),b);
 assets.push({id,license:'CC0-1.0',source:'https://polyhaven.com/a/'+id,sources,output:id+'.glb',bytes:b.length,sha256:sha(b),originalTriangles,triangles:Math.round(triangles()),heightMeters:height});
}
const terrain=await json('https://api.polyhaven.com/files/rocky_terrain_02');
for(const [type,suffix] of [['Diffuse','diff'],['nor_gl','normal'],['Rough','roughness']]){
 const entry=terrain[type]['1k'].jpg;const path=resolve(raw,'terrain_'+suffix+'.jpg');
 const source=await download(entry,path);
 const b=await sharp(path).webp({quality:suffix==='normal'?90:82}).toBuffer();const name='terrain_'+suffix+'.webp';
 await writeFile(resolve(out,name),b);assets.push({id:'rocky_terrain_02',source:'https://polyhaven.com/a/rocky_terrain_02',license:'CC0-1.0',sources:[source],output:name,bytes:b.length,sha256:sha(b)});
}
const id='kloofendal_48d_partly_cloudy_puresky';const sky=await json('https://api.polyhaven.com/files/'+id);
const source=await download(sky.hdri['1k'].hdr,resolve(out,'sky_1k.hdr'));
assets.push({id,source:'https://polyhaven.com/a/'+id,license:'CC0-1.0',output:'sky_1k.hdr',...source});
await writeFile(resolve(out,'LICENSE.txt'),'Poly Haven assets: CC0 1.0 Universal.\nOfficial license: https://polyhaven.com/license\nLegal code: https://creativecommons.org/publicdomain/zero/1.0/\nModels and textures modified for browser use; see manifest.json for provenance and checksums.\n');
await writeFile(resolve(out,'manifest.json'),JSON.stringify({license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',assets},null,2)+'\n');
console.log(JSON.stringify(assets.map(({id,output,bytes,triangles})=>({id,output,bytes,triangles})),null,2));
