import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { CARS } from '@racing-gang/config';
import { collectibles, buildCollectibleMetadata } from './collection';
import { createSppgTruck, createBurgerCar } from './models';

describe('independent NFT collectibles', () => {
  it('keeps four unique collectible IDs outside the gameplay tier catalogue', () => {
    expect(collectibles.map(c => c.id)).toEqual([1,2,3,4]);
    expect(new Set(collectibles.map(c => c.slug)).size).toBe(4);
    expect(CARS.map(c => c.tier)).toEqual([0,1,2,3,4]);
    expect(collectibles.every(c => !('tier' in c))).toBe(true);
    expect(collectibles.every(c => c.preview.kind==='local')).toBe(true);
  });
  it('uses final HTTPS model URLs for all four bundled collectibles', () => {
    const base='https://example.test/collectibles/';
    const local=buildCollectibleMetadata(collectibles[1],base);
    expect(local.image).toBe(base+'images/sppg-truck.png');
    expect(local.animation_url).toBe(base+'models/sppg-truck.glb');
    for(const item of collectibles){const metadata=buildCollectibleMetadata(item,base);expect(metadata.animation_url).toBe(base+'models/'+item.slug+'.glb');}
    const imported=buildCollectibleMetadata(collectibles[0],base);
    expect(imported.external_url).toContain('sketchfab.com/');
    expect(imported.properties.credits).toContain('Vlad94077');
    expect(imported.attributes).toContainEqual({trait_type:'Artwork',value:'Sketchfab source'});
  });
  it('rejects non-public metadata origins rather than publishing localhost or placeholder URLs', () => {
    for (const base of ['http://example.test/collectibles/','https://localhost/','https://127.0.0.1/','https://example.test/collectibles/?token=secret']) {
      expect(() => buildCollectibleMetadata(collectibles[0],base)).toThrow();
    }
  });
  it.each([['SPPG',createSppgTruck],['Burger',createBurgerCar]] as const)('%s produces finite, nonempty portable mesh geometry', (_name,create) => {
    const model=create();
    const box=new Box3().setFromObject(model);
    expect(box.isEmpty()).toBe(false);
    expect([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)).toBe(true);
    let vertices=0;
    const invalidVertices:string[]=[];
    model.traverse(node=>{if(node instanceof Mesh){const p=node.geometry.getAttribute('position');vertices+=p.count;for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i))||!Number.isFinite(p.getY(i))||!Number.isFinite(p.getZ(i)))invalidVertices.push(`${node.name}:${i}`);}});
    expect(invalidVertices).toEqual([]);
    expect(vertices).toBeGreaterThan(100);
    expect(box.max.y-box.min.y).toBeGreaterThan(1);
    model.traverse(node=>{if(node instanceof Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});
  });
});

// Front-facing trim must sit outside the body shell, rather than disappear inside it.
it.each(['front windshield','headlamp'])('SPPG %s remains visible in front of the cab body',name=>{
 const model=createSppgTruck();model.updateMatrixWorld(true);
 const parts=model.getObjectsByProperty('name',name);
 expect(parts.length).toBeGreaterThan(0);
 for(const part of parts){
  const center=new Box3().setFromObject(part).getCenter(new Vector3());
  const ray=new Raycaster(center.clone().add(new Vector3(0,0,3)),new Vector3(0,0,-1));
  expect(ray.intersectObject(model,true)[0]?.object.name).toBe(name);
 }
});
