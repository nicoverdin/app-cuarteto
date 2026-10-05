"use client";
import { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { UserCheck, WifiOff, Sparkles, BookOpen } from 'lucide-react';
import { RoutinePart, ColorState } from '../types';
import RoutineSection from '../components/RoutineSection';
import InstallHint from '../components/InstallHint';
import LastUpdated from '../components/LastUpdated';
import AthleteFilter from '../components/AthleteFilter';
import TodayView from '../components/TodayView';
import WeeklyProgress from '../components/WeeklyProgress';
import { isFor, useAthlete } from '../lib/athletes';
import { MainProgressBar, StatusLegend } from '../components/ProgressCharts';
import { supabase, fetchRoutine } from '../lib/supabase';
import { diffAgainst, getSeen, getServerSeen, markSeen, reloadSeenBaseline, subscribeSeen } from '../lib/changes';
import { initialData, isValidRoutine, newCorrectionId, readCachedRoutine, readCachedUpdatedAt, writeCachedRoutine } from '../lib/routine';

interface Toast {
  message: string;
  kind: 'ok' | 'error';
  action?: { label: string; run: () => void };
}

type Mutation = (routine: RoutinePart[]) => RoutinePart[];

const isCoachUrl = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('entrenador') === 'nico';

// Registra el service worker (solo producción) para poder abrir la app sin conexión.
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
}

interface Props {
  initialRoutine: RoutinePart[] | null;
  initialUpdatedAt: string | null;
}

export default function ClientPage({ initialRoutine, initialUpdatedAt }: Props) {
  const [routine, setRoutine] = useState<RoutinePart[]>(initialRoutine ?? (supabase ? [] : initialData));
  // false en servidor/hidratación, se resuelve en el cliente sin setState en un efecto
  const isAdmin = useSyncExternalStore(() => () => {}, isCoachUrl, () => false);
  const [isLoading, setIsLoading] = useState(!initialRoutine && !!supabase);
  const [loadError, setLoadError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [isOffline, setIsOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<'rutina' | 'hoy'>('rutina');
  const athlete = useAthlete();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useServiceWorker();

  // Novedades desde la última vez que la atleta usó la app (el entrenador no las necesita).
  const seenRaw = useSyncExternalStore(subscribeSeen, getSeen, getServerSeen);
  const changes = useMemo(() => (isAdmin ? {} : diffAgainst(seenRaw, routine)), [isAdmin, seenRaw, routine]);
  const routineRef = useRef(routine);
  useEffect(() => {
    routineRef.current = routine;
  }, [routine]);
  useEffect(() => {
    if (isAdmin) return;
    // Al salir se guarda lo que se ha visto; al volver, la base de comparación se actualiza.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') markSeen(routineRef.current);
      else reloadSeenBaseline();
    };
    const onPageHide = () => markSeen(routineRef.current);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isAdmin]);

  const showToast = useCallback((t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.action ? 6000 : 3000);
  }, []);

  // Guardamos la última versión conocida para poder abrir la app sin conexión.
  useEffect(() => {
    if (initialRoutine) writeCachedRoutine(initialRoutine, initialUpdatedAt);
  }, [initialRoutine, initialUpdatedAt]);

  // Carga inicial (si el servidor no pudo), refresco al volver a la app y cambios en vivo.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    // silent: refrescos en segundo plano, que nunca rompen lo que ya se ve.
    const load = async (silent: boolean) => {
      try {
        const row = await fetchRoutine(client);
        // Un fallo de red/permisos NUNCA debe sobrescribir los datos guardados.
        if (row) {
          setRoutine(row.data);
          setUpdatedAt(row.updatedAt);
          writeCachedRoutine(row.data, row.updatedAt);
        } else if (!silent) {
          // La BD está realmente vacía: usamos el respaldo y solo el entrenador lo persiste.
          setRoutine(initialData);
          if (isCoachUrl()) {
            await client.from('disco_cuarteto').update({ data: initialData }).eq('id', 1);
          }
        }
        setIsOffline(false);
      } catch {
        if (silent) return;
        const cached = readCachedRoutine();
        if (cached) {
          setRoutine(cached);
          setUpdatedAt(readCachedUpdatedAt());
          setIsOffline(true);
        } else {
          setLoadError(true);
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    };

    if (!initialRoutine || reloadKey > 0) load(false);

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
          if (isValidRoutine(row.data)) {
            setRoutine(row.data);
            setUpdatedAt(row.updated_at ?? null);
            writeCachedRoutine(row.data, row.updated_at);
          }
        }
      )
      .subscribe();

    return () => {
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

  // Guardado optimista con rollback. Antes de escribir se relee la versión más reciente de la BD
  // y se aplica el cambio sobre ella, para no pisar lo que otro dispositivo haya cambiado.
  const applyChange = async (mutate: Mutation, okMessage: string, undoable = false) => {
    const previous = routine;
    setRoutine(mutate(previous));
    if (!isAdmin || !supabase) return;

    try {
      const base = (await fetchRoutine(supabase))?.data ?? previous;
      const next = mutate(base);
      const { error } = await supabase.from('disco_cuarteto').update({ data: next }).eq('id', 1);
      if (error) throw error;

      const savedAt = new Date().toISOString();
      setRoutine(next);
      setUpdatedAt(savedAt);
      writeCachedRoutine(next, savedAt);
      showToast({
        message: okMessage,
        kind: 'ok',
        action: undoable
          ? { label: 'Deshacer', run: () => { setToast(null); applyChange(() => base, 'Cambio deshecho'); } }
          : undefined,
      });
    } catch {
      setRoutine(previous);
      showToast({ message: 'No se pudo guardar. Se ha revertido el cambio.', kind: 'error' });
    }
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
          const { masteredAt: _previous, ...rest } = c;
          void _previous;
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
          const { who: _previous, ...rest } = c;
          void _previous;
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
      mapPart(partId, part => ({ ...part, corrections: [...part.corrections, correction] })),
      'Corrección añadida'
    );
  };

  const moveCorrection = (partId: string, correctionId: string, direction: -1 | 1) =>
    applyChange(
      mapPart(partId, part => {
        const from = part.corrections.findIndex(c => c.id === correctionId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= part.corrections.length) return part;
        const corrections = [...part.corrections];
        [corrections[from], corrections[to]] = [corrections[to], corrections[from]];
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
        <Link
          href="/reglamento"
          className="mb-5 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          Consultar el reglamento
        </Link>
        {!isAdmin && <InstallHint />}
        {!isAdmin && <AthleteFilter athlete={athlete} />}
        <div role="tablist" aria-label="Vista" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-track p-1">
          {([['rutina', 'Rutina'], ['hoy', 'Para trabajar']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`rounded-xl py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                view === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
            onMoveCorrection={moveCorrection}
          />
        ))}
          </>
        )}
      </div>

      <div aria-live="polite" role="status" className="fixed bottom-4 inset-x-0 flex justify-center px-4 pointer-events-none">
        {toast && (
          <div
            className={`pointer-events-auto max-w-md w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg text-on-toast ${
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
        )}
      </div>
    </main>
  );
}
