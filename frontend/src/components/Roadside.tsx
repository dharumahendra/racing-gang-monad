import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import type { LocalRunner } from '../lib/runner';
import { bakeVertexGeometry } from '../lib/scene-geometry';
const specs=[{name:'PineTree_1',count:28},{name:'Rock_1',count:18},{name:'Streetlight_Single',count:8}] as const;
export function Roadside({runner}:{runner:LocalRunner}){
  const assets=useLoader(GLTFLoader,specs.map(s=>`/assets/quaternius-scenery/${s.name}.glb`));const geometries=useMemo(()=>assets.map(a=>bakeVertexGeometry(a.scene)),[assets]);const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}),[]);const meshes=useRef<(InstancedMesh|null)[]>([]);const dummy=useMemo(()=>new Object3D(),[]);
  useEffect(()=>()=>{geometries.forEach(g=>g.dispose());material.dispose();},[geometries,material]);
  useFrame(()=>{const travel=(runner.previous.player.z+(runner.current.player.z-runner.previous.player.z)*runner.alpha)/100;for(let type=0;type<specs.length;type++){const mesh=meshes.current[type];if(!mesh)continue;for(let i=0;i<specs[type].count;i++){const side=i%2?1:-1;const spacing=type===0?7:type===1?11:26;const distance=type===0?12+(i%4)*2:type===1?9.8+(i%3)*1.3:8.5;dummy.position.set(side*distance,-.06,20-((i*spacing-travel)%196+196)%196);dummy.rotation.set(0,type===2?(side>0?Math.PI:0):i*1.37,0);dummy.scale.setScalar(type===2?1:.8+(i%4)*.1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;}},-5);
  return <>{specs.map((s,i)=><instancedMesh key={s.name} ref={mesh=>{meshes.current[i]=mesh;}} args={[geometries[i],material,s.count]} frustumCulled={false}/>)}</>;
}
