import { PLAYER_L } from '@racing-gang/config';
import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Box3, Group, Matrix4, Mesh, MeshPhysicalMaterial, Vector3, type Material, type Object3D } from 'three';
/**
 * Bounding box presisi (per vertex) dalam ruang lokal model, tidak terpengaruh rotasi/skala parent.
 * Per vertex karena bounding box accessor roda terkuantisasi meshopt terlalu longgar untuk framing kamera.
 */
export function localBounds(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert(), m = new Matrix4(), v = new Vector3(), box = new Box3();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    m.multiplyMatrices(inverse, node.matrixWorld);
    const p = node.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m));
  });
  return box;
}
/** Model visual per tier (indeks = tier). Statistik/hitbox tetap dari packages/config. */
export const carModels = ['BangunBalap', 'UF001', 'UF033', 'UF037', 'CarConcept'] as const;
const sources: Record<string, { url: string; label: string }> = {
  BangunBalap: { url: '/collectibles/models/sppg-truck.glb', label: 'Satuan P Balap — Bangun' },
  CarConcept: { url: '/assets/carconcept/CarConcept.glb', label: 'Khronos Car Concept' },
  UF002: { url: '/assets/unityfan/UF002.glb', label: 'Unity Fan Concept Car 002' },
  UF001: { url: '/assets/unityfan/UF001.glb', label: 'Unity Fan Concept Car 001' },
  UF033: { url: '/assets/unityfan/UF033.glb', label: 'Unity Fan Concept Car 033' },
  UF037: { url: '/assets/unityfan/UF037.glb', label: 'Unity Fan Concept Car 037' },
};
export const modelUrl = (model: string) => sources[model]?.url ?? `/assets/quaternius/${model}.glb`;
export const modelLabel = (model: string) => sources[model]?.label ?? `Quaternius ${model}`;
/** GLB terkompresi EXT_meshopt_compression butuh decoder; aman juga untuk GLB Quaternius biasa. */
export const withMeshopt = (loader: GLTFLoader) => { loader.setMeshoptDecoder(MeshoptDecoder); };
/** Clone the cached asset; the bespoke truck is authored facing +Z and gameplay uses -Z. */
export function prepareVehicleModel(source:Object3D,model:string):Object3D {
  const clone=source.clone(true);
  if(model==='BangunBalap'){
    const length=localBounds(clone).getSize(new Vector3()).z;
    if(!Number.isFinite(length)||length<=0)throw new Error('Starter model has no valid length.');
    clone.rotation.y+=Math.PI;clone.scale.multiplyScalar(PLAYER_L/100/length);
    const box=new Box3().setFromObject(clone,true),center=box.getCenter(new Vector3());
    clone.position.sub(new Vector3(center.x,box.min.y,center.z));
    const normalized=new Group();normalized.name='Bangun Balap Starter';normalized.add(clone);return normalized;
  }
  return clone;
}
export function VehicleModel({ model = 'NormalCar1', onReady, quality = 'showroom' }: { model?: string; onReady?: (bounds:Box3) => void; quality?: 'showroom' | 'race' }) {
  const gltf = useLoader(GLTFLoader, modelUrl(model), withMeshopt);
  const object = useMemo(() => {
    const clone=prepareVehicleModel(gltf.scene,model);const lite=new Map<Material,Material>();
    clone.traverse(node=>{node.castShadow=true;node.receiveShadow=true;
      // Kaca KHR_materials_transmission memicu render pass tambahan seluruh scene; di run diganti transparansi biasa.
      if(quality==='race'&&node instanceof Mesh){const swap=(m:Material)=>{if(!(m instanceof MeshPhysicalMaterial)||m.transmission<=0)return m;let next=lite.get(m);if(!next){const glass=m.clone();glass.transmission=0;glass.transparent=true;glass.opacity=.45;glass.depthWrite=false;next=glass;lite.set(m,next);}return next;};node.material=Array.isArray(node.material)?node.material.map(swap):swap(node.material);if((Array.isArray(node.material)?node.material:[node.material]).some(m=>m.transparent))node.castShadow=false;}
    });return clone;},[gltf,quality,model]);
  // precise=true: bounding box accessor roda terkuantisasi (meshopt) terlalu longgar untuk framing kamera.
  useEffect(()=>{onReady?.(localBounds(object));},[object,onReady]);
  return <primitive object={object} dispose={null}/>;
}
