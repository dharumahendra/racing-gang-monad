import { BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Shape, TorusGeometry, TubeGeometry, Vector3, type Material, type Texture } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

type Decals={box?:Texture;cab?:Texture};
type Point=[number,number,number];
const standard=(name:string,color:string,metalness:number,roughness:number)=>{
  const material=new MeshStandardMaterial({name,color,metalness,roughness});return material;
};
const add=(parent:Group,name:string,geometry:BufferGeometry,material:Material,x=0,y=0,z=0)=>{
  const object=new Mesh(geometry,material);object.name=name;object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
};
const box=(parent:Group,name:string,size:Point,material:Material,x=0,y=0,z=0,radius=0)=>add(parent,name,radius?new RoundedBoxGeometry(...size,3,radius):new BoxGeometry(...size),material,x,y,z);
const tube=(parent:Group,name:string,points:Point[],radius:number,material:Material)=>add(parent,name,new TubeGeometry(new CatmullRomCurve3(points.map(point=>new Vector3(...point))),Math.max(8,points.length*4),radius,6,false),material);
function quad(parent:Group,name:string,points:Point[],material:Material,flipUv=false){
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points.flat(),3));geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('uv',new Float32BufferAttribute(flipUv?[1,0,0,0,0,1,1,1]:[0,0,1,0,1,1,0,1],2));geometry.computeVertexNormals();return add(parent,name,geometry,material);
}
function axleCylinder(parent:Group,name:string,radius:number,width:number,material:Material,x:number,y:number,z:number,segments=32){
  const object=add(parent,name,new CylinderGeometry(radius,radius,width,segments),material,x,y,z);object.rotation.z=Math.PI/2;return object;
}

/** Compact Indonesian delivery truck. Metres, Y up, front +Z; independent of gameplay tiers. */
export function createSppgTruck(decals:Decals={}){
  const p=new Group();p.name='Satuan P Balap — Bangun';
  const paint=new MeshPhysicalMaterial({name:'Pearl white automotive paint',color:'#dde3e5',metalness:.12,roughness:.27,clearcoat:1,clearcoatRoughness:.18});
  const cargo=standard('Satin insulated cargo panels','#e3e7e7',.08,.48);
  const aluminium=standard('Brushed aluminium trim','#a3afb7',.78,.3);
  const chrome=standard('Polished wheel and lamp trim','#c3d0d7',.88,.2);
  const plastic=standard('Textured graphite bumper','#252e35',.05,.6);
  const rubber=standard('Tire rubber','#151b20',0,.88);
  const tread=standard('Raised tire tread','#22282c',0,.95);
  const seam=standard('Panel and window seals','#172127',0,.82);
  const glass=new MeshPhysicalMaterial({name:'Smoked blue automotive glass',color:'#123347',metalness:.18,roughness:.1,clearcoat:1,clearcoatRoughness:.07,side:DoubleSide});
  const red=new MeshPhysicalMaterial({name:'Red tail-light lens',color:'#9f1820',roughness:.21,clearcoat:1});
  const amber=new MeshPhysicalMaterial({name:'Amber indicator lens',color:'#e18815',roughness:.22,clearcoat:1});
  const lens=new MeshPhysicalMaterial({name:'Clear headlamp lens',color:'#d7e7ee',metalness:.15,roughness:.13,clearcoat:1});

  box(p,'ladder frame',[1.43,.17,4.2],plastic,0,.48,-.02,.025);
  for(const x of [-.53,.53])box(p,'chassis rail',[.09,.15,4.10],seam,x,.45,-.03);
  for(const z of [-1.37,1.52])axleCylinder(p,'axle',.055,1.72,plastic,0,.36,z);
  box(p,'fuel tank',[.41,.28,.8],aluminium,-.53,.45,-.26,.06);
  box(p,'underbody battery box',[.36,.3,.54],plastic,.54,.46,-.28,.035);

  // Body profile leaves a real opening around the front wheel instead of intersecting the tire.
  const cab=new Shape();cab.moveTo(.70,.55);cab.lineTo(1.12,.55);
  cab.absarc(1.52,.36,.443,Math.atan2(.19,-.40),Math.atan2(.19,.40),true);
  cab.lineTo(2.17,.55);cab.quadraticCurveTo(2.34,.61,2.34,.82);cab.lineTo(2.34,1.14);
  cab.quadraticCurveTo(2.34,1.25,2.29,1.33);cab.lineTo(1.91,2.04);
  cab.quadraticCurveTo(1.84,2.15,1.68,2.15);cab.lineTo(.79,2.15);cab.quadraticCurveTo(.70,2.15,.70,2.05);cab.closePath();
  const body=new ExtrudeGeometry(cab,{depth:1.66,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:4,curveSegments:24});
  body.rotateY(-Math.PI/2);add(p,'white cab',body,paint,.83,0,0);
  // Surface positions follow the cab's slope and remain outside its bevel envelope.
  const frontZ=(y:number)=>2.29-(y-1.33)*(.38/.71);
  const wind=(name:string,width:number,bottom:number,top:number,offset:number,material:Material)=>quad(p,name,[[-width/2,bottom,frontZ(bottom)+offset],[width/2,bottom,frontZ(bottom)+offset],[width/2,top,frontZ(top)+offset],[-width/2,top,frontZ(top)+offset]],material);
  wind('windshield rubber surround',1.57,1.365,2.025,.058,new MeshStandardMaterial({color:'#172127',roughness:.65,side:DoubleSide}));
  wind('front windshield',1.43,1.415,1.975,.073,glass);
  for(const x of [-.35,.32]){
    tube(p,'windshield wiper arm',[[x,1.39,frontZ(1.39)+.088],[x-.12,1.48,frontZ(1.48)+.088]],.008,plastic);
    tube(p,'windshield wiper blade',[[x-.29,1.49,frontZ(1.49)+.095],[x+.13,1.49,frontZ(1.49)+.095]],.011,seam);
  }
  box(p,'front bonnet seam',[1.43,.012,.015],seam,0,1.285,2.365);
  box(p,'front grille surround',[.91,.20,.075],aluminium,0,1.077,2.377,.025);
  box(p,'front grille recess',[.83,.14,.085],seam,0,1.077,2.405,.012);
  for(const y of [1.033,1.075,1.117])box(p,'horizontal grille slat',[.79,.012,.018],plastic,0,y,2.458);
  box(p,'front bumper',[1.83,.26,.25],plastic,0,.65,2.31,.055);
  box(p,'bumper lower intake',[.69,.10,.022],seam,0,.665,2.447,.014);
  for(const x of [-.61,.61]){
    box(p,'headlamp rubber seal',[.36,.255,.085],plastic,x,1.075,2.385,.04);
    box(p,'headlamp',[.305,.20,.045],lens,x,1.075,2.446,.025);
    // Lens ribs and reflector rings add depth without hiding the central lens surface.
    for(const dx of [-.105,-.07,-.035,.035,.07,.105])box(p,'headlamp vertical prism',[.006,.15,.009],chrome,x+dx,1.075,2.473);
    box(p,'front indicator',[.29,.065,.04],amber,x,.916,2.416,.015);
    box(p,'fog lamp surround',[.22,.105,.025],seam,x,.64,2.443,.025);
    box(p,'fog lamp',[.13,.066,.018],lens,x,.64,2.461,.02);
  }
  box(p,'front number plate',[.43,.12,.018],seam,0,.646,2.465,.01);
  for(const x of [-.18,.18])box(p,'front plate fastener',[.012,.012,.009],aluminium,x,.68,2.48);

  for(const side of [-1,1]){
    const sx=(value:number)=>side*value;
    quad(p,'side window seal',[[sx(.858),1.37,.79],[sx(.858),1.37,2.12],[sx(.858),2.015,1.78],[sx(.858),2.015,.79]],new MeshStandardMaterial({color:'#172127',roughness:.7,side:DoubleSide}));
    quad(p,'side window',[[sx(.866),1.42,.84],[sx(.866),1.42,2.035],[sx(.866),1.96,1.745],[sx(.866),1.96,.84]],glass);
    tube(p,'side window divider',[[sx(.878),1.42,1.78],[sx(.878),1.96,1.62]],.014,plastic);
    tube(p,'door panel seam',[[sx(.856),2.06,.76],[sx(.856),1.33,.76],[sx(.856),.63,.76],[sx(.856),.61,1.05]],.006,seam);
    tube(p,'door front seam',[[sx(.857),1.35,2.15],[sx(.857),.83,2.13],[sx(.857),.59,2.08]],.006,seam);
    box(p,'door handle recess',[.026,.08,.22],plastic,sx(.868),1.285,1.02,.015);
    box(p,'door handle',[.035,.025,.16],aluminium,sx(.888),1.29,1.02,.008);
    tube(p,'mirror support',[[sx(.86),1.49,1.94],[sx(1.025),1.49,1.97],[sx(1.025),1.66,1.97]],.018,plastic);
    box(p,'mirror housing',[.15,.29,.17],plastic,sx(1.035),1.73,1.97,.045);
    box(p,'mirror glass',[.118,.245,.012],chrome,sx(1.035),1.73,1.876,.025);
    box(p,'door sill step',[.14,.065,.39],plastic,sx(.87),.53,.95,.015);
    box(p,'side indicator',[.022,.045,.105],amber,sx(.872),1.19,2.07,.008);
    if(decals.cab)quad(p,'Bangun cab lettering',[[sx(.858),.88,.84],[sx(.858),.88,1.48],[sx(.858),1.22,1.48],[sx(.858),1.22,.84]],new MeshStandardMaterial({name:'Cab service decal',map:decals.cab,transparent:true,roughness:.55,side:DoubleSide}),side>0);
    const arch:Point[]=Array.from({length:25},(_,i)=>{const a=i/24*Math.PI;return [sx(.87),.36+Math.sin(a)*.453,1.52+Math.cos(a)*.453];});
    tube(p,'front wheel arch trim',arch,.021,plastic);
  }

  // Insulated body, aluminium corner extrusions, side markers and proper double rear doors.
  box(p,'cargo box',[1.96,1.90,2.88],cargo,0,1.75,-.69,.025);
  box(p,'cargo subframe',[1.99,.10,2.94],aluminium,0,.765,-.69,.012);
  box(p,'cargo roof cap',[1.99,.055,2.94],cargo,0,2.707,-.69,.018);
  for(const side of [-1,1]){
    const x=side*.992;
    for(const y of [.82,2.66])box(p,'cargo side rail',[.032,.04,2.91],aluminium,x,y,-.69,.007);
    for(const z of [-2.13,.75])box(p,'cargo corner extrusion',[.038,1.88,.038],aluminium,x,1.75,z,.006);
    // Modest rivet detail stays intentional at NFT thumbnail size.
    for(let i=0;i<8;i++)for(const y of [.825,2.66])axleCylinder(p,'cargo rivet',.008,.008,chrome,side*1.012,y,-1.96+i*.37,8);
    for(const z of [-1.98,.60])box(p,'cargo amber side marker',[.018,.065,.13],amber,side*1.014,.9,z,.012);
    if(decals.box)quad(p,'Satuan P Balap lettering',[[side*1.009,1.06,-1.91],[side*1.009,1.06,.52],[side*1.009,2.46,.52],[side*1.009,2.46,-1.91]],new MeshStandardMaterial({name:'Printed Bangun Balap identity',map:decals.box,transparent:true,roughness:.56,side:DoubleSide}),side>0);
    const arch:Point[]=Array.from({length:25},(_,i)=>{const a=i/24*Math.PI;return [side*.96,.36+Math.sin(a)*.425,-1.37+Math.cos(a)*.425];});
    tube(p,'rear wheel mudguard',arch,.035,plastic);
    box(p,'rear mudflap',[.26,.30,.025],rubber,side*.86,.23,-1.80);
    box(p,'rear light surround',[.31,.19,.06],plastic,side*.76,.64,-2.195,.02);
    box(p,'rear brake light',[.15,.12,.025],red,side*.81,.65,-2.237,.012);
    box(p,'rear indicator',[.075,.12,.025],amber,side*.69,.65,-2.238,.012);
    box(p,'rear door leaf',[.92,1.76,.026],paint,side*.478,1.75,-2.161,.008);
    const bar=add(p,'rear locking bar',new CylinderGeometry(.017,.017,1.53,12),aluminium,side*.43,1.75,-2.202);
    bar.castShadow=false;
    for(const y of [1.02,1.75,2.47]){
      box(p,'rear lock bracket',[.09,.055,.045],aluminium,side*.43,y,-2.213,.005);
      box(p,'rear door hinge',[.13,.075,.045],aluminium,side*.88,y,-2.211,.007);
    }
    box(p,'rear lock handle',[.24,.026,.035],plastic,side*.35,1.5,-2.235,.006);
  }
  box(p,'rear door center gasket',[.018,1.80,.025],seam,0,1.75,-2.181);
  box(p,'rear underride bumper',[1.83,.115,.13],aluminium,0,.39,-2.25,.018);
  box(p,'rear number plate',[.43,.12,.02],seam,0,.62,-2.22,.008);

  function wheel(side:number,z:number,track:number){
    const x=side*track,y=.36;
    axleCylinder(p,'tire inner barrel',.292,.205,rubber,x,y,z);
    const tire=add(p,'rounded tire sidewall',new TorusGeometry(.283,.077,12,56),rubber,x,y,z);tire.rotation.y=Math.PI/2;
    axleCylinder(p,'steel rim barrel',.222,.22,aluminium,x,y,z);
    axleCylinder(p,'recessed wheel face',.196,.015,chrome,x+side*.12,y,z);
    const ring=add(p,'rim rolled edge',new TorusGeometry(.211,.012,8,48),chrome,x+side*.12,y,z);ring.rotation.y=Math.PI/2;
    axleCylinder(p,'wheel center cap',.059,.033,plastic,x+side*.14,y,z,24);
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      axleCylinder(p,'rim ventilation hole',.031,.008,seam,x+side*.133,y+Math.cos(a)*.141,z+Math.sin(a)*.141,12);
      axleCylinder(p,'wheel lug',.012,.018,chrome,x+side*.143,y+Math.cos(a)*.088,z+Math.sin(a)*.088,8);
    }
    for(let i=0;i<32;i++){
      const a=i/32*Math.PI*2;
      const block=box(p,'tire tread block',[.13,.013,.037],tread,x,y+Math.cos(a)*.356,z+Math.sin(a)*.356,.003);block.rotation.x=a;
    }
  }
  for(const side of [-1,1]){wheel(side,1.52,.80);wheel(side,-1.37,.86);}
  return p;
}
