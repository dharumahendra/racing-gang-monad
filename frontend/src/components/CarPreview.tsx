import { Component, Suspense, useCallback, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { VehicleModel, carModels } from './VehicleModel';
export class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="scene-fallback" role="alert">Model 3D belum bisa dimuat. Muat ulang halaman atau gunakan browser dengan WebGL.</div>:this.props.children;}
}
export function CarPreview({tier=0}:{tier?:number}) {
  const [loaded,setLoaded]=useState(false);const ready=useCallback(()=>setLoaded(true),[]);
  return <div className="car-stage actual-car" data-model-ready={loaded} aria-label={`Model Quaternius ${carModels[tier]}`}>
    <SceneBoundary><Canvas frameloop="demand" shadows dpr={[1,1.5]} camera={{position:[5.5,3.2,6],fov:36}} gl={{antialias:true}} onCreated={({camera})=>camera.lookAt(0,.6,0)} fallback={<div className="scene-fallback">WebGL tidak tersedia di browser ini.</div>}>
      <color attach="background" args={['#b9d5e5']}/><ambientLight intensity={1.5}/><directionalLight position={[5,8,5]} intensity={3} castShadow shadow-mapSize={[1024,1024]}/>
      <Suspense fallback={null}><VehicleModel key={tier} model={carModels[tier]} onReady={ready}/></Suspense>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.025,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#a1b9bd" roughness={1}/></mesh>
      {[-1.6,1.6].map(x=><mesh key={x} rotation={[-Math.PI/2,0,0]} position={[x,-.02,0]}><planeGeometry args={[.05,6]}/><meshBasicMaterial color="#f5ecd8"/></mesh>)}
    </Canvas></SceneBoundary><span className="stage-label">{loaded?'QUATERNIUS / MODEL ASLI · CC0':'MEMUAT MODEL MOBIL…'}</span>
  </div>;
}
