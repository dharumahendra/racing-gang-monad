// Public Sketchfab metadata and credited thumbnails only. No login/session scraping.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import sharp from 'sharp';
const sources=[['minecraft-minecart','e23fb7a1bfca43f881bb8140465873f7'],['spongebob-boatmobile','abdca2ced413486b9c943111621d6f39']];
const previous=JSON.parse(await readFile('public/collectibles/sources.json','utf8').catch(()=> '[]'));
const records=[];await mkdir('public/collectibles/images',{recursive:true});
for(const [slug,uid] of sources){
 const response=await fetch('https://api.sketchfab.com/v3/models/'+uid);if(!response.ok)throw new Error('Sketchfab metadata: '+response.status);
 const model=await response.json();
 if(model.license?.slug!=='by'&&!model.license?.url?.includes('/by/4.0'))throw new Error('Check source license before reusing the thumbnail.');
 const candidates=model.thumbnails.images.filter(image=>image.width<=1920).sort((a,b)=>b.width-a.width);const thumbnail=candidates[0];if(!thumbnail)throw new Error('No public thumbnail');
 const image=await fetch(thumbnail.url);if(!image.ok)throw new Error('Thumbnail: '+image.status);
 await sharp(Buffer.from(await image.arrayBuffer())).png().toFile('public/collectibles/images/'+slug+'.png');
 const existing=previous.find(source=>source.uid===uid);
 records.push({...existing,slug,uid,title:model.name,author:model.user.displayName,authorUrl:model.user.profileUrl,sourceUrl:model.viewerUrl,license:model.license.url,downloadable:model.isDownloadable,thumbnailWidth:thumbnail.width,originalModel:existing?.originalModel??'Not bundled; official download requires Sketchfab login',retrievedAt:new Date().toISOString()});
 console.log('Saved credited preview image: '+slug);
}
await writeFile('public/collectibles/sources.json',JSON.stringify(records,null,2)+'\n');
