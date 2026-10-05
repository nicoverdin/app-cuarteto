import { RoutinePart } from '../types';

// Respaldo si la BD está vacía o no hay Supabase configurado.
export const initialData: RoutinePart[] = [
  {
    id: 'p1', name: 'Transición a cluster',
    corrections: [
      { id: 'c1', text: 'Mantener la velocidad y bloque compacto al cruzar', status: 'yellow' }
    ]
  },
  {
    id: 'p2', name: 'Cluster',
    corrections: [
      { id: 'c2', text: 'Sincronización exacta en la elevación entre Mabel y Raquel', status: 'red' },
      { id: 'c3', text: 'Tensión en los brazos libres hasta el último tiempo', status: 'green' }
    ]
  },
  {
    id: 'p3', name: 'Trans. de cluster a cambio de música',
    corrections: [
      { id: 'c4', text: 'Limpiar el filo de salida', status: 'yellow' }
    ]
  },
  {
    id: 'p4', name: 'Transición a creativa',
    corrections: [
      { id: 'c5', text: 'Fluidez en los cruces hacia atrás', status: 'pink' }
    ]
  },
  {
    id: 'p5', name: 'Creativa',
    corrections: [
      { id: 'c6', text: 'Expresión facial acorde al acento musical', status: 'green' }
    ]
  },
  {
    id: 'p6', name: 'Transición a traveling',
    corrections: [
      { id: 'c7', text: 'Cuidado con la distancia entre Luar y Martina al entrar', status: 'yellow' }
    ]
  },
  {
    id: 'p7', name: 'Traveling',
    corrections: [
      { id: 'c8', text: 'Postura corporal erguida en los giros, no bajar la mirada', status: 'red' }
    ]
  },
  {
    id: 'p8', name: 'Línea',
    corrections: [
      { id: 'c9', text: 'Alineación perfecta en el eje central de la pista', status: 'yellow' }
    ]
  },
  {
    id: 'p9', name: 'Final',
    corrections: [
      { id: 'c10', text: 'Mantener la pose final 3 segundos estáticas', status: 'pink' }
    ]
  },
];

const CACHE_KEY = 'cuarteto:routine';

export const isValidRoutine = (d: unknown): d is RoutinePart[] => Array.isArray(d) && d.length > 0;

export function readCachedRoutine(): RoutinePart[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isValidRoutine(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const UPDATED_KEY = 'cuarteto:updated-at';

export function readCachedUpdatedAt(): string | null {
  try {
    return localStorage.getItem(UPDATED_KEY);
  } catch {
    return null;
  }
}

export function writeCachedRoutine(routine: RoutinePart[], updatedAt?: string | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(routine));
    if (updatedAt) localStorage.setItem(UPDATED_KEY, updatedAt);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}
