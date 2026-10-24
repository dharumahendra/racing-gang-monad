import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,  SphereGeometry, TorusGeometry, Vector2, type Material, type Texture } from 'three';

type Decals={box?:Texture;cab?:Texture;flag?:Texture};
const mat=(color:string,metalness=0,roughness=.5)=>new MeshStandardMaterial({color,metalness,roughness});
const mesh=(parent:Group,name:string,geometry:BufferGeometry,material:Material,x=0,y=0,z=0)=>{
  const m=new Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
};
const box=(p:Group,n:string,s:[number,number,number],m:Material,x=0,y=0,z=0)=>mesh(p,n,new BoxGeometry(...s),m,x,y,z);
function wheel(p:Group,x:number,z:number,r:number,rubber:Material,rim:Material){
  const tire=mesh(p,'tire',new CylinderGeometry(r,r,.18,32),rubber,x,r,z);tire.rotation.z=Math.PI/2;
  const hub=mesh(p,'wheel rim',new CylinderGeometry(r*.66,r*.66,.19,24),rim,x,r,z);hub.rotation.z=Math.PI/2;
  const cap=mesh(p,'wheel hub',new CylinderGeometry(r*.24,r*.24,.205,16),rubber,x,r,z);cap.rotation.z=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3;const lug=mesh(p,'wheel lug',new CylinderGeometry(.018,.018,.21,8),rim,x,r+Math.cos(a)*r*.42,z+Math.sin(a)*r*.42);lug.rotation.z=Math.PI/2;}
}
export { createSppgTruck } from './sppg-truck';
export function createBurgerCar(decals:Decals={}){
  const p=new Group();p.name='Burger Car';
  const bun=mat('#dda04c',0,.64),base=mat('#d69a43',0,.72),meat=mat('#633020',0,.9),cheese=mat('#ffd24b',0,.6),green=mat('#74be2d',0,.65),rubber=mat('#252b22',0,.9),chrome=mat('#a0b4bc',.85,.16),blue=mat('#55c8dd',.5,.16),red=mat('#ce3b33',0,.35);
  const lathe=(name:string,points:number[][],m:Material)=>mesh(p,name,new LatheGeometry(points.map(([r,y])=>new Vector2(r,y)),64),m);
  lathe('bottom bun',[[0,.35],[1.37,.35],[1.59,.42],[1.67,.60],[1.62,.78],[0,.78]],base);
  const patty=mesh(p,'grilled patty',new CylinderGeometry(1.65,1.67,.22,64,3),meat,0,.89,0);
  const attr=patty.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){const x=attr.getX(i),z=attr.getZ(i);const a=Math.atan2(z,x);const k=1+.025*Math.sin(a*17)+.016*Math.cos(a*29);attr.setXYZ(i,x*k,attr.getY(i)+Math.sin(a*23)*.018,z*k);}patty.geometry.computeVertexNormals();
  const slice=box(p,'cheese slice',[2.83,.035,2.83],cheese,0,.77,0);slice.rotation.y=.23;
  const lettuce=new BufferGeometry(),v:number[]=[],indices:number[]=[];
  for(let ring=0;ring<2;ring++)for(let i=0;i<=128;i++){const a=i/128*Math.PI*2,r=ring===0?1.34:1.75+.055*Math.sin(a*13);v.push(Math.cos(a)*r,1.035+Math.sin(a*14)*.055+ring*.025,Math.sin(a)*r);}
  for(let i=0;i<128;i++){const a=i,b=i+129;indices.push(a,b,a+1,b,b+1,a+1);}lettuce.setAttribute('position',new Float32BufferAttribute(v,3));lettuce.setIndex(indices);lettuce.computeVertexNormals();green.side=DoubleSide;mesh(p,'ruffled lettuce',lettuce,green);
  lathe('upper sesame bun',[[1.64,1.07],[1.70,1.15],[1.65,1.36],[1.46,1.62],[1.17,1.83],[.88,1.94],[.80,1.88],[.80,1.26],[1.15,1.07]],bun);
  mesh(p,'cockpit floor',new CylinderGeometry(.81,.81,.05,48),mat('#243a3f'),0,1.25,0);
  const glass=new MeshPhysicalMaterial({color:'#007ca8',metalness:.26,roughness:.12,clearcoat:1,side:DoubleSide});
  const windshield=mesh(p,'blue curved windshield',new SphereGeometry(.87,40,18,0,Math.PI,0,Math.PI/2),glass,0,1.49,.04);windshield.scale.y=.69;
  for(let i=0;i<4;i++)mesh(p,'red scalloped seat',new CapsuleGeometry(.14,.44,5,12),red,(i-1.5)*.29,1.85,-.42);
  for(const x of [-1.27,1.27])for(const z of [-1.04,1.04])wheel(p,x,z,.235,rubber,cheese);
  for(const x of [-.94,.94]){const housing=mesh(p,'chrome headlight housing',new CylinderGeometry(.19,.19,.35,28),chrome,x,1.37,1.39);housing.rotation.x=Math.PI/2;const lens=mesh(p,'blue headlight',new CylinderGeometry(.146,.146,.012,28),blue,x,1.37,1.57);lens.rotation.x=Math.PI/2;}
  const steering=mesh(p,'steering wheel',new TorusGeometry(.25,.025,10,32),rubber,.22,1.68,.48);steering.rotation.x=-.35;
  for(let i=0;i<3;i++){const spoke=box(p,'steering spoke',[.026,.24,.026],rubber,.22,1.68,.48);spoke.rotation.z=i*Math.PI*2/3;}
  const pole=mesh(p,'flag pole',new CylinderGeometry(.012,.012,2.16,12),chrome,.67,2.60,-.53);pole.castShadow=false;
  mesh(p,'flag pole finial',new SphereGeometry(.035,12,8),chrome,.67,3.70,-.53);
  const flagGeo=new BufferGeometry(),fv:number[]=[],fi:number[]=[];
  for(let y=0;y<2;y++)for(let i=0;i<=16;i++){const t=i/16;fv.push(.67-t*.88,3.59-y*.30+Math.sin(t*Math.PI*2)*.035,-.53+Math.sin(t*Math.PI*2)*.065);}
  for(let i=0;i<16;i++)fi.push(i,i+17,i+1,i+17,i+18,i+1);flagGeo.setAttribute('position',new Float32BufferAttribute(fv,3));flagGeo.setIndex(fi);flagGeo.setAttribute('uv',new Float32BufferAttribute(Array.from({length:34},(_,i)=>[1-(i%17)/16,1-Math.floor(i/17)]).flat(),2));flagGeo.computeVertexNormals();mesh(p,'KK flag',flagGeo,new MeshStandardMaterial({color:decals.flag?'#ffffff':'#e63933',map:decals.flag??null,side:DoubleSide,roughness:.8}));
  const sesame=mat('#f9df9f',0,.8);
  for(let i=0;i<85;i++){const a=i*2.39996323,r=1.05+(Math.sin(i*12.73)*.5+.5)*.50,y=1.88-(r-1.05)*1.07;const s=mesh(p,'sesame seed',new CapsuleGeometry(.013,.045,3,5),sesame,Math.cos(a)*r,y+.025,Math.sin(a)*r);s.rotation.set(.6,a,Math.PI/2);}
  return p;
}
