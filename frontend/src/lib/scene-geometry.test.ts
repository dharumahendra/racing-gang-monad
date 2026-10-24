import { expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { bakeVertexGeometry, trafficPoses } from './scene-geometry';
import { LocalRunner } from './runner';
it('bakes source transforms and material colors into one geometry without mutating source vertices',()=>{
  const geometry=new BoxGeometry(2,2,2);const before=Array.from(geometry.attributes.position.array);const scene=new Group();const mesh=new Mesh(geometry,new MeshStandardMaterial({color:'#ff0000'}));mesh.position.set(4,2,-3);scene.add(mesh);const baked=bakeVertexGeometry(scene);expect(baked.groups).toHaveLength(0);expect(baked.boundingBox?.min.toArray()).toEqual([3,1,-4]);expect(baked.boundingBox?.max.toArray()).toEqual([5,3,-2]);expect(Array.from(geometry.attributes.position.array)).toEqual(before);expect(baked.attributes.color.getX(0)).toBe(1);expect(baked.attributes.color.getY(0)).toBe(0);baked.dispose();geometry.dispose();
});
it('preserves grouped material colors and indexed triangle topology',()=>{
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setIndex([0,1,2,0,2,3]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);const root=new Group();root.add(new Mesh(geometry,[new MeshStandardMaterial({color:'#ff0000'}),new MeshStandardMaterial({color:'#00ff00'})]));const baked=bakeVertexGeometry(root);expect(baked.attributes.position.count).toBe(6);expect(baked.attributes.color.getX(0)).toBe(1);expect(baked.attributes.color.getY(3)).toBe(1);expect(geometry.index?.count).toBe(6);baked.dispose();geometry.dispose();
});
it('keeps mirrored faces front-facing and ignores hidden decorations',()=>{
  const geometry=new BoxGeometry(2,2,2),root=new Group();const mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.scale.x=-1;root.add(mesh);const hidden=mesh.clone();hidden.visible=false;root.add(hidden);const baked=bakeVertexGeometry(root);expect(baked.attributes.position.count).toBe(36);const p=baked.attributes.position,n=baked.attributes.normal;const a=new Vector3().fromBufferAttribute(p,0),b=new Vector3().fromBufferAttribute(p,1),c=new Vector3().fromBufferAttribute(p,2);expect(b.sub(a).cross(c.sub(a)).dot(new Vector3().fromBufferAttribute(n,0))).toBeGreaterThan(0);baked.dispose();geometry.dispose();
});
it('refuses textured or transparent materials instead of silently destroying their appearance',()=>{
  const geometry=new BoxGeometry();for(const material of [new MeshStandardMaterial({map:new Texture()}),new MeshStandardMaterial({transparent:true,opacity:.5})]){const root=new Group();root.add(new Mesh(geometry,material));expect(()=>bakeVertexGeometry(root)).toThrow();}geometry.dispose();
});
it('also refuses a normal map when the base color itself has no texture',()=>{const root=new Group();const geometry=new BoxGeometry();root.add(new Mesh(geometry,new MeshStandardMaterial({normalMap:new Texture()})));expect(()=>bakeVertexGeometry(root)).toThrow();geometry.dispose();});
it('interpolates traffic by stable ID, preserves positions/hitboxes and culls only outside the view envelope',()=>{
  const runner=new LocalRunner({runId:`0x${'11'.repeat(32)}`,seed:`0x${'22'.repeat(32)}`,carTier:0});const previous={...runner.current,player:{...runner.current.player,z:1000},vehicles:[{id:1,type:0 as const,lane:2,x:875,z:5000,w:180,l:450}]};const current={...previous,player:{...previous.player,z:1200},vehicles:[{...previous.vehicles[0],z:5200},{...previous.vehicles[0],id:2,type:1 as const,z:20000,l:1000},{...previous.vehicles[0],id:3,z:90000}]};const before=JSON.stringify({previous,current});const poses=trafficPoses(current,previous,.5);expect(poses).toHaveLength(2);expect(poses[0]).toMatchObject({id:1,model:'Taxi',x:1.75,z:-40});expect(poses[1].model).toBe('Truck');expect(JSON.stringify({previous,current})).toBe(before);
});
