// Run with node --import tsx scripts/collectibles/prepare.mjs [https://domain/collectibles/]
import {mkdir,writeFile,access} from 'node:fs/promises';
import {collectibles,buildCollectibleMetadata} from '../../src/nft/collection.ts';
import {designs,designMetadata} from '../../src/nft/designs.ts';
const publicFolder=process.argv[2];
if(publicFolder)buildCollectibleMetadata(collectibles[0],publicFolder);
const target='public/collectibles/'+(publicFolder?'metadata':'drafts');await mkdir(target,{recursive:true});
// Draft tetap memakai empat aset historis; metadata/ hanya memakai tiga ID kontrak RGX.
const rows=publicFolder?designs.map(design=>({item:design.asset,id:design.id})):collectibles.map(item=>({item,id:item.id}));
for(const {item,id} of rows){
  let metadata;
  if(publicFolder){
    await access('public/collectibles/images/'+item.slug+'.png');
    if(item.preview.kind==='local')await access('public/collectibles/models/'+item.preview.model);
    metadata=designMetadata(id,publicFolder);
  }else{
    metadata=buildCollectibleMetadata(item,'https://metadata-draft.invalid/collectibles/');
    metadata.image='../images/'+item.slug+'.png';
    if(item.preview.kind==='local')metadata.animation_url='../models/'+item.preview.model;
    if(!item.sourceUrl)metadata.external_url='../index.html?asset='+item.slug;
    metadata.properties.draft=true;
    metadata.description+=' DRAFT: set permanent public HTTPS asset URLs before minting.';
  }
  await writeFile(target+'/'+id+'.json',JSON.stringify(metadata,null,2)+'\n');
}
await writeFile('public/collectibles/catalogue.json',JSON.stringify(collectibles,null,2)+'\n');
console.log(publicFolder?'Metadata written. Proposed base URI: '+new URL('metadata/',publicFolder.replace(/\/$/,'')+'/').href:'Drafts written; not final mint metadata.');
