import { ACESFilmicToneMapping, Box3, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { collectibles, type Collectible } from './collection';
import { createBurgerCar, createSppgTruck } from './models';

function label(kind:'box'|'cab'|'flag'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const c=canvas.getContext('2d')!;c.fillStyle=kind==='flag'?'#e6332b':'#f5f6f4';c.fillRect(0,0,1024,512);c.textAlign='center';
  if(kind==='flag'){c.fillStyle='#ffe16d';c.font='italic bold 230px Arial';c.fillText('KK',512,340);}
  else {
    // Transparent print: lettering sits directly on the painted body without a white sticker rectangle.
    canvas.width=2048;canvas.height=1024;c.clearRect(0,0,2048,1024);c.textAlign='center';
    c.strokeStyle='#9f8844';c.lineWidth=9;
    c.beginPath();c.arc(1024,206,126,0,Math.PI*2);c.stroke();
    c.lineWidth=3;c.beginPath();c.arc(1024,206,106,0,Math.PI*2);c.stroke();
    c.fillStyle='#143988';c.font='bold 76px Arial';c.fillText('BGN',1024,233);
    if(kind==='box'){
      c.font='bold 116px Arial';c.fillText('SATUAN PELAYANAN',1024,533);c.fillText('PEMENUHAN GIZI',1024,670);
      c.font='bold 41px Arial';c.fillText('SPPG  •  MAKAN BERGIZI GRATIS',1024,823);
    }else {
      c.font='bold 123px Arial';c.fillText('BADAN GIZI',1024,553);c.fillText('NASIONAL',1024,710);
    }
  }
  const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;
}
function createLocal(item:Collectible){
  return item.slug==='sppg-truck'?createSppgTruck({box:label('box'),cab:label('cab')}):createBurgerCar({flag:label('flag')});
}
const canvas=document.querySelector<HTMLCanvasElement>('#vehicle')!;
const renderer=new WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap;renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new Scene();scene.background=new Color('#e8e6e1');
const environment=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer),environmentMap=pmrem.fromScene(environment,.04);scene.environment=environmentMap.texture;environment.dispose();pmrem.dispose();
scene.add(new HemisphereLight('#ffffff','#8f9298',2.2));
const key=new DirectionalLight('#fff3df',4.2);key.position.set(-4,7,6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5});key.shadow.bias=-.0005;scene.add(key);
const fill=new DirectionalLight('#dceeff',2);fill.position.set(4,4,-4);scene.add(fill);
const ground=new Mesh(new PlaneGeometry(200,200),new MeshStandardMaterial({color:'#e8e6e1',roughness:.87}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const camera=new PerspectiveCamera(35,1,.05,100);const controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.enablePan=false;controls.minDistance=3;controls.maxDistance=16;controls.addEventListener('change',()=>renderer.render(scene,camera));
let active:Collectible=collectibles[1],object:Group|null=null;
let selectionGeneration=0;
const id=<T extends HTMLElement=HTMLElement>(name:string)=>document.getElementById(name) as T;
function render(){renderer.render(scene,camera);}
function frame(){if(!object)return;const bounds=new Box3().setFromObject(object),size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());object.position.sub(new Vector3(center.x,bounds.min.y,center.z));const height=size.y;controls.target.set(0,height*.43,0);const distance=Math.max(size.x,size.z,height)*1.9;camera.position.set(distance*.73,height*.55+distance*.36,distance*.88);controls.update();render();}
function resize(){const size=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,size.width),Math.max(1,size.height),false);camera.aspect=size.width/Math.max(1,size.height);camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(canvas);
function disposeModel(target:Group|null=object){if(!target)return;scene.remove(target);const materials=new Set<MeshStandardMaterial>();target.traverse(n=>{if(n instanceof Mesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])if(m instanceof MeshStandardMaterial)materials.add(m);}});for(const m of materials){m.map?.dispose();m.normalMap?.dispose();m.roughnessMap?.dispose();m.metalnessMap?.dispose();m.dispose();}if(target===object)object=null;}
async function select(item:Collectible){
  const generation=++selectionGeneration;
  active=item;disposeModel();id('name').textContent=item.name;id('description').textContent=item.description;id('credits').textContent=item.credits;
  const local=item.preview.kind==='local';id('local-view').hidden=!local;id('external-view').hidden=local;id('reset').hidden=!local;
  document.querySelectorAll<HTMLButtonElement>('[data-slug]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.slug===item.slug)));
  const image=id<HTMLImageElement>('poster');image.src='/collectibles/images/'+item.slug+'.png';image.alt=item.name;
  const frameHost=id('frame-host');frameHost.replaceChildren();
  if(!local){
    id('asset-status').textContent='Sketchfab preview · original GLB download pending';
    const button=document.createElement('button');button.type='button';button.textContent='Load Sketchfab 3D preview';button.onclick=()=>{const iframe=document.createElement('iframe');iframe.src=item.preview.kind==='sketchfab'?item.preview.url+'?autostart=1&ui_infos=0':'';iframe.title=item.name+' — Sketchfab';iframe.allow='autoplay; fullscreen; xr-spatial-tracking';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';frameHost.replaceChildren(iframe);};frameHost.append(button);
  }
  const download=id<HTMLAnchorElement>('download');download.hidden=!local;download.href=local&&item.preview.kind==='local'?'/collectibles/models/'+item.preview.model:'#';download.download=local&&item.preview.kind==='local'?item.preview.model:'';
  const source=id<HTMLAnchorElement>('source');source.hidden=!item.sourceUrl;source.href=item.sourceUrl??'#';
  id<HTMLAnchorElement>('draft').href='/collectibles/drafts/'+item.id+'.json';
  history.replaceState(null,'','?asset='+item.slug);
  if(local&&item.preview.kind==='local'){
    id('asset-status').textContent='Loading 3D model…';render();
    try{
      let loaded:Group;
      if(item.preview.source==='procedural')loaded=createLocal(item);
      else {
        loaded=(await new GLTFLoader().loadAsync('/collectibles/models/'+item.preview.model)).scene;
        const bounds=new Box3().setFromObject(loaded),size=bounds.getSize(new Vector3()),extent=Math.max(size.x,size.y,size.z);
        if(!Number.isFinite(extent)||extent<=0){disposeModel(loaded);throw new Error('Empty model');}
        // Normalize only the viewer transform; downloaded GLBs remain byte-for-byte originals.
        loaded.scale.multiplyScalar(4/extent);
        loaded.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});
      }
      if(generation!==selectionGeneration){disposeModel(loaded);return;}
      object=loaded;scene.add(object);resize();frame();
      id('asset-status').textContent=item.preview.source==='sketchfab'?'Local original GLB · Sketchfab · CC BY 4.0':'Local GLB + PNG · built from reference';
    }catch{
      if(generation!==selectionGeneration)return;
      id('asset-status').textContent='Could not load this model. Select it again to retry, or download the GLB.';
    }
  }
}
for(const item of collectibles){const button=document.createElement('button');button.type='button';button.dataset.slug=item.slug;const number=document.createElement('span');number.textContent=String(item.id).padStart(2,'0');const title=document.createElement('strong');title.textContent=item.name;const state=document.createElement('small');state.textContent=item.preview.kind==='local'?(item.preview.source==='sketchfab'?'Original 3D':'Code-built 3D'):'Sketchfab';button.append(number,title,state);button.onclick=()=>select(item);id('catalogue').append(button);}
id('reset').onclick=frame;
interface ExportResult{glb:string;png:string}
declare global{interface Window{collectibleExport:(slug:string)=>Promise<ExportResult>;collectibleReady:boolean}}
window.collectibleExport=async(slug:string)=>{
  const item=collectibles.find(c=>c.slug===slug);if(!item||item.preview.kind!=='local'||item.preview.source!=='procedural')throw new Error('Only code-built models can be re-exported.');await select(item);
  if(!object||active.slug!==item.slug)throw new Error('Selected model changed during export.');
  const binary=await new GLTFExporter().parseAsync(object!,{binary:true,onlyVisible:true});if(!(binary instanceof ArrayBuffer))throw new Error('Expected GLB');
  let bytes='';const data=new Uint8Array(binary);for(let i=0;i<data.length;i+=8192)bytes+=String.fromCharCode(...data.subarray(i,i+8192));
  renderer.setPixelRatio(1);renderer.setSize(1024,1024,false);camera.aspect=1;camera.updateProjectionMatrix();frame();render();
  const png=renderer.domElement.toDataURL('image/png').split(',')[1];const glb=btoa(bytes);resize();return {glb,png};
};
void select(collectibles.find(c=>c.slug===new URLSearchParams(location.search).get('asset'))??active).then(()=>{window.collectibleReady=true;});
