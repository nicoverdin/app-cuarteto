import { RoutinePart } from '../types';

export type Change = 'new' | 'changed';

// "Visto por última vez": foto compacta de la rutina (id → estado|texto) guardada en el navegador
// cuando la atleta sale de la app. Al volver, lo que difiera se marca como novedad.
const SEEN_KEY = 'cuarteto:seen';

const signature = (c: { status: string; text: string }) => `${c.status}|${c.text}`;

const snapshotOf = (routine: RoutinePart[]): Record<string, string> =>
  Object.fromEntries(routine.flatMap(p => p.corrections.map(c => [c.id, signature(c)])));

const read = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};

// Pequeño store externo (para useSyncExternalStore): la base de comparación solo cambia
// cuando la atleta vuelve a la app, no mientras la está mirando.
let baseline: string | null | undefined;
const listeners = new Set<() => void>();

export const subscribeSeen = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSeen = () => (baseline === undefined ? (baseline = read()) : baseline);
export const getServerSeen = () => null;

export function markSeen(routine: RoutinePart[]) {
  if (routine.length === 0) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(snapshotOf(routine)));
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function reloadSeenBaseline() {
  baseline = read();
  listeners.forEach(l => l());
}

export function diffAgainst(seenRaw: string | null, routine: RoutinePart[]): Record<string, Change> {
  if (!seenRaw) return {}; // primera visita: nada es "nuevo"
  let seen: Record<string, string>;
  try {
    seen = JSON.parse(seenRaw);
  } catch {
    return {};
  }
  const result: Record<string, Change> = {};
  for (const part of routine) {
    for (const c of part.corrections) {
      if (!(c.id in seen)) result[c.id] = 'new';
      else if (seen[c.id] !== signature(c)) result[c.id] = 'changed';
    }
  }
  return result;
}
