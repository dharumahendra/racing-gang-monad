import { hex32 } from './room-api';
export function runCheckpoint(search:URLSearchParams,id:string){if(!hex32(id))throw new Error('Invalid run ID.');const next=new URLSearchParams(search);next.set('run',id);return next;}
