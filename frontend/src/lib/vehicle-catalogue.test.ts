import { expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { CARS, PLAYER_L } from '@racing-gang/config';
import * as vehicles from '../components/VehicleModel';

it('uses Satuan P Balap as the free Starter while retaining the four paid tier models',()=>{
 expect(vehicles.modelUrl(vehicles.carModels[0])).toBe('/collectibles/models/sppg-truck.glb');
 expect(vehicles.modelLabel(vehicles.carModels[0])).toBe('Satuan P Balap — Bangun');
 expect(vehicles.carModels.slice(1)).toEqual(['UF001','UF033','UF037','CarConcept']);
 expect(CARS[0]).toMatchObject({tier:0,coinCost:0,priceMon:'0',reqNearMiss:0});
});
it('fits the +Z truck to the shared vehicle length facing -Z without mutating the cached source',()=>{
 const source=new Group();const body=new Mesh(new BoxGeometry(2,3,5),new MeshStandardMaterial());body.position.set(0,1.5,.6);source.add(body);
 const marker=new Group();marker.name='front-marker';marker.position.z=3.1;source.add(marker);
 const before=new Box3().setFromObject(source,true);
 const prepared=vehicles.prepareVehicleModel(source,'BangunBalap');
 const bounds=new Box3().setFromObject(prepared,true),size=bounds.getSize(new Vector3());
 expect(size.z).toBeCloseTo(PLAYER_L/100,6);expect(bounds.min.y).toBeCloseTo(0,6);
 expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0,6);
 expect(prepared.getObjectByName('front-marker')!.getWorldPosition(new Vector3()).z).toBeLessThan(0);
 expect(vehicles.localBounds(prepared).getSize(new Vector3()).z).toBeCloseTo(PLAYER_L/100,6);
 expect(new Box3().setFromObject(source,true)).toEqual(before);expect(prepared).not.toBe(source);
});
