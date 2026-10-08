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

// crypto.randomUUID solo existe en contextos seguros (HTTPS/localhost); en http://IP no está disponible.
export function newCorrectionId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return `new-${c.randomUUID()}`;
  return `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type Mutation = (routine: RoutinePart[]) => RoutinePart[];

/**
 * Mutación inversa de un cambio (antes → después), aplicable sobre el estado ACTUAL (que puede
 * contener otros cambios): quita lo añadido, restaura lo modificado, recoloca el orden y reinserta lo borrado.
 * Se usa en lugar de volver a una foto, que pisaría cambios ajenos.
 */
export function inverseMutation(before: RoutinePart[], after: RoutinePart[]): Mutation {
  return current => current.map(part => {
    const b = before.find(p => p.id === part.id);
    const a = after.find(p => p.id === part.id);
    if (!b || !a) return part;

    const beforeById = new Map(b.corrections.map(c => [c.id, c]));
    const afterById = new Map(a.corrections.map(c => [c.id, c]));
    let list = part.corrections.filter(c => beforeById.has(c.id) || !afterById.has(c.id)); // quita las añadidas

    // Restaura las modificadas
    list = list.map(c => {
      const prev = beforeById.get(c.id);
      const next = afterById.get(c.id);
      return prev && next && JSON.stringify(prev) !== JSON.stringify(next) ? prev : c;
    });

    // Recoloca el orden de las que existían antes y después, ocupando los mismos huecos
    const common = b.corrections.map(c => c.id).filter(id => afterById.has(id));
    const commonAfter = a.corrections.map(c => c.id).filter(id => beforeById.has(id));
    if (common.some((id, i) => id !== commonAfter[i])) {
      const byId = new Map(list.map(c => [c.id, c]));
      const slots = list.flatMap((c, i) => (common.includes(c.id) ? [i] : []));
      const ordered = common.filter(id => byId.has(id)).map(id => byId.get(id)!);
      list = [...list];
      slots.forEach((slot, i) => { list[slot] = ordered[i]; });
    }

    // Reinserta las borradas tras la última anterior que siga presente
    b.corrections.forEach((c, i) => {
      if (afterById.has(c.id) || list.some(x => x.id === c.id)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const idx = list.findIndex(x => x.id === b.corrections[j].id);
        if (idx >= 0) { at = idx + 1; break; }
      }
      list = [...list.slice(0, at), c, ...list.slice(at)];
    });

    return { ...part, corrections: list };
  });
}
