import { landscapeHeight, landscapeTileZ } from '../lib/landscape-layout';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { InstancedMesh, Mesh, Object3D, type BufferGeometry, type Material } from 'three';
import type { LocalRunner } from '../lib/runner';
import { withMeshopt } from './VehicleModel';
const specs=[{name:'tree_small_02',count:16},{name:'rock_moss_set_02',count:16}] as const;
type Part={geometry:BufferGeometry;material:Material|Material[];type:number;count:number};
/** Part memakai material PBR asli; geometry salinan dibake sekali, GLTF cache tidak dimutasi. */
export function Roadside({runner}:{runner:LocalRunner}){
 const assets=useLoader(GLTFLoader,specs.map(s=>'/assets/landscape/'+s.name+'.glb'),withMeshopt);
 const parts=useMemo(()=>{
  const out:Part[]=[];
  assets.forEach((asset,type)=>{
   asset.scene.updateWorldMatrix(true,true);
   asset.scene.traverse(node=>{if(node instanceof Mesh)out.push({geometry:node.geometry.clone().applyMatrix4(node.matrixWorld),material:node.material,type,count:specs[type].count});});
  });return out;
 },[assets]);
 useEffect(()=>()=>parts.forEach(p=>p.geometry.dispose()),[parts]);
 const meshes=useRef<(InstancedMesh|null)[]>([]);const dummy=useMemo(()=>new Object3D(),[]);
 useFrame(()=>{
  const travel=(runner.previous.player.z+(runner.current.player.z-runner.previous.player.z)*runner.alpha)/100;
  parts.forEach((part,p)=>{
   const mesh=meshes.current[p];if(!mesh)return;
   for(let i=0;i<part.count;i++){
    const side=i%2?1:-1;
    const distance=part.type===0?18+(i%4)*4:16.5+(i%3)*2.3;
    const spacing=part.type===0?29:27;
    const z=28-((i*spacing-travel)%280+280)%280;
    dummy.position.set(side*distance,landscapeHeight(side*distance,z-landscapeTileZ(0,travel)),z);
    dummy.rotation.set(0,i*1.37,0);dummy.scale.setScalar(part.type===0?.85+(i%4)*.12:.65+(i%4)*.15);
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   }mesh.instanceMatrix.needsUpdate=true;
  });
 },-5);
 return <>{parts.map((p,i)=><instancedMesh key={i} ref={mesh=>{meshes.current[i]=mesh;}} args={[p.geometry,p.material,p.count]} frustumCulled={false} receiveShadow dispose={null}/>)}</>;
}
