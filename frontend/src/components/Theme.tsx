import {createContext, useContext, useLayoutEffect, useEffect, useState, type ReactNode} from 'react';
import {browserStorage, readTheme, saveTheme, themeStorageKey, type Theme} from '../lib/theme';
import {Icon} from './Icon';
const ThemeContext=createContext<{theme:Theme;toggle:()=>void}>({theme:'light',toggle:()=>{}});
export const useTheme=()=>useContext(ThemeContext);
export function ThemeProvider({children}:{children:ReactNode}){
  const [theme,setTheme]=useState<Theme>(()=>readTheme(browserStorage()));
  useLayoutEffect(()=>{document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#F4F6F9':'#101216');},[theme]);
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===themeStorageKey||event.key===null)setTheme(readTheme(browserStorage()));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  function toggle(){const next=theme==='light'?'dark':'light';setTheme(next);saveTheme(next,browserStorage());}
  return <ThemeContext.Provider value={{theme,toggle}}>{children}</ThemeContext.Provider>;
}
export function ThemeToggle(){const {theme,toggle}=useTheme();return <button className="theme-toggle" type="button" onClick={toggle} aria-label={`Aktifkan tema ${theme==='light'?'gelap':'terang'}`} title={theme==='light'?'Cyber Arcade Drift':'Daylight Grand Prix'}><Icon name={theme==='light'?'moon':'sun'}/><span>{theme==='light'?'Gelap':'Terang'}</span></button>;}
