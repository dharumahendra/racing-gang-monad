import {createContext, useContext, useLayoutEffect, type ReactNode} from 'react';
/** Tema terang dihapus: aplikasi selalu memakai tema gelap. API tetap ada agar komponen lain tidak berubah. */
export type Theme='dark';
const ThemeContext=createContext<{theme:Theme}>({theme:'dark'});
export const useTheme=()=>useContext(ThemeContext);
export function ThemeProvider({children}:{children:ReactNode}){
  useLayoutEffect(()=>{document.documentElement.dataset.theme='dark';document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#101216');},[]);
  return <ThemeContext.Provider value={{theme:'dark'}}>{children}</ThemeContext.Provider>;
}
