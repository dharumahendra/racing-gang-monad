import {Component,Suspense,useCallback,useState,type ReactNode} from 'react';
import {Canvas} from '@react-three/fiber';
import {VehicleModel,carModels} from './VehicleModel';
import {useTheme} from './Theme';
import {Icon} from './Icon';
export class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="scene-fallback" role="alert">Model 3D belum bisa dimuat. Muat ulang halaman atau gunakan browser dengan WebGL.</div>:this.props.children;}
}
export function CarPreview({tier=0}:{tier?:number}){
 const [loaded,setLoaded]=useState(false),[angle,setAngle]=useState(0);const ready=useCallback(()=>setLoaded(true),[]);const {theme}=useTheme();const dark=theme==='dark';
 const ground=dark?'#191b1c':'#f4f6f9',grid=dark?'#303b40':'#dbe3ec',platform=dark?'#26292e':'#e4ebf1';
 return <><div className="car-stage actual-car" data-model-ready={loaded} data-view-angle={angle} aria-label={`Model Quaternius ${carModels[tier]}`}>
  <SceneBoundary><Canvas frameloop="demand" shadows dpr={[1,1.5]} camera={{position:[6,3.2,7],fov:36}} gl={{antialias:true}} onCreated={({camera})=>camera.lookAt(0,.5,0)} fallback={<div className="scene-fallback">WebGL tidak tersedia di browser ini.</div>}>
  <color attach="background" args={[ground]}/><ambientLight intensity={dark?1.6:1.7}/><directionalLight position={[5,8,5]} intensity={dark?3:3.5} castShadow shadow-mapSize={[1024,1024]}/><directionalLight position={[-5,3,-4]} intensity={dark?2:1} color={dark?'#15eae2':'#ffffff'}/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.12,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color={ground} roughness={1}/></mesh><gridHelper args={[40,40,grid,grid]} position={[0,-.115,0]}/>
  <mesh position={[0,-.06,0]} receiveShadow><cylinderGeometry args={[3.5,3.5,.1,64]}/><meshStandardMaterial color={platform} roughness={.85}/></mesh>
  <group rotation={[0,angle,0]}><Suspense fallback={null}><VehicleModel model={carModels[tier]} onReady={ready}/></Suspense></group>
  </Canvas></SceneBoundary><span className="stage-label">{loaded?'ROTATE / EXPLORE':'MEMUAT MODEL MOBIL…'}</span>
 </div><div className="showroom-controls" aria-label="Sudut pandang mobil"><button type="button" aria-label="Putar mobil ke kiri" onClick={()=>setAngle(a=>a-Math.PI/4)}><Icon name="left"/></button><button type="button" onClick={()=>setAngle(0)} aria-label="Reset sudut mobil"><Icon name="reset"/><span>Reset view</span></button><button type="button" aria-label="Putar mobil ke kanan" onClick={()=>setAngle(a=>a+Math.PI/4)}><Icon name="chevron"/></button></div></>;
}
