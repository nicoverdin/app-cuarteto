import { useSyncExternalStore } from 'react';
import { Correction } from '../types';

export const ATHLETES = ['Mabel', 'Raquel', 'Luar', 'Martina'];

// ¿Esta corrección le toca a la atleta? Sin atleta elegida se ve todo; sin "who" afecta a todas.
export const isFor = (c: Correction, athlete: string | null) =>
  !athlete || !c.who?.length || c.who.includes(athlete);

// Atleta elegida en este dispositivo ("Las mías"), guardada en el navegador.
const KEY = 'cuarteto:athlete';
const listeners = new Set<() => void>();

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v && ATHLETES.includes(v) ? v : null;
  } catch {
    return null;
  }
};

export function setAthlete(name: string | null) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useAthlete = () => useSyncExternalStore(subscribe, read, () => null);
