import { LANES, LANE_WIDTH } from '@racing-gang/config';
export const LAND_LENGTH=270;
export const LAND_WIDTH=360;
export const LAND_FLAT_HALF_WIDTH=LANES*LANE_WIDTH/200+3;
/** Profil visual periodik: tidak mengubah hitbox atau posisi mobil di sim. */
export function landscapeHeight(x:number,z:number) {
 const edge=Math.max(0,Math.abs(x)-LAND_FLAT_HALF_WIDTH);
 const envelope=Math.min(1,edge/75);
 const wave=2*Math.PI*z/LAND_LENGTH;
 return -.09+envelope**1.6*(18+8*Math.sin(wave+x*.025)+5*Math.cos(2*wave-x*.04));
}
export function landscapeTileZ(index:number,travel:number) {
 const cycle=LAND_LENGTH*2;
 return 150-(((index*LAND_LENGTH-travel)%cycle+cycle)%cycle);
}
