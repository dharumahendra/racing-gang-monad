import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Group, Object3D, InstancedMesh, Vector3, MeshBasicMaterial } from 'three';
import { LANES, LANE_WIDTH, laneCenter, SPIKES, TICK_RATE } from '@racing-gang/config';
import type { LocalRunner } from '../lib/runner';
import { VehicleModel, carModels } from './VehicleModel';
import { SceneBoundary } from './CarPreview';
import { laneWarnings } from '../lib/hud';
import { TrafficLayer } from './TrafficLayer';
import { Roadside } from './Roadside';
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const lateral=(x:number)=>x/100-(LANES*LANE_WIDTH/200);
function Road({runner}:{runner:LocalRunner}) {
  const marks=useRef<InstancedMesh>(null);
  const dummy=useMemo(()=>new Object3D(),[]);
  const width=LANES*LANE_WIDTH/100;
  const boundaries=useMemo(()=>Array.from({length:LANES-1},(_,i)=>(i+1)*LANE_WIDTH/100-width/2),[width]);
  useLayoutEffect(()=>{if(!marks.current)return;let i=0;for(const x of boundaries)for(let n=0;n<38;n++){dummy.position.set(x,.012,18-n*6);dummy.updateMatrix();marks.current.setMatrixAt(i++,dummy.matrix);}marks.current.instanceMatrix.needsUpdate=true;},[boundaries,dummy]);
  useFrame(()=>{
    const travel=mix(runner.previous.player.z,runner.current.player.z,runner.alpha)/100;
    if(marks.current)marks.current.position.z=travel%6;
  },-5);
  return <>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.06,-90]} receiveShadow><planeGeometry args={[400,500]}/><meshStandardMaterial color="#7b956c" roughness={1}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.01,-90]} receiveShadow><planeGeometry args={[width,260]}/><meshStandardMaterial color="#485463" roughness={1}/></mesh>
    {[-width/2,width/2].map(x=><group key={x}><mesh position={[x,-.06,-90]}><boxGeometry args={[.32,.2,260]}/><meshStandardMaterial color="#e5d4af"/></mesh><mesh position={[x*.985,.01,-90]}><boxGeometry args={[.08,.015,260]}/><meshBasicMaterial color="#f6df9e"/></mesh></group>)}
    <instancedMesh ref={marks} args={[undefined,undefined,boundaries.length*38]} frustumCulled={false}><boxGeometry args={[.09,.015,2.5]}/><meshBasicMaterial color="#e3e6d9"/></instancedMesh>
    <Roadside runner={runner}/>
  </>;
}
function LaneCue({lane,kind,runner,reducedMotion}:{lane:number;kind:string;runner:LocalRunner;reducedMotion:boolean}){
  const material=useRef<MeshBasicMaterial>(null);
  useFrame(()=>{if(material.current)material.current.opacity=reducedMotion ? .18 : Math.floor(runner.current.tick/(TICK_RATE/2))%2 ? .22 : .06;});
  return <mesh rotation={[-Math.PI/2,0,0]} position={[lateral(laneCenter(lane)),.019,-35]}><planeGeometry args={[LANE_WIDTH/100,110]}/><meshBasicMaterial ref={material} color={kind==='RED'?'#cf6b49':'#e8b44f'} transparent opacity={.18} depthWrite={false}/></mesh>;
}
function World({runner,onReady,reducedMotion}:{runner:LocalRunner;onReady:()=>void;reducedMotion:boolean}) {
  useLoader(GLTFLoader,`/assets/quaternius/${carModels[runner.sim.carTier]}.glb`);
  useEffect(()=>onReady(),[onReady]);
  const player=useRef<Group>(null);const cameraTarget=useMemo(()=>new Vector3(),[]);
  useFrame(({camera},delta)=>{runner.advance(delta*1000);const x=lateral(mix(runner.previous.player.x,runner.current.player.x,runner.alpha));if(player.current)player.current.position.x=x;camera.position.set(x*.45,4.3,9.5);cameraTarget.set(x*.3,.7,-17);camera.lookAt(cameraTarget);},-10);
  return <><color attach="background" args={['#b9d8e9']}/><fog attach="fog" args={['#b9d8e9',65,180]}/><ambientLight intensity={1.7}/><directionalLight position={[12,20,12]} intensity={2.4} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={25} shadow-camera-bottom={-15}/><Road runner={runner}/><group ref={player}><VehicleModel model={carModels[runner.sim.carTier]}/></group><TrafficLayer runner={runner}/>
    {laneWarnings(runner.current).map(w=><LaneCue key={w.lane} lane={w.lane} kind={w.kind} runner={runner} reducedMotion={reducedMotion}/>)}
    {runner.current.redLanes.filter(red=>red.active).map(red=><mesh key={`${red.lane}:${red.activeTick}`} rotation={[-Math.PI/2,0,0]} position={[lateral(laneCenter(red.lane)),.02,-35]}><planeGeometry args={[LANE_WIDTH/100,110]}/><meshBasicMaterial color="#c34643" transparent opacity={.68}/></mesh>)}
    {runner.current.spikes.map(s=><mesh key={s.id} position={[lateral(laneCenter(s.lane)),.09,-(s.z-runner.current.player.z)/100]}><boxGeometry args={[SPIKES.w/100,.18,SPIKES.l/100]}/><meshStandardMaterial color={s.hit?'#475361':'#b0b7ba'} metalness={.55} roughness={.4}/></mesh>)}
  </>;
}
export function RaceScene({runner,revision,onReady,diagnostics}:{runner:LocalRunner;revision:number;onReady:()=>void;diagnostics?:ReactNode}) {
  const [reducedMotion,setReducedMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>setReducedMotion(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);
  return <div className="race-canvas" data-scene-revision={revision} data-reduced-motion={reducedMotion}><SceneBoundary><Canvas shadows dpr={[1,1.4]} camera={{position:[0,4.3,9.5],fov:58}} gl={{antialias:true}} fallback={<div className="scene-fallback">Browser ini belum mendukung WebGL.</div>}><Suspense fallback={null}><World runner={runner} onReady={onReady} reducedMotion={reducedMotion}/>{diagnostics}</Suspense></Canvas></SceneBoundary></div>;
}


