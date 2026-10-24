import {Box3,MathUtils,Vector3} from 'three';

// Fit a rotation-safe envelope instead of guessing a camera distance per model.
export function showroomFrame(bounds:Box3,aspect:number,fov:number){
 const target=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3());
 const radius=Math.max(Math.hypot(size.x,size.z)/2,.1),halfHeight=size.y/2;
 // Front 3/4 hero camera angle matching Karoly Molnar reference
 const direction=new Vector3(0.42,.16,-1).normalize();
 const right=new Vector3().crossVectors(new Vector3(0,1,0),direction).normalize();
 const up=new Vector3().crossVectors(direction,right);
 const tanY=Math.tan(MathUtils.degToRad(fov/2)),tanX=tanY*Math.max(aspect,.1);
 let distance=0;
 for(let i=0;i<64;i++)for(const y of [-halfHeight,halfHeight]){
  const point=new Vector3(Math.cos(i*Math.PI/32)*radius,y,Math.sin(i*Math.PI/32)*radius);
  const depth=point.dot(direction);
  distance=Math.max(distance,depth+Math.abs(point.dot(right))/(tanX*.9),depth+Math.abs(point.dot(up))/(tanY*.9));
 }
 return {target,position:target.clone().addScaledVector(direction,distance),distance};
}

/**
 * Kamera yang perspektifnya cocok dengan foto latar showroom: tinggi mata tetap, pandangan lurus ke dinding
 * belakang (+Z), dan horizon jatuh tepat di garis horizon foto. `horizon` = posisi horizon foto di kanvas,
 * pecahan dari bawah (0..1). Mobil diletakkan di lantai (y=0) dengan lebar layar ± `widthFraction`.
 */
export function photoMatchedFrame(bounds:Box3,aspect:number,fov:number,horizon:number,{eyeHeight=1.15,widthFraction=.46}={}){
 const center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3());
 const tanY=Math.tan(MathUtils.degToRad(fov/2)),tanX=tanY*Math.max(aspect,.1);
 const s=MathUtils.clamp(horizon,.08,.92);
 const pitch=Math.atan((2*s-1)*tanY); // >0 = menunduk; horizon di atas tengah kanvas
 const radius=Math.max(Math.hypot(size.x,size.z)/2,.1);
 let distance=radius/(widthFraction*tanX);
 // Titik terdekat mobil di lantai dan atap tidak boleh keluar kanvas.
 for(let i=0;i<40;i++){
  const near=Math.max(distance-radius,.5);
  const floorNdc=Math.tan(pitch-Math.atan(eyeHeight/near))/tanY;
  const roofNdc=Math.tan(pitch+Math.atan((size.y-eyeHeight)/near))/tanY;
  if(floorNdc>-.86&&roofNdc<.86)break;
  distance*=1.06;
 }
 const position=new Vector3(center.x,eyeHeight,center.z-distance);
 const direction=new Vector3(0,-Math.sin(pitch),Math.cos(pitch));
 const target=position.clone().addScaledVector(direction,distance/Math.cos(pitch));
 return {position,target,distance:position.distanceTo(target),pitch};
}

/** Posisi horizon foto latar (object-fit cover, rata bawah) relatif terhadap kanvas, pecahan dari bawah. */
export function backdropHorizon(container:{width:number;height:number;top:number},canvas:{height:number;top:number},image:{width:number;height:number;horizon:number}){
 const scale=Math.max(container.width/image.width,container.height/image.height);
 const imageTop=container.top+container.height-image.height*scale;
 const horizonY=imageTop+image.horizon*image.height*scale;
 return 1-(horizonY-canvas.top)/canvas.height;
}
