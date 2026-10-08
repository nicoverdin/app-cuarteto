"use client";
import { useState, useEffect, useMemo, useRef, useCallback, useId, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { UserCheck, WifiOff, Sparkles, BookOpen, ClipboardList } from 'lucide-react';
import { RoutinePart, ColorState } from '../types';
import RoutineSection from '../components/RoutineSection';
import InstallHint from '../components/InstallHint';
import LastUpdated from '../components/LastUpdated';
import AthleteFilter from '../components/AthleteFilter';
import CoachBar from '../components/CoachBar';
import { useCoach, useWantsCoach } from '../lib/auth';
import TodayView from '../components/TodayView';
import WeeklyProgress from '../components/WeeklyProgress';
import { isFor, useAthlete } from '../lib/athletes';
import { MainProgressBar, StatusLegend } from '../components/ProgressCharts';
import { supabase, fetchRoutine, timeoutSignal } from '../lib/supabase';
import { diffAgainst, getSeen, getServerSeen, markSeen, reloadSeenBaseline, subscribeSeen } from '../lib/changes';
import { initialData, inverseMutation, isAbortError, isOlderOrEqual, isValidRoutine, newCorrectionId, parseServerDate, rebuildFromConfirmed, readCachedRoutine, readCachedUpdatedAt, writeCachedRoutine, type Mutation } from '../lib/routine';

interface Toast {
  message: string;
  kind: 'ok' | 'error';
  action?: { label: string; run: () => void };
}

interface Props {
  initialRoutine: RoutinePart[] | null;
  initialUpdatedAt: string | null;
}

const VIEWS = [['rutina', 'Rutina'], ['hoy', 'Para trabajar']] as const;
type View = (typeof VIEWS)[number][0];

function ToastBox({ toast }: { toast: Toast }) {
  return (
    <div
      className={`pointer-events-auto w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg text-on-toast ${
        toast.kind === 'error' ? 'bg-red-700 !text-white' : 'bg-toast'
      }`}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.run}
          className="font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-current"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export default function ClientPage({ initialRoutine, initialUpdatedAt }: Props) {
  const [routine, setRoutine] = useState<RoutinePart[]>(initialRoutine ?? (supabase ? [] : initialData));
  // Entrenador = sesión de Supabase verificada por la BD (lib/auth.ts). false en servidor y en la primera pintura.
  const isAdmin = useCoach().status === 'coach';
  const wantsCoach = useWantsCoach();
  const needsSeedRef = useRef(false); // BD vacía: falta guardar el programa inicial
  const [seedKey, setSeedKey] = useState(0);
  const [isLoading, setIsLoading] = useState(!initialRoutine && !!supabase);
  const [loadError, setLoadError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [isOffline, setIsOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<View>('rutina');
  const athlete = useAthlete();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsId = useId();

  // Estado vigente (síncrono, para encadenar guardados sin esperar al render) y control de concurrencia.
  const liveRef = useRef(routine);
  const updatedAtRef = useRef<string | null>(initialUpdatedAt);
  const pendingRef = useRef(0); // guardados en curso
  const epochRef = useRef(0); // cambia con cada guardado: invalida lecturas iniciadas antes
  const staleRef = useRef(false); // llegó un dato del servidor mientras se guardaba: se relee al terminar
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const confirmedRef = useRef(routine); // último estado confirmado por el servidor (dato leído o último guardado)
  const pendingMutsRef = useRef<{ mutate: Mutation }[]>([]); // mutaciones en cola, en orden
  const freshRef = useRef(false); // ¿lo que se ve viene de una lectura del servidor en cliente? (el HTML puede venir de la caché del SW)
  const loadRef = useRef<((silent: boolean) => Promise<void>) | null>(null);

  // Novedades desde la última vez que la atleta usó la app (el entrenador no las necesita).
  const seenRaw = useSyncExternalStore(subscribeSeen, getSeen, getServerSeen);
  const changes = useMemo(() => (isAdmin ? {} : diffAgainst(seenRaw, routine)), [isAdmin, seenRaw, routine]);
  useEffect(() => {
    if (isAdmin) return;
    // Al salir se guarda lo que se ha visto (solo si son datos frescos del servidor); al volver, la base se actualiza.
    const saveSeen = () => {
      if (freshRef.current) markSeen(liveRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveSeen();
      else reloadSeenBaseline();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveSeen);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveSeen);
    };
  }, [isAdmin]);

  const showToast = useCallback((t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.action ? 6000 : 3000);
  }, []);

  // BD vacía: solo el entrenador verificado guarda el programa inicial.
  useEffect(() => {
    if (!isAdmin || !needsSeedRef.current || !supabase) return;
    needsSeedRef.current = false;
    supabase
      .from('disco_cuarteto')
      .upsert({ id: 1, data: initialData })
      .select('id')
      .then(({ error }) => {
        if (error) showToast({ message: 'No se pudo guardar el programa inicial.', kind: 'error' });
      });
  }, [isAdmin, seedKey, showToast]);

  const commit = useCallback((next: RoutinePart[]) => {
    liveRef.current = next;
    setRoutine(next);
  }, []);

  const setMeta = useCallback((at: string | null) => {
    updatedAtRef.current = at;
    setUpdatedAt(at);
  }, []);

  // Aplica datos llegados del servidor (carga, refresco o Realtime) sin pisar guardados en vuelo
  // ni versiones más recientes que la que ya se muestra.
  const applyServer = useCallback((data: RoutinePart[], at: string | null) => {
    if (pendingRef.current > 0) {
      staleRef.current = true;
      return;
    }
    freshRef.current = true;
    const current = updatedAtRef.current;
    if (at && current && isOlderOrEqual(at, current)) return;
    confirmedRef.current = data;
    commit(data);
    setMeta(at);
    writeCachedRoutine(data, at);
  }, [commit, setMeta]);

  // Carga inicial (si el servidor no pudo), refresco al volver a la app y cambios en vivo.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    // silent: refrescos en segundo plano, que nunca rompen lo que ya se ve.
    const load = async (silent: boolean) => {
      const epoch = epochRef.current;
      try {
        const row = await fetchRoutine(client, timeoutSignal());
        // Un fallo de red/permisos NUNCA debe sobrescribir los datos guardados.
        if (epoch !== epochRef.current) {
          // Hubo guardados mientras se leía: el resultado puede ser anterior; se relee al terminar.
          staleRef.current = true;
          if (pendingRef.current === 0) {
            // Nadie más releerá (no hay guardados que terminen): se relee ya, como hace settle().
            staleRef.current = false;
            setTimeout(() => loadRef.current?.(true), 0);
          }
        } else if (row) {
          applyServer(row.data, row.updatedAt);
        } else if (!silent) {
          // La BD está realmente vacía: usamos el respaldo y solo el entrenador lo persiste.
          confirmedRef.current = initialData;
          commit(initialData);
          // Se siembra en un efecto aparte, cuando el entrenador esté verificado (puede tardar más que esta carga).
          needsSeedRef.current = true;
          setSeedKey(k => k + 1);
        }
        setIsOffline(false);
      } catch {
        const cached = readCachedRoutine();
        const cachedAt = readCachedUpdatedAt();
        const current = updatedAtRef.current;
        // La copia local es la más reciente que conocemos (la página pudo venir de una caché antigua).
        const cachedIsNewer = cachedAt ? !current || !isOlderOrEqual(cachedAt, current) : !current;
        if (silent) {
          setIsOffline(true);
          if (cached && cachedIsNewer && pendingRef.current === 0) {
            freshRef.current = false;
            confirmedRef.current = cached;
            commit(cached);
            setMeta(cachedAt);
          }
          return;
        }
        if (cached) {
          freshRef.current = false;
          confirmedRef.current = cached;
          commit(cached);
          setMeta(cachedAt);
          setIsOffline(true);
        } else {
          setLoadError(true);
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    };
    loadRef.current = load;

    // Con datos del servidor también se comprueba en silencio: guarda la copia local y detecta que no hay conexión.
    load(!!initialRoutine && reloadKey === 0);

    const refresh = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);

    // Cambios de otros dispositivos (requiere Realtime activado para la tabla; si no, funciona el refresco al volver).
    const channel = client
      .channel('disco_cuarteto_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'disco_cuarteto', filter: 'id=eq.1' },
        payload => {
          const row = payload.new as { data?: unknown; updated_at?: string | null };
          // Realtime trae la fecha en formato Postgres ("... 10:34:30+00"): se normaliza a ISO.
          const ms = row.updated_at ? parseServerDate(row.updated_at) : NaN;
          const at = Number.isNaN(ms) ? null : new Date(ms).toISOString();
          if (isValidRoutine(row.data)) applyServer(row.data, at);
        }
      )
      .subscribe();

    return () => {
      if (!staleRef.current) loadRef.current = null; // con una relectura pendiente se conserva hasta que se reasigne
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const retryLoad = () => {
    setLoadError(false);
    setIsLoading(true);
    setReloadKey(k => k + 1);
  };

  // Escribe en la BD aplicando `mutate` sobre la última versión leída. Si la columna updated_at existe, la
  // escritura es condicional a que nadie haya guardado entretanto (se reintenta); la escritura debe afectar a 1 fila.
  // Aplica el timeout (10 s) a una escritura: una red mala falla (y se revierte) en vez de colgar la cola.
  const withTimeout = <T extends { abortSignal: (s: AbortSignal) => T }>(q: T): T => {
    const signal = timeoutSignal();
    return signal ? q.abortSignal(signal) : q;
  };

  const persist = async (client: NonNullable<typeof supabase>, mutate: Mutation, fallback: RoutinePart[]) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await fetchRoutine(client, timeoutSignal());
      const base = row?.data ?? fallback;
      const next = mutate(base);

      if (!row) {
        // BD vacía: se crea la fila.
        const upsert = (cols: string) =>
          withTimeout(client.from('disco_cuarteto').upsert({ id: 1, data: next }).select(cols));
        let res = await upsert('id, updated_at');
        if (res.error && (res.error.code === '42703' || /updated_at/.test(res.error.message))) res = await upsert('id');
        if (res.error) throw res.error;
        if (res.data?.length !== 1) throw new Error('No se guardó ninguna fila');
        const saved = (res.data[0] as unknown as { updated_at?: string }).updated_at;
        return { base, next, savedAt: saved ?? null };
      }

      let query = client.from('disco_cuarteto').update({ data: next }).eq('id', 1);
      if (row.updatedAt) query = query.eq('updated_at', row.updatedAt);
      const { data, error } = await withTimeout(query.select(row.updatedAt ? 'id, updated_at' : 'id'));
      if (error) throw error;
      if (data?.length === 1) {
        // Solo se usa la fecha del servidor: el reloj del cliente no sirve para comparar con ella.
        const saved = (data[0] as unknown as { updated_at?: string }).updated_at;
        return { base, next, savedAt: saved ?? null };
      }
      if (!row.updatedAt) break; // sin condición de versión, 0 filas = permisos o fila inexistente
    }
    throw new Error('No se pudo guardar');
  };

  // Al terminar todos los guardados, se relee si llegó algo del servidor mientras tanto.
  const settle = () => {
    if (pendingRef.current === 0 && staleRef.current) {
      staleRef.current = false;
      loadRef.current?.(true);
    }
  };

  // Guardado optimista, serializado: cada cambio se aplica al instante sobre el estado vigente y se escribe
  // en cola, releyendo la BD antes de cada escritura para no pisar lo de otros dispositivos ni lo anterior.
  // Si falla, se revierte con la mutación inversa (no con una foto), sin tocar otros cambios.
  const applyChange = (mutate: Mutation, okMessage: string, undoable = false) => {
    const before = liveRef.current;
    const after = mutate(before);
    commit(after);
    if (!isAdmin || !supabase) return;
    const client = supabase;

    const entry = { mutate };
    pendingMutsRef.current.push(entry);
    pendingRef.current++;
    epochRef.current++;
    const task = async () => {
      let result: Awaited<ReturnType<typeof persist>> | null = null;
      let unconfirmed = false; // timeout/abort: la escritura pudo llegar al servidor
      try {
        result = await persist(client, mutate, before);
      } catch (e) {
        result = null;
        unconfirmed = isAbortError(e);
      }
      pendingRef.current--;
      epochRef.current++;
      pendingMutsRef.current = pendingMutsRef.current.filter(e => e !== entry);
      try {
        if (result) {
          const { base, next, savedAt } = result;
          confirmedRef.current = next;
          if (savedAt) setMeta(savedAt);
          writeCachedRoutine(next, savedAt);
          if (pendingRef.current === 0) commit(next); // la versión guardada incluye lo de otros dispositivos
          showToast({
            message: okMessage,
            kind: 'ok',
            action: undoable
              ? { label: 'Deshacer', run: () => { setToast(null); applyChange(inverseMutation(base, next), 'Cambio deshecho'); } }
              : undefined,
          });
        } else {
          // Estado confirmado + mutaciones aún en cola: no pierde cambios pendientes ni recupera estados nunca guardados.
          commit(rebuildFromConfirmed(confirmedRef.current, pendingMutsRef.current.map(e => e.mutate)));
          staleRef.current = true; // se relee al terminar por si el servidor tiene algo más
          showToast({
            message: unconfirmed
              ? 'No se pudo confirmar el guardado; comprobando…'
              : 'No se pudo guardar. Se ha revertido el cambio.',
            kind: 'error',
          });
        }
      } catch {
        /* un fallo al actualizar la vista no debe bloquear la cola */
      } finally {
        settle();
      }
    };
    queueRef.current = queueRef.current.then(task).catch(() => {});
  };

  const mapPart = (partId: string, fn: (p: RoutinePart) => RoutinePart): Mutation =>
    routine => routine.map(part => (part.id === partId ? fn(part) : part));

  const updateCorrection = (partId: string, correctionId: string, newStatus: ColorState) => {
    const now = new Date().toISOString();
    applyChange(
      mapPart(partId, part => ({
        ...part,
        corrections: part.corrections.map(c => {
          if (c.id !== correctionId || c.status === newStatus) return c;
          const rest = { ...c };
          delete rest.masteredAt;
          return { ...rest, status: newStatus, statusAt: now, ...(newStatus === 'pink' ? { masteredAt: now } : {}) };
        }),
      })),
      'Estado actualizado'
    );
  };

  const assignCorrection = (partId: string, correctionId: string, who: string[]) =>
    applyChange(
      mapPart(partId, part => ({
        ...part,
        corrections: part.corrections.map(c => {
          if (c.id !== correctionId) return c;
          const rest = { ...c };
          delete rest.who;
          return who.length ? { ...rest, who } : rest;
        }),
      })),
      'Atletas actualizadas'
    );

  const addCorrection = (partId: string, text: string, who: string[]) => {
    const correction = {
      id: newCorrectionId(),
      text,
      status: 'red' as ColorState,
      statusAt: new Date().toISOString(),
      ...(who.length ? { who } : {}),
    };
    applyChange(
      // Idempotente: si la escritura ya llegó (timeout) y se reintenta, no se duplica.
      mapPart(partId, part =>
        part.corrections.some(c => c.id === correction.id) ? part : { ...part, corrections: [...part.corrections, correction] }
      ),
      'Corrección añadida'
    );
  };

  const reorderCorrection = (partId: string, activeId: string, overId: string) =>
    applyChange(
      mapPart(partId, part => {
        const from = part.corrections.findIndex(c => c.id === activeId);
        const to = part.corrections.findIndex(c => c.id === overId);
        if (from < 0 || to < 0 || from === to) return part;
        const corrections = [...part.corrections];
        corrections.splice(to, 0, corrections.splice(from, 1)[0]);
        return { ...part, corrections };
      }),
      'Orden actualizado'
    );

  const deleteCorrection = (partId: string, correctionId: string) =>
    applyChange(
      mapPart(partId, part => ({ ...part, corrections: part.corrections.filter(c => c.id !== correctionId) })),
      'Corrección eliminada',
      true
    );

  // Pestañas: flechas, Inicio y Fin mueven la selección (patrón ARIA de tabs).
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = VIEWS.length - 1;
    const target =
      e.key === 'ArrowRight' ? (index + 1) % VIEWS.length
      : e.key === 'ArrowLeft' ? (index + last) % VIEWS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    if (target < 0) return;
    e.preventDefault();
    setView(VIEWS[target][0]);
    document.getElementById(`${tabsId}-${VIEWS[target][0]}`)?.focus();
  };

  const totalCounts = routine.reduce((acc, part) => {
    part.corrections.filter(c => isAdmin || isFor(c, athlete)).forEach(c => acc[c.status]++);
    return acc;
  }, { red: 0, yellow: 0, green: 0, pink: 0 });

  const totalCorrections = totalCounts.red + totalCounts.yellow + totalCounts.green + totalCounts.pink;
  const allPink = totalCorrections > 0 && totalCounts.pink === totalCorrections;

  if (isLoading) {
    return (
      <div role="status" className="min-h-screen bg-page flex items-center justify-center text-ink-soft">
        Cargando programa…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="min-h-screen bg-page flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink font-semibold">No se pudo cargar el programa.</p>
        <p className="text-sm text-ink-soft">Revisa tu conexión. Tus datos guardados no se han modificado.</p>
        <button
          type="button"
          onClick={retryLoad}
          className="bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-page pb-24">
      <div className="sticky top-0 bg-page/90 backdrop-blur-md z-10 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 px-4 shadow-sm">
        <div className="max-w-md mx-auto">
          {isOffline && (
            <p role="status" className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-surface border border-line px-3 py-2 text-xs font-medium text-ink-soft">
              <WifiOff className="w-4 h-4" aria-hidden="true" />
              Sin conexión · mostrando la última versión guardada
            </p>
          )}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-extrabold text-ink tracking-tight">
              Programa Cuarteto
            </h1>
            {isAdmin && (
              <span className="flex items-center gap-1 text-xs font-semibold text-accent bg-surface border border-accent/30 rounded-full px-2.5 py-1">
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Modo entrenador
              </span>
            )}
          </div>
          <MainProgressBar counts={totalCounts} />
          <div className="mt-3">
            <StatusLegend />
          </div>
          {allPink ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-sm font-bold text-accent">
              <Sparkles className="w-4 h-4 motion-safe:animate-pulse" aria-hidden="true" />
              ¡Todo al rosa!
            </p>
          ) : (
            <p className="text-xs text-ink-soft mt-2 font-medium uppercase tracking-wider text-center">
              Objetivo: Todo al rosa
            </p>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-6">
        {updatedAt && <LastUpdated iso={updatedAt} />}
        <CoachBar />
        <Link
          href="/reglamento"
          className="mb-5 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          Consultar el reglamento
        </Link>
        <Link
          href={isAdmin || wantsCoach ? '/tecnica?entrenador=nico' : '/tecnica'}
          className="mb-5 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ClipboardList className="w-4 h-4" aria-hidden="true" />
          {isAdmin ? 'Técnica: puntuar elementos' : 'Técnica'}
        </Link>
        {!isAdmin && <InstallHint />}
        {!isAdmin && <AthleteFilter athlete={athlete} />}
        <div role="tablist" aria-label="Vista" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-track p-1">
          {VIEWS.map(([key, label], i) => (
            <button
              key={key}
              id={`${tabsId}-${key}`}
              type="button"
              role="tab"
              aria-selected={view === key}
              aria-controls={`${tabsId}-panel`}
              tabIndex={view === key ? 0 : -1}
              onClick={() => setView(key)}
              onKeyDown={e => onTabKeyDown(e, i)}
              className={`rounded-xl py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                view === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" tabIndex={0} id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${view}`}>
        {view === 'hoy' ? (
          <TodayView
            routine={routine}
            isAdmin={isAdmin}
            athlete={athlete}
            changes={changes}
            onUpdateCorrection={updateCorrection}
            onDeleteCorrection={deleteCorrection}
            onAssignCorrection={assignCorrection}
          />
        ) : (
          <>
            <WeeklyProgress routine={routine} />
            {routine.map(part => (
              <RoutineSection
                key={part.id}
                part={part}
                isAdmin={isAdmin}
                changes={changes}
                athlete={athlete}
                onAssignCorrection={assignCorrection}
                onUpdateCorrection={updateCorrection}
                onAddCorrection={addCorrection}
                onDeleteCorrection={deleteCorrection}
                onReorderCorrection={reorderCorrection}
              />
            ))}
          </>
        )}
        </div>
      </div>

      <div className="fixed bottom-4 inset-x-0 flex justify-center px-4 pointer-events-none">
        <div className="max-w-md w-full">
          {/* Dos regiones siempre presentes para que los lectores de pantalla anuncien el aviso al aparecer */}
          <div role="status">{toast?.kind === 'ok' && <ToastBox toast={toast} />}</div>
          <div role="alert">{toast?.kind === 'error' && <ToastBox toast={toast} />}</div>
        </div>
      </div>
    </main>
  );
}
