import { expect,it } from 'vitest';
import { LAND_FLAT_HALF_WIDTH,LAND_LENGTH,landscapeHeight,landscapeTileZ } from './landscape-layout';
it('keeps the road and shoulder flat and below the road surface',()=>{
 for(let x=-LAND_FLAT_HALF_WIDTH;x<=LAND_FLAT_HALF_WIDTH;x+=.5)for(let z=-135;z<=135;z+=15)expect(landscapeHeight(x,z)).toBeCloseTo(-.09,8);
});
it('joins terrain height continuously across recycling tile seams',()=>{
 for(let x=-180;x<=180;x+=6)expect(landscapeHeight(x,-LAND_LENGTH/2)).toBeCloseTo(landscapeHeight(x,LAND_LENGTH/2),8);
});
it('two recycled tiles cover the visible road corridor even after a long run',()=>{
 for(const travel of [0,1,134,269,270,539,540,12345,100000]){
 const centres=[0,1].map(i=>landscapeTileZ(i,travel)).sort((a,b)=>a-b);
 expect(centres[1]-centres[0]).toBeCloseTo(LAND_LENGTH);
 expect(centres[0]-LAND_LENGTH/2).toBeLessThanOrEqual(-250);
 expect(centres[1]+LAND_LENGTH/2).toBeGreaterThanOrEqual(10);
 }
});
