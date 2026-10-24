import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export const carModels = ['NormalCar1', 'NormalCar2', 'SUV', 'SportsCar', 'SportsCar2'] as const;
export function VehicleModel({ model = 'NormalCar1', onReady }: { model?: string; onReady?: () => void }) {
  const gltf = useLoader(GLTFLoader, `/assets/quaternius/${model}.glb`);
  const object = useMemo(() => { const clone=gltf.scene.clone(true);clone.traverse(node=>{node.castShadow=true;node.receiveShadow=true;});return clone;},[gltf]);
  useEffect(()=>{onReady?.();},[object,onReady]);
  return <primitive object={object} dispose={null}/>;
}
