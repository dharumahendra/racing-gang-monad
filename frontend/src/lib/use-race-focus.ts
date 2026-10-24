import { useLayoutEffect } from 'react';
export const RACE_FOCUS_CLASS = 'race-focus';
/** Kunci viewport hanya selama countdown/run; posisi scroll kembali sesudah selesai atau unmount. */
export function useRaceFocus(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const scroller = document.querySelector<HTMLElement>('.app-content');
    const scrollTop = scroller?.scrollTop ?? 0;
    document.body.classList.add(RACE_FOCUS_CLASS);
    document.documentElement.classList.add(RACE_FOCUS_CLASS);
    return () => {
      document.body.classList.remove(RACE_FOCUS_CLASS);
      document.documentElement.classList.remove(RACE_FOCUS_CLASS);
      if (scroller) scroller.scrollTop = scrollTop;
    };
  }, [active]);
}
