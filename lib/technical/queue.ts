// Cola de escrituras optimistas por fila, sin dependencias de React ni de Supabase (probada en scripts/test-technical.ts).

export interface QueueRow {
  elemento: string;
  atleta: string | null;
}

export interface QueueOptions<T extends QueueRow> {
  /** Sesión vigente en pantalla (puede cambiar mientras hay escrituras en vuelo). */
  getSession: () => string | null;
  /** Última versión confirmada en la base de la sesión vigente. */
  getConfirmed: () => T[];
  setConfirmed: (list: T[]) => void;
  /** Aplica un cambio al estado visible (optimista o reversión). */
  applyLocal: (fn: (list: T[]) => T[]) => void;
  onError: (e: unknown) => void;
}

const rowKey = (sid: string, elemento: string, atleta: string | null) => `${sid}|${elemento}|${atleta ?? ''}`;

/**
 * Escritura optimista de las filas (elemento, atletas) de la sesión `sid`:
 *  · en cola por sesión+elemento, para que lleguen a la base en orden;
 *  · si falla, solo se revierten esas filas (a lo último confirmado) y solo si nadie las ha vuelto a tocar;
 *  · si la sesión activa cambió, no se toca la pantalla.
 * `mutate` devuelve la promesa de su turno en la cola (nunca rechaza).
 */
export function createWriteQueue<T extends QueueRow>(opts: QueueOptions<T>) {
  const chains = new Map<string, Promise<void>>();
  const seqs = new Map<string, number>();

  return function mutate(
    sid: string, elemento: string, atletas: (string | null)[],
    optimistic: (list: T[]) => T[], write: () => Promise<void>, confirm: (list: T[]) => T[]
  ): Promise<void> {
    const live = () => opts.getSession() === sid;
    if (live()) opts.applyLocal(optimistic);
    const mine = new Map<string, number>();
    for (const a of atletas) {
      const k = rowKey(sid, elemento, a);
      const n = (seqs.get(k) ?? 0) + 1;
      seqs.set(k, n);
      mine.set(k, n);
    }
    const chainKey = `${sid}|${elemento}`;
    const next = (chains.get(chainKey) ?? Promise.resolve()).then(write).then(
      () => { if (live()) opts.setConfirmed(confirm(opts.getConfirmed())); },
      e => {
        if (!live()) return;
        const mineNow = atletas.filter(a => seqs.get(rowKey(sid, elemento, a)) === mine.get(rowKey(sid, elemento, a)));
        const inSet = (s: T) => s.elemento === elemento && mineNow.includes(s.atleta);
        const back = opts.getConfirmed().filter(inSet);
        opts.applyLocal(list => [...list.filter(s => !inSet(s)), ...back]);
        opts.onError(e);
      }
    );
    chains.set(chainKey, next);
    return next;
  };
}
