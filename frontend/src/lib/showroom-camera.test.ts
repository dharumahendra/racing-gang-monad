import {describe,it,expect} from 'vitest';
import {Box3,PerspectiveCamera,Vector3} from 'three';
import {backdropHorizon,photoMatchedFrame,showroomFrame} from './showroom-camera';

describe('showroom framing',()=>{
 it('keeps a rotated car fully visible at phone, tablet and desktop aspect ratios',()=>{
  for(const aspect of [.95,1.4,2.5,3.5])for(const size of [[2,1.4,4.4],[2.4,2.2,4.8],[2.2,1,5]]){
   const bounds=new Box3(new Vector3(-size[0]/2,0,-size[2]/2),new Vector3(size[0]/2,size[1],size[2]/2));
   const frame=showroomFrame(bounds,aspect,36),camera=new PerspectiveCamera(36,aspect,.05,200);
   camera.position.copy(frame.position);camera.lookAt(frame.target);camera.updateMatrixWorld();
   for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/12)for(const x of [-size[0]/2,size[0]/2])for(const y of [0,size[1]])for(const z of [-size[2]/2,size[2]/2]){
    const point=new Vector3(x,y,z).applyAxisAngle(new Vector3(0,1,0),yaw).project(camera);
    expect(Math.abs(point.x)).toBeLessThan(.92);expect(Math.abs(point.y)).toBeLessThan(.92);
    expect(point.z).toBeGreaterThan(-1);expect(point.z).toBeLessThan(1);
   }
  }
 });
 it('frames offset models around their actual centre',()=>{
  const bounds=new Box3(new Vector3(2,1,-6),new Vector3(4,3,-2)),frame=showroomFrame(bounds,1.5,36);
  expect(frame.target.toArray()).toEqual([3,2,-4]);
  expect(frame.position.distanceTo(frame.target)).toBeCloseTo(frame.distance);
 });
});

describe('photo-matched framing',()=>{
 it('puts the horizon where the photo horizon is and keeps the car on the floor inside the canvas',()=>{
  for(const aspect of [1.2,2,3.2])for(const horizon of [.4,.55,.7]){
   const bounds=new Box3(new Vector3(-.95,0,-2.25),new Vector3(.95,1.2,2.25));
   const f=photoMatchedFrame(bounds,aspect,30,horizon),camera=new PerspectiveCamera(30,aspect,.05,500);
   camera.position.copy(f.position);camera.lookAt(f.target);camera.updateMatrixWorld();
   const far=new Vector3(0,f.position.y,f.position.z+5000).project(camera); // titik di horizon
   expect((far.y+1)/2).toBeCloseTo(horizon,2);
   for(const x of [-.95,.95])for(const y of [0,1.2])for(const z of [-2.25,2.25]){
    const p=new Vector3(x,y,z).project(camera);expect(Math.abs(p.x)).toBeLessThan(.95);expect(Math.abs(p.y)).toBeLessThan(.9);
   }
   expect(f.position.y).toBeCloseTo(1.15);
  }
 });
 it('maps a bottom-anchored cover photo horizon into canvas coordinates',()=>{
  // 1000x500 container, photo 2000x500 (wider): scale=1, horizon 60% from top = y 300; canvas covers y 100..500.
  expect(backdropHorizon({width:1000,height:500,top:0},{height:400,top:100},{width:2000,height:500,horizon:.6})).toBeCloseTo(.5);
  // Taller container than photo aspect: photo scaled by height ratio; still bottom-anchored.
  expect(backdropHorizon({width:1000,height:1000,top:0},{height:1000,top:0},{width:2000,height:500,horizon:.5})).toBeCloseTo(.5);
 });
});
