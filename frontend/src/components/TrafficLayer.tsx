import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TRAFFIC } from '@racing-gang/config';
import type { LocalRunner } from '../lib/runner';
import { bakeVertexGeometry, trafficPoses, type TrafficPose } from '../lib/scene-geometry';
type Model=TrafficPose['model'];
const models:Model[]=['NormalCar2','Taxi','Cop','Truck'];
// Two vehicles per row; the shared generator never uses a gap below gapEnd.
const capacity=Math.max(64,Math.ceil((TRAFFIC.spawnAhead+TRAFFIC.despawnBehind+1000)/Math.min(TRAFFIC.gapStart,TRAFFIC.gapEnd))*2+8);
function truckGeometry(){const root=new Group();const body=new Mesh(new BoxGeometry(2.5,3,7.5),new MeshStandardMaterial({color:'#d5c49f'}));body.position.set(0,1.5,1);root.add(body);const cab=new Mesh(new BoxGeometry(2.5,1.8,2.5),new MeshStandardMaterial({color:'#526a84'}));cab.position.set(0,.9,-3.7);root.add(cab);for(const x of [-1.15,1.15])for(const z of [-3,3]){const tire=new Mesh(new CylinderGeometry(.45,.45,.3,8),new MeshStandardMaterial({color:'#26313e'}));tire.rotation.z=Math.PI/2;tire.position.set(x,.45,z);root.add(tire);}const baked=bakeVertexGeometry(root);root.traverse(node=>{if(node instanceof Mesh){node.geometry.dispose();(node.material as MeshStandardMaterial).dispose();}});return baked;}
export function TrafficLayer({runner}:{runner:LocalRunner}){
  const cars=useLoader(GLTFLoader,['NormalCar2','Taxi','Cop'].map(name=>`/assets/quaternius/${name}.glb`));
  const resources=useMemo(()=>({NormalCar2:bakeVertexGeometry(cars[0].scene),Taxi:bakeVertexGeometry(cars[1].scene),Cop:bakeVertexGeometry(cars[2].scene),Truck:truckGeometry()}),[cars]);
  const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.82,metalness:.03}),[]);
  const meshes=useRef<Partial<Record<Model,InstancedMesh>>>({});const dummy=useMemo(()=>new Object3D(),[]);
  useEffect(()=>()=>{Object.values(resources).forEach(geometry=>geometry.dispose());material.dispose();},[resources,material]);
  useFrame(()=>{const counts:Record<Model,number>={NormalCar2:0,Taxi:0,Cop:0,Truck:0};for(const pose of trafficPoses(runner.current,runner.previous,runner.alpha)){const mesh=meshes.current[pose.model];if(!mesh)continue;const index=counts[pose.model]++;if(index>=capacity)throw new Error('Traffic exceeds shared generator render capacity.');dummy.position.set(pose.x,0,pose.z);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}for(const model of models){const mesh=meshes.current[model];if(mesh){mesh.count=counts[model];mesh.instanceMatrix.needsUpdate=true;}}},-5);
  return <>{models.map(model=><instancedMesh key={model} name={`traffic-${model}`} ref={mesh=>{if(mesh)meshes.current[model]=mesh;else delete meshes.current[model];}} args={[resources[model],material,capacity]} castShadow receiveShadow frustumCulled={false}/>)}</>;
}
