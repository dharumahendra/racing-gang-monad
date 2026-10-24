import { useEffect } from 'react';
/**
 * Mode fokus balapan: selama run berjalan (hitung mundur + balapan), header dan navigasi bawah disembunyikan
 * lewat kelas di <body>. Kembali otomatis saat run selesai, halaman ditinggalkan, atau komponen dilepas.
 */
export const RACE_FOCUS_CLASS = 'race-focus';
export function useRaceFocus(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add(RACE_FOCUS_CLASS);
    return () => document.body.classList.remove(RACE_FOCUS_CLASS);
  }, [active]);
}