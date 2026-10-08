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
  /** Se llama cada vez que cambia el número de escrituras pendientes. */
  onPending?: (n: number) => void;
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
  let pending = 0;
  const idleWaiters: (() => void)[] = [];
  const setPending = (n: number) => {
    pending = n;
    try { opts.onPending?.(n); } catch { /* el aviso no debe romper la cola */ }
    if (n === 0) idleWaiters.splice(0).forEach(r => r());
  };

  function mutate(
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
    setPending(pending + 1);
    const next = (chains.get(chainKey) ?? Promise.resolve()).then(write).then(
      () => {
        try { if (live()) opts.setConfirmed(confirm(opts.getConfirmed())); }
        catch (e) { if (live()) opts.onError(e); } // un fallo al confirmar no debe romper la cadena
      },
      e => {
        if (!live()) return;
        const mineNow = atletas.filter(a => seqs.get(rowKey(sid, elemento, a)) === mine.get(rowKey(sid, elemento, a)));
        const inSet = (s: T) => s.elemento === elemento && mineNow.includes(s.atleta);
        const back = opts.getConfirmed().filter(inSet);
        opts.applyLocal(list => [...list.filter(s => !inSet(s)), ...back]);
        opts.onError(e);
      }
    ).catch(() => { /* la cadena nunca queda rechazada */ }).then(() => setPending(pending - 1));
    chains.set(chainKey, next);
    return next;
  }
  /** Escrituras en cola o en vuelo. */
  mutate.pending = () => pending;
  /** Se resuelve cuando no queda ninguna escritura pendiente. */
  mutate.idle = (): Promise<void> => (pending === 0 ? Promise.resolve() : new Promise<void>(r => { idleWaiters.push(r); }));
  return mutate;
}
