import type {CSSProperties} from 'react';
const paths={
 garage:<><path d="m3 10 9-7 9 7v11H3Z"/><path d="M7 21V11h10v10M7 15h10M7 18h10"/></>,
 race:<><path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/><path d="M9 4v10m5-9v10M5 9c5-4 9 4 14 0"/></>,
 room:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/></>,
 watch:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
 sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
 moon:<path d="M21 13.2A9 9 0 0 1 10.8 3 9 9 0 1 0 21 13.2Z"/>,
 arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
 speed:<><path d="M4 18a9 9 0 1 1 16 0M12 12l5-5M7 18h10"/><circle cx="12" cy="12" r="1"/></>,
 chevron:<path d="m9 5 7 7-7 7"/>,
 lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
 check:<path d="m5 12 4 4L19 6"/>,
 reset:<><path d="M4 11a8 8 0 1 1 2 7M4 4v7h7"/></>,
 left:<path d="m14 6-6 6 6 6"/>,
 coin:<><circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2"/></>,
 bolt:<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>,
};
export type IconName=keyof typeof paths;
export function Icon({name,className,style}:{name:IconName;className?:string;style?:CSSProperties}){return <svg className={className} style={style} aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;}
