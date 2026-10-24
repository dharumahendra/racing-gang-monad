export type Collectible = {
  id:number; slug:string; name:string; description:string;
  preview:{kind:'local';model:string;source:'procedural'|'sketchfab'}|{kind:'sketchfab';uid:string;url:string};
  credits:string; sourceUrl?:string; license?:string;
};
export const collectibles:readonly Collectible[] = [
  {id:1,slug:'minecraft-minecart',name:'Minecraft Minecart',description:'Simplified Minecraft Minecart by Vlad94077. Independent Racing Gang collectible; no gameplay tier or performance benefit.',preview:{kind:'local',model:'minecraft-minecart.glb',source:'sketchfab'},credits:'Simplified Minecraft Minecart by Vlad94077, Sketchfab, CC BY 4.0. Original GLB downloaded from Sketchfab and bundled with embedded textures. Attribution retained.',sourceUrl:'https://sketchfab.com/3d-models/simplified-minecraft-minecart-e23fb7a1bfca43f881bb8140465873f7',license:'https://creativecommons.org/licenses/by/4.0/'},
  {id:2,slug:'sppg-truck',name:'Satuan P Balap',description:'A white Bangun Balap box truck with Satuan P Balap livery, used as Racing Gang’s free Starter appearance. This collectible artwork does not unlock paid tiers or provide a performance benefit.',preview:{kind:'local',model:'sppg-truck.glb',source:'procedural'},credits:'Procedural Three.js interpretation of the reference supplied by the user on 2026-10-24. Bangun Balap is fictional Racing Gang branding, not an official service vehicle or an imported manufacturer model.'},
  {id:3,slug:'burger-car',name:'Burger Car',description:'A sesame-bun vehicle with lettuce, cheese, a patty, blue windshield, red seats and a KK flag. Procedural interpretation of the user-supplied reference. Independent Racing Gang collectible; no gameplay tier or performance benefit.',preview:{kind:'local',model:'burger-car.glb',source:'procedural'},credits:'Procedural Three.js interpretation of the burger-vehicle reference supplied by the user on 2026-10-24. Reference characters/branding remain associated with their respective owners.'},
  {id:4,slug:'spongebob-boatmobile',name:'SpongeBob Boatmobile',description:'Spongebob Boatmobile | #SketchfabWeeklyChallenge by TheoClarke. Independent Racing Gang collectible; no gameplay tier or performance benefit.',preview:{kind:'local',model:'spongebob-boatmobile.glb',source:'sketchfab'},credits:'Spongebob Boatmobile | #SketchfabWeeklyChallenge by TheoClarke, Sketchfab, CC BY 4.0. Original GLB downloaded from Sketchfab and bundled with embedded textures. Attribution retained.',sourceUrl:'https://sketchfab.com/3d-models/spongebob-boatmobile-sketchfabweeklychallenge-abdca2ced413486b9c943111621d6f39',license:'https://creativecommons.org/licenses/by/4.0/'},
];
export function buildCollectibleMetadata(item:Collectible,publicFolder:string) {
  const base=new URL(publicFolder);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Use a public HTTPS collection folder without credentials, query or fragment.');
  base.pathname=base.pathname.replace(/\/$/,'')+'/';
  return {
    name:'Racing Gang Collectibles — '+item.name,
    description:item.description,
    image:new URL('images/'+item.slug+'.png',base).href,
    ...(item.preview.kind==='local'?{animation_url:new URL('models/'+item.preview.model,base).href}:{}),
    external_url:item.sourceUrl??new URL('index.html?asset='+item.slug,base).href,
    attributes:[{trait_type:'Collection',value:'Racing Gang Collectibles'},{trait_type:'Vehicle',value:item.name},{trait_type:'Gameplay effect',value:'None'},{trait_type:'Artwork',value:item.preview.kind==='local'&&item.preview.source==='procedural'?'Procedural 3D':'Sketchfab source'}],
    properties:{collectible_id:item.id,credits:item.credits,...(item.license?{license:item.license}:{}),...(item.sourceUrl?{source:item.sourceUrl}:{}),...(item.preview.kind==='sketchfab'?{original_model_status:'Download pending; original GLB not bundled',preview_url:item.preview.url}:{})},
  };
}
