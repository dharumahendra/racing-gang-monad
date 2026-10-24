import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { PlaneGeometry, Mesh, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { LocalRunner } from '../lib/runner';
import { LAND_LENGTH, LAND_WIDTH, landscapeHeight, landscapeTileZ } from '../lib/landscape-layout';
import { Optional } from './SceneEnvironment';
function TerrainMaterial(){
 const cached=useLoader(TextureLoader,['diff','normal','roughness'].map(k=>'/assets/landscape/terrain_'+k+'.webp')) as Texture[];
 const maps=useMemo(()=>cached.map((t,i)=>{
  const map=t.clone();map.wrapS=map.wrapT=RepeatWrapping;map.repeat.set(LAND_WIDTH/90,LAND_LENGTH/90);map.anisotropy=4;
  if(i===0)map.colorSpace=SRGBColorSpace;map.needsUpdate=true;return map;
 }),[cached]);
 useEffect(()=>()=>maps.forEach(t=>t.dispose()),[maps]);
 return <meshStandardMaterial map={maps[0]} normalMap={maps[1]} roughnessMap={maps[2]} roughness={1}/>;
}
export function Landscape({runner}:{runner:LocalRunner}){
 const tiles=useRef<(Mesh|null)[]>([]);
 const geometry=useMemo(()=>{
  const g=new PlaneGeometry(LAND_WIDTH,LAND_LENGTH,64,48);g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,landscapeHeight(p.getX(i),p.getZ(i)));
  g.computeVertexNormals();return g;
 },[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useFrame(()=>{
  const travel=(runner.previous.player.z+(runner.current.player.z-runner.previous.player.z)*runner.alpha)/100;
  tiles.current.forEach((mesh,i)=>{if(mesh)mesh.position.z=landscapeTileZ(i,travel);});
 },-5);
 return <group>{[0,1].map(i=><mesh key={i} ref={mesh=>{tiles.current[i]=mesh;}} geometry={geometry} position={[0,0,landscapeTileZ(i,0)]} receiveShadow>
  <Optional fallback={<meshStandardMaterial color="#657157" roughness={1}/>}>
   <Suspense fallback={<meshStandardMaterial color="#657157" roughness={1}/>}><TerrainMaterial/></Suspense>
  </Optional>
 </mesh>)}</group>;
}
