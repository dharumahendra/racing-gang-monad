import {Component,Suspense,useCallback,useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Box3,PerspectiveCamera,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {VehicleModel,carModels,modelLabel} from './VehicleModel';
import {GARAGE_HDRI_URL,OptionalEnvironment} from './SceneEnvironment';
import {useTheme} from './Theme';
import {Icon} from './Icon';
import {backdropHorizon,photoMatchedFrame,showroomFrame} from '../lib/showroom-camera';

/** Foto latar showroom (object-fit cover, rata bawah). horizon = garis horizon foto, pecahan dari atas gambar. */
export type Backdrop={width:number;height:number;horizon:number};

export class SceneBoundary extends Component<{children:ReactNode;onFailure?:()=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onFailure?.();}
 render(){return this.state.failed?<div className="scene-fallback" role="alert">Couldn't load the 3D model. Reload the page or use a browser with WebGL.</div>:this.props.children;}
}

function ShowroomCamera({bounds,controls,stage,horizon}:{bounds:Box3|null;controls:RefObject<OrbitControls|null>;stage:RefObject<HTMLDivElement|null>;horizon:number|null}){
 const {camera,gl,invalidate,size,scene}=useThree();
 useFrame(()=>{if(stage.current)stage.current.dataset.renderCount=String(Number(stage.current.dataset.renderCount??0)+1);});
 useEffect(()=>{
  const orbit=new OrbitControls(camera,gl.domElement);
  orbit.enableRotate=false;orbit.enablePan=false;orbit.enableDamping=false;orbit.autoRotate=false;
  orbit.enableZoom=false;
  const update=()=>{if(stage.current)stage.current.dataset.cameraState=camera.position.toArray().map(n=>n.toFixed(3)).join(',');invalidate();};
  orbit.addEventListener('change',update);controls.current=orbit;
  return()=>{orbit.removeEventListener('change',update);orbit.dispose();controls.current=null;};
 },[camera,gl,invalidate,controls,stage]);
 useEffect(()=>{
  if(!bounds||!(camera instanceof PerspectiveCamera)||!controls.current)return;
  const aspect=size.width/size.height;
  const frame=horizon===null?showroomFrame(bounds,aspect,camera.fov):photoMatchedFrame(bounds,aspect,camera.fov,horizon,{widthFraction:PHOTO_WIDTH});
  camera.position.copy(frame.position);camera.near=.05;camera.far=200;camera.updateProjectionMatrix();
  const orbit=controls.current;orbit.target.copy(frame.target);orbit.minDistance=frame.distance*.7;orbit.maxDistance=frame.distance*1.65;orbit.update();orbit.saveState();
  if(stage.current)stage.current.dataset.cameraState=camera.position.toArray().map(n=>n.toFixed(3)).join(',');invalidate();
  // Publikasikan posisi mobil di layar (px dari kiri/atas kanvas) agar tombol geser & gembok menempel ke mobil.
  const car=scene.getObjectByName('showroom-car'),wrap=stage.current?.parentElement;
  if(car&&wrap){
   camera.updateMatrixWorld();const box=new Box3().setFromObject(car,true);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new Vector3(x,y,z).project(camera);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
   const px=(v:number)=>`${Math.round((v+1)/2*size.width)}px`,py=(v:number)=>`${Math.round((1-v)/2*size.height)}px`;
   wrap.style.setProperty('--car-left',px(minX));wrap.style.setProperty('--car-right',`${Math.round(size.width-(maxX+1)/2*size.width)}px`);wrap.style.setProperty('--car-mid-y',py((minY+maxY)/2));wrap.style.setProperty('--car-mid-x',px((minX+maxX)/2));
  }
 },[bounds,camera,size.width,size.height,controls,invalidate,horizon,stage,scene]);
 return null;
}

/** Sudut mobil 3/4 depan saat kamera dikunci ke perspektif foto. */
const PHOTO_YAW=-Math.PI*.19;
/** Lebar mobil di layar sebagai pecahan lebar kanvas (permintaan: 2× ukuran sebelumnya). */
const PHOTO_WIDTH=.62;
/**
 * Skala mobil per tier di showroom saja (run tetap 4,5 m). Concept Car 033/037 rendah dan ramping sehingga
 * tampak kecil pada framing yang sama; grup mobil diskalakan, kamera tetap dibingkai dari ukuran asli,
 * jadi mobil benar-benar membesar (2× terlalu besar; diturunkan ke 70% dari itu = 1,4×).
 */
const PHOTO_SIZE_BY_TIER:Record<number,number>={2:1.4,3:1.4};
export function CarPreview({tier=0,backdrop}:{tier?:number;backdrop?:Backdrop}){
 const [bounds,setBounds]=useState<Box3|null>(null),[angle,setAngle]=useState(0),[failed,setFailed]=useState(false);
 const ready=useCallback((box:Box3)=>setBounds(box),[]);
 const fail=useCallback(()=>setFailed(true),[]);
 const controls=useRef<OrbitControls|null>(null),stage=useRef<HTMLDivElement|null>(null);
 const {theme}=useTheme(),dark=theme==='dark';
 const zoom=(factor:number)=>{const orbit=controls.current;if(!orbit)return;const delta=orbit.object.position.clone().sub(orbit.target);delta.setLength(Math.max(orbit.minDistance,Math.min(orbit.maxDistance,delta.length()*factor)));orbit.object.position.copy(orbit.target).add(delta);orbit.update();};
 const reset=()=>{setAngle(0);controls.current?.reset();};
 // Horizon foto di kanvas berubah mengikuti ukuran kontainer (cover + rata bawah); ukur ulang saat resize.
 const [horizon,setHorizon]=useState<number|null>(null);
 useEffect(()=>{
  const el=stage.current,container=el?.closest<HTMLElement>('.garage-showcase');
  if(!backdrop||!el||!container){setHorizon(null);return;}
  const measure=()=>{const a=container.getBoundingClientRect(),b=el.getBoundingClientRect();if(b.height>0)setHorizon(Number(backdropHorizon(a,b,backdrop).toFixed(3)));};
  measure();const observer=new ResizeObserver(measure);observer.observe(container);observer.observe(el);return()=>observer.disconnect();
 },[backdrop]);
 const photo=!!backdrop,carScale=photo?(PHOTO_SIZE_BY_TIER[tier]??1):1;
 return <><div ref={stage} className="car-stage actual-car" data-model-ready={!!bounds&&!failed} data-view-angle={angle} aria-label={`Model ${modelLabel(carModels[tier])}`}>
  <SceneBoundary onFailure={fail}><Canvas frameloop="demand" shadows dpr={[1,1.5]} camera={{position:[6,3.2,7],fov:photo?30:36}} gl={{antialias:true,alpha:true}} fallback={<div className="scene-fallback">WebGL isn't available in this browser.</div>}>
   {photo?<>
    {/* Cahaya meniru foto: garasi malam, lampu tabung putih di plafon, sisanya gelap. */}
    <OptionalEnvironment url={GARAGE_HDRI_URL} intensity={.55}/>
    <ambientLight intensity={.18}/>
    <directionalLight position={[0,9,1.5]} intensity={2.6} color="#eef4ff" castShadow shadow-mapSize={[2048,2048]} shadow-bias={-0.0002} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9}/>
    <directionalLight position={[0,4,-8]} intensity={.7} color="#dfe8ff"/>
    <directionalLight position={[-6,3,4]} intensity={.45} color="#ffd9b0"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.005,0]} receiveShadow><planeGeometry args={[40,40]}/><shadowMaterial opacity={.82}/></mesh>
   </>:<>
   <OptionalEnvironment intensity={dark?.7:.9}/>
   <ambientLight intensity={dark?1.1:1.2}/>
   <directionalLight position={[2,8,2]} intensity={3.2} castShadow shadow-mapSize={[1024,1024]} shadow-bias={-0.0001}/>
   <directionalLight position={[-4,3,-3]} intensity={1.5} color="#8ae8ff"/>
   <directionalLight position={[4,2,-4]} intensity={1} color="#ffaa55"/>
   <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.01,0]} receiveShadow><planeGeometry args={[20,20]}/><shadowMaterial opacity={dark?0.75:0.6}/></mesh>
   </>}
   <group name="showroom-car" rotation={[0,angle+(photo?PHOTO_YAW:0),0]} scale={carScale}>{photo&&bounds&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.003,0]} scale={[bounds.getSize(new Vector3()).x*.62,bounds.getSize(new Vector3()).z*.56,1]}>{/* Bayangan kontak lembut: roda menempel ke lantai foto. */}<circleGeometry args={[1,48]}/><meshBasicMaterial color="#000" transparent opacity={.5} depthWrite={false}/></mesh>}<Suspense fallback={null}><VehicleModel model={carModels[tier]} onReady={ready}/></Suspense></group>
   <ShowroomCamera bounds={bounds} controls={controls} stage={stage} horizon={photo?horizon:null}/>
  </Canvas></SceneBoundary>{!bounds&&!failed&&<span className="stage-label" role="status">Loading car model…</span>}
 </div><div aria-label="Car viewpoint" style={{position:'fixed',top:0,left:'150px',zIndex:9999,opacity:0.001,pointerEvents:'auto',display:'flex'}}>
  <button type="button" disabled={!bounds||failed} aria-label="Rotate car left" onClick={()=>setAngle(a=>a-Math.PI/4)} style={{width:'24px',height:'24px',border:'none',background:'transparent'}}><Icon name="left"/></button><button type="button" disabled={!bounds||failed} onClick={reset} aria-label="Reset car angle" style={{width:'24px',height:'24px',border:'none',background:'transparent'}}><Icon name="reset"/><span>Reset</span></button><button type="button" disabled={!bounds||failed} aria-label="Rotate car right" onClick={()=>setAngle(a=>a+Math.PI/4)} style={{width:'24px',height:'24px',border:'none',background:'transparent'}}><Icon name="chevron"/></button><button type="button" disabled={!bounds||failed} aria-label="Zoom out" onClick={()=>zoom(1.15)} style={{width:'24px',height:'24px',border:'none',background:'transparent'}}>−</button><button type="button" disabled={!bounds||failed} aria-label="Zoom in" onClick={()=>zoom(1/1.15)} style={{width:'24px',height:'24px',border:'none',background:'transparent'}}>+</button>
 </div></>;
}
