"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, Users, User, Info, X } from 'lucide-react';
import { ATHLETES } from '../lib/athletes';
import { supabase } from '../lib/supabase';
import { CATALOG, CATALOG_SOURCE, QOE_VALUES, TechElement } from '../lib/technical/catalog';
import { ElementValue, Score, summarize, validateScore } from '../lib/technical/score';
import { createWriteQueue } from '../lib/technical/queue';
import {
  TechSession, createSession, deleteRows, deleteScores, deleteSession, isMissingColumn, isMissingTable, isTimeoutError, listSessions, loadScores, saveScore,
  updateSessionElements,
} from '../lib/technical/store';

const isCoachUrl = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('entrenador') === 'nico';

// subscribe estable (fuera del componente) para useSyncExternalStore.
const subscribe = () => () => {};

const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pad = (n: number) => String(n).padStart(2, '0');
// Fecha local (no UTC): entre 00:00 y 02:00 en España toISOString daría el día anterior.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const NO_SCORES: Score[] = [];

// text-base (16px): iOS hace zoom al enfocar campos con menos.
const selectCls =
  'w-full rounded-xl border border-line bg-surface px-2.5 py-2.5 text-base font-semibold text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const levelText = (el: TechElement, i: number) => `${i === 0 ? 'Sin nivel' : el.levels[i].code} · ${el.levels[i].base}`;
const qoeText = (q: number) => (q === 0 ? 'QOE 0' : `QOE ${signed(q)}`);

function LevelSelect({ el, value, onChange, readOnly, label, autoLabel }: {
  el: TechElement; value: number | null; onChange: (v: number | null) => void; readOnly: boolean; label: string; autoLabel?: string;
}) {
  // Solo lectura: texto plano, no un select que parece editable.
  if (readOnly) {
    return <span className="text-sm font-semibold text-ink">{value === null ? (autoLabel ?? '—') : levelText(el, value)}</span>;
  }
  return (
    <select
      aria-label={label}
      className={selectCls}
      value={value === null ? '' : String(value)}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{autoLabel ?? '—'}</option>
      {el.levels.map((l, i) => (
        <option key={l.code} value={i}>{levelText(el, i)}</option>
      ))}
    </select>
  );
}

function QoeSelect({ value, onChange, disabled, readOnly, label }: {
  value: number; onChange: (v: number) => void; disabled?: boolean; readOnly: boolean; label: string;
}) {
  if (readOnly) return <span className="text-sm font-semibold text-ink-soft">{qoeText(value)}</span>;
  return (
    <select aria-label={label} className={selectCls} disabled={disabled} value={value} onChange={e => onChange(Number(e.target.value))}>
      {QOE_VALUES.map(q => (
        <option key={q} value={q}>{qoeText(q)}</option>
      ))}
    </select>
  );
}

function Breakdown({ v }: { v: ElementValue }) {
  return (
    <span className="text-xs text-ink-muted">
      {fmt(v.base)} {v.qoe !== 0 && `${v.qoe > 0 ? '+' : '−'} ${fmt(Math.abs(v.qoe))}`}
      {v.bonus > 0 && ` + ${fmt(v.bonus)} extra`}
    </span>
  );
}

export default function TechnicalScoring() {
  const isAdmin = useSyncExternalStore(subscribe, isCoachUrl, () => false);
  const [sessions, setSessions] = useState<TechSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scores, setScores] = useState<Score[]>(NO_SCORES);
  // Sesión cuyas puntuaciones están cargadas; mientras no coincida con sessionId no se muestra ni se escribe nada.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Filas de la sesión que no cumplen el catálogo (se ignoran al calcular; el entrenador puede borrarlas).
  const [invalid, setInvalid] = useState<Score[]>([]);
  const [listError, setListError] = useState(false);
  const [listKey, setListKey] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  // Escrituras en cola o en vuelo: mientras haya, no se recarga (la lectura podría ser anterior a ellas).
  const [pendingWrites, setPendingWrites] = useState(0);
  const [loading, setLoading] = useState(!!supabase);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [missingTables, setMissingTables] = useState(false);
  const [missingColumn, setMissingColumn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(today);
  const [newElements, setNewElements] = useState<string[]>(() => CATALOG.map(e => e.id));

  // Sesión vigente, para descartar resultados de operaciones de otra sesión.
  const sessionRef = useRef<string | null>(null);
  // Última versión confirmada en la base de la sesión vigente (para revertir solo la fila que falló).
  const confirmedRef = useRef<Score[]>([]);
  const selectSession = useCallback((id: string | null) => {
    sessionRef.current = id;
    confirmedRef.current = [];
    setSessionId(id);
    setScores(NO_SCORES);
    setLoadedFor(null);
    setInvalid([]);
    setLoadError(null);
    setSaveError(null);
  }, []);

  const fail = useCallback((e: unknown, kind: 'load' | 'save') => {
    if (isMissingTable(e as { code?: string })) setMissingTables(true);
    else if (isMissingColumn(e as { code?: string })) setMissingColumn(true);
    else if (kind === 'load') setLoadError('No se pudieron cargar los datos. Revisa la conexión e inténtalo de nuevo.');
    else setSaveError('No se pudo guardar el cambio. Revisa la conexión e inténtalo de nuevo.');
  }, []);

  // Cola de escrituras optimistas por fila (lib/technical/queue.ts).
  const queueRef = useRef<ReturnType<typeof createWriteQueue<Score>> | null>(null);
  const mutate = (...args: Parameters<ReturnType<typeof createWriteQueue<Score>>>) => {
    queueRef.current ??= createWriteQueue<Score>({
      getSession: () => sessionRef.current,
      getConfirmed: () => confirmedRef.current,
      setConfirmed: list => { confirmedRef.current = list; },
      applyLocal: fn => { setSaveError(null); setScores(fn); },
      onError: e => {
        if (isTimeoutError(e)) {
          // El servidor pudo haber confirmado: avisa y reconcilia recargando cuando la cola se vacíe.
          setSaveError('No se pudo confirmar el guardado. Se comprobará el estado real.');
          const sid = sessionRef.current;
          queueRef.current?.idle().then(() => { if (sessionRef.current === sid) setReloadKey(k => k + 1); });
        } else fail(e, 'save');
      },
      onPending: setPendingWrites,
    });
    return queueRef.current(...args);
  };

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    listSessions(supabase)
      .then(list => {
        if (!alive) return;
        setSessions(list);
        selectSession(list[0]?.id ?? null);
      })
      .catch(e => {
        if (!alive) return;
        if (isMissingTable(e) || isMissingColumn(e)) fail(e, 'load');
        else setListError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [fail, selectSession, listKey]);

  useEffect(() => {
    if (!supabase || !sessionId) return;
    let alive = true;
    // Espera a que se vacíe la cola: una lectura anterior a una escritura pendiente reiniciaría el estado con datos viejos.
    (queueRef.current?.idle() ?? Promise.resolve())
      .then(() => (alive ? loadScores(supabase!, sessionId) : null))
      .then(res => {
        if (!alive || !res) return;
        // Si se editó mientras cargaba, la lectura puede ser anterior a esa escritura: se descarta y se relee al vaciarse la cola.
        if ((queueRef.current?.pending() ?? 0) > 0) {
          setReloadKey(k => k + 1);
          return;
        }
        const { scores: rows, invalid: bad } = res;
        // La recarga reconcilió el estado: el aviso de «se comprobará» ya no aplica.
        setSaveError(cur => (cur?.startsWith('No se pudo confirmar') ? null : cur));
        confirmedRef.current = rows;
        setScores(rows);
        setInvalid(bad);
        setLoadedFor(sessionId);
      })
      .catch(e => alive && fail(e, 'load'));
    return () => { alive = false; };
  }, [sessionId, reloadKey, fail]);

  const ready = !!sessionId && loadedFor === sessionId;
  const shown = ready ? scores : NO_SCORES;
  const session = sessions.find(s => s.id === sessionId) ?? null;
  // Elementos de la sesión (vacío = todos). Solo estos se muestran y suman.
  const active = useMemo(
    () => CATALOG.filter(el => !session?.elementos.length || session.elementos.includes(el.id)),
    [session]
  );
  const summary = useMemo(() => summarize(shown, ATHLETES, active), [shown, active]);
  const find = (elemento: string, atleta: string | null) =>
    shown.find(s => s.elemento === elemento && s.atleta === atleta);

  const sameRow = (a: Score, b: Score) => a.elemento === b.elemento && a.atleta === b.atleta;
  const withRow = (list: Score[], next: Score) => [...list.filter(s => !sameRow(s, next)), next];

  const persist = (next: Score) => {
    const sid = sessionRef.current;
    const reason = validateScore(next, ATHLETES);
    if (reason) { setSaveError(reason); return; }
    if (!supabase || !sid || !ready) return;
    const db = supabase;
    mutate(sid, next.elemento, [next.atleta], list => withRow(list, next), () => saveScore(db, sid, next), list => withRow(list, next));
  };

  const remove = (elemento: string, atleta?: string | null) => {
    const sid = sessionRef.current;
    if (!supabase || !sid || !ready) return;
    const db = supabase;
    const hit = (s: Score) => s.elemento === elemento && (atleta === undefined || s.atleta === atleta);
    mutate(
      sid, elemento, atleta === undefined ? [null, ...ATHLETES] : [atleta],
      list => list.filter(s => !hit(s)), () => deleteScores(db, sid, elemento, atleta), list => list.filter(s => !hit(s))
    );
  };

  const addSession = async () => {
    const nombre = newName.trim();
    if (!supabase || !nombre || submitting) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      const created = await createSession(supabase, nombre, newDate || today(), newElements);
      setSessions(list => [created, ...list]);
      selectSession(created.id);
      setNewName('');
      setNewElements(CATALOG.map(e => e.id));
      setCreating(false);
    } catch (e) {
      fail(e, 'save');
    } finally {
      setSubmitting(false);
    }
  };

  // Añade o quita un elemento de la sesión actual. Quitarlo borra sus puntuaciones (con confirmación).
  // Primero se actualiza `elementos` y solo después se borran las puntuaciones: si lo primero falla no se pierde nada.
  const toggleElement = async (el: TechElement) => {
    if (!supabase || !session || !ready || toggling) return;
    const db = supabase;
    const sid = session.id;
    const on = active.some(a => a.id === el.id);
    if (on && active.length === 1) return;
    if (on && scores.some(s => s.elemento === el.id) && !window.confirm(`¿Quitar ${el.name} y borrar sus puntuaciones de esta sesión?`)) return;
    const nextIds = on ? active.filter(a => a.id !== el.id).map(a => a.id) : CATALOG.filter(c => c.id === el.id || active.some(a => a.id === c.id)).map(c => c.id);
    const prevIds = session.elementos;
    setToggling(true);
    setSaveError(null);
    setSessions(list => list.map(s => (s.id === sid ? { ...s, elementos: nextIds } : s)));
    try {
      await updateSessionElements(db, sid, nextIds);
    } catch (e) {
      setSessions(list => list.map(s => (s.id === sid ? { ...s, elementos: prevIds } : s)));
      if (sessionRef.current === sid) fail(e, 'save');
      setToggling(false);
      return;
    }
    setToggling(false);
    if (on) {
      const hit = (s: Score) => s.elemento === el.id;
      mutate(sid, el.id, [null, ...ATHLETES], list => list.filter(s => !hit(s)), () => deleteScores(db, sid, el.id), list => list.filter(s => !hit(s)));
    }
  };

  const removeSession = async () => {
    const current = sessions.find(s => s.id === sessionId);
    if (!supabase || !current || submitting) return;
    if (!window.confirm(`¿Borrar la sesión "${current.nombre}" y todas sus puntuaciones?`)) return;
    setSubmitting(true);
    try {
      await deleteSession(supabase, current.id);
      const rest = sessions.filter(s => s.id !== current.id);
      setSessions(rest);
      selectSession(rest[0]?.id ?? null);
    } catch (e) {
      fail(e, 'save');
    } finally {
      setSubmitting(false);
    }
  };

  // Borra las filas no válidas de la sesión (con confirmación) y recarga.
  const cleanInvalid = async () => {
    const sid = sessionRef.current;
    if (!supabase || !sid || !ready || cleaning || pendingWrites > 0 || invalid.length === 0) return;
    if (!window.confirm(`¿Borrar ${invalid.length === 1 ? '1 fila no válida' : `${invalid.length} filas no válidas`} de esta sesión?`)) return;
    setCleaning(true);
    setSaveError(null);
    try {
      await deleteRows(supabase, sid, invalid);
      if (sessionRef.current === sid) setReloadKey(k => k + 1);
    } catch (e) {
      if (sessionRef.current === sid) {
        fail(e, 'save');
        setReloadKey(k => k + 1); // el borrado pudo quedar a medias: recarga para no dejar lista ni contador obsoletos
      }
    } finally {
      setCleaning(false);
    }
  };

  const coachQuery = isAdmin ? '?entrenador=nico' : '';

  return (
    <>
      <Link
        href={`/${coachQuery}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-accent rounded-md focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        Programa
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold text-ink tracking-tight">Técnica</h1>
      {isAdmin && (
        <>
      <p className="mt-1 text-sm text-ink-soft">
        Elementos del cuarteto {CATALOG_SOURCE.category.toLowerCase()} · valores {CATALOG_SOURCE.season}.
      </p>

      <details className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink">
          <Info className="w-4 h-4 text-accent" aria-hidden="true" />
          Cómo se puntúa
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            <b className="text-ink">Grupo:</b> el nivel y el QOE del cuarteto completo. Es lo que cuenta para el{' '}
            <b className="text-ink">total técnico</b>. Con «Automático», el nivel sale de las patinadoras: lo deben
            lograr 3 de 4 (Cluster y Línea) o las 4 (Traveling).
          </p>
          <p>
            <b className="text-ink">Individual:</b> nivel y QOE de cada patinadora, para ver quién confirma cada
            nivel. Sus totales son de seguimiento y no se suman al total técnico.
          </p>
          <p>
            <b className="text-ink">Valor</b> = base del nivel + puntos del QOE (de −3 a +3) + extra feature
            (solo Traveling; cuenta la más alta).
          </p>
          <p className="text-xs text-ink-muted">Fuente: {CATALOG_SOURCE.rules}; {CATALOG_SOURCE.values}.</p>
        </div>
      </details>
        </>
      )}

      {!supabase && (
        <p role="status" className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
          La base de datos no está configurada: la sección Técnica necesita Supabase.
        </p>
      )}
      {missingTables && (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm text-ink-soft">
          Faltan las tablas de esta sección. Ejecuta <code>supabase/puntuaciones_tecnicas.sql</code> en el SQL Editor de Supabase.
        </p>
      )}
      {missingColumn && (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm text-ink-soft">
          Falta una columna en la base de datos. Ejecuta en el SQL Editor de Supabase:{' '}
          <code className="break-words">alter table public.sesiones_tecnicas add column if not exists elementos text[] not null default &apos;{'{}'}&apos;;</code>
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm font-medium text-danger">
          {loadError}{' '}
          {sessionId && (
            <button
              type="button"
              disabled={pendingWrites > 0}
              onClick={() => { setLoadError(null); setReloadKey(k => k + 1); }}
              className="underline disabled:opacity-50"
            >
              Reintentar
            </button>
          )}
        </p>
      )}
      {saveError && (
        <div className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-20 mt-4">
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm font-medium text-danger shadow-lg">
            <span className="flex-1">{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              aria-label="Cerrar aviso"
              className="-my-2 -mr-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-danger"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </p>
        </div>
      )}
      {listError && (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm font-medium text-danger">
          No se pudieron cargar las sesiones. Revisa la conexión e inténtalo de nuevo.{' '}
          <button type="button" onClick={() => { setListError(false); setLoading(true); setListKey(k => k + 1); }} className="underline">
            Reintentar
          </button>
        </p>
      )}
      {isAdmin && invalid.length > 0 && (
        <p role="status" className="mt-4 text-xs text-ink-muted">
          {invalid.length === 1 ? 'Se ignoró 1 fila' : `Se ignoraron ${invalid.length} filas`} de esta sesión con datos no válidos.{' '}
          <button type="button" onClick={cleanInvalid} disabled={cleaning || !ready || pendingWrites > 0} className="font-semibold text-danger underline disabled:opacity-50">
            Limpiar filas no válidas
          </button>
        </p>
      )}

      {supabase && !missingTables && !missingColumn && (
        <section aria-label="Sesión" className="mt-5">
          {loading ? (
            <p className="text-sm text-ink-muted">Cargando…</p>
          ) : (
            <div className="flex items-center gap-2">
              {sessions.length > 0 && (
                <select
                  aria-label="Sesión"
                  className={selectCls}
                  value={sessionId ?? ''}
                  onChange={e => selectSession(e.target.value)}
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre} · {s.fecha.split('-').reverse().join('/')}</option>
                  ))}
                </select>
              )}
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setCreating(c => !c)}
                    aria-label="Nueva sesión"
                    className="shrink-0 rounded-xl border border-line bg-surface p-2.5 text-accent focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Plus className="w-5 h-5" aria-hidden="true" />
                  </button>
                  {sessionId && (
                    <button
                      type="button"
                      onClick={removeSession}
                      disabled={submitting}
                      aria-label="Borrar sesión"
                      className="shrink-0 rounded-xl border border-line bg-surface p-2.5 text-danger focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Trash2 className="w-5 h-5" aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {isAdmin && session && (
            <div role="group" aria-label="Elementos de esta sesión" className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-ink-soft">Elementos:</span>
              {CATALOG.map(el => {
                const on = active.some(a => a.id === el.id);
                return (
                  <button
                    key={el.id}
                    type="button"
                    aria-pressed={on}
                    disabled={toggling}
                    onClick={() => toggleElement(el)}
                    className={`min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-soft'
                    }`}
                  >
                    {el.name}
                  </button>
                );
              })}
            </div>
          )}

          {isAdmin && creating && (
            <form
              className="mt-3 space-y-2 rounded-2xl border border-line bg-surface p-3"
              onSubmit={e => { e.preventDefault(); addSession(); }}
            >
              <input
                aria-label="Nombre de la sesión"
                placeholder="Ej.: Campeonato de España"
                maxLength={80}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className={selectCls}
              />
              <input aria-label="Fecha" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={selectCls} />
              <fieldset>
                <legend className="text-xs font-semibold text-ink-soft">Elementos que se puntúan</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {CATALOG.map(el => (
                    <label key={el.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-track px-3 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                        checked={newElements.includes(el.id)}
                        onChange={() =>
                          setNewElements(cur => (cur.includes(el.id) ? cur.filter(id => id !== el.id) : [...cur, el.id]))
                        }
                      />
                      {el.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                type="submit"
                disabled={!newName.trim() || newElements.length === 0 || submitting}
                className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Crear sesión
              </button>
            </form>
          )}

          {!loading && !listError && sessions.length === 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              {isAdmin ? 'Crea una sesión (competición o ensayo) para empezar a puntuar.' : 'Aún no hay sesiones puntuadas.'}
            </p>
          )}
        </section>
      )}

      {sessionId && !ready && !loadError && !missingTables && !missingColumn && (
        <p role="status" className="mt-5 text-sm text-ink-muted">Cargando…</p>
      )}

      {sessionId && ready && !missingTables && !missingColumn && (
        <>
          <section aria-label="Totales" className="mt-5 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">Total técnico</h2>
              <p className="text-3xl font-extrabold text-accent tabular-nums">{fmt(summary.technicalTotal)}</p>
            </div>
            {isAdmin && <p className="mt-0.5 text-xs text-ink-muted">Suma de los valores de grupo.</p>}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
              {ATHLETES.map(a => (
                <div key={a} className="flex justify-between">
                  <dt className="text-ink-soft">{a}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{fmt(summary.athleteTotals[a])}</dd>
                </div>
              ))}
            </dl>
            {isAdmin && <p className="mt-1 text-xs text-ink-muted">Totales individuales: seguimiento, no suman al total técnico.</p>}
          </section>

          <div className="mt-5 space-y-4">
            {active.map(el => {
              const sum = summary.elements[el.id];
              const group = find(el.id, null);
              const hasAny = shown.some(s => s.elemento === el.id);
              const readOnly = !isAdmin;
              const base: Score = { elemento: el.id, atleta: null, nivel: null, qoe: 0, extras: [] };

              return (
                <article key={el.id} className="rounded-2xl border border-line bg-surface p-4">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-extrabold text-ink">{el.name}</h2>
                      {isAdmin && (
                        <p className="text-xs text-ink-muted">
                          Nivel confirmado por {el.minSkaters === 4 ? 'las 4 patinadoras' : `${el.minSkaters} de 4 patinadoras`}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-ink tabular-nums">{sum.group ? fmt(sum.group.total) : '—'}</p>
                      {sum.group && <Breakdown v={sum.group} />}
                    </div>
                  </header>

                  <div className="mt-3 rounded-xl bg-track p-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" /> Grupo
                    </h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                      <LevelSelect
                        el={el}
                        label={`${el.name}: nivel del grupo`}
                        value={group?.nivel ?? null}
                        autoLabel={
                          sum.derivedLevel === null
                            ? 'Automático (faltan niveles)'
                            : `Automático (${sum.derivedLevel === 0 ? 'sin nivel' : el.levels[sum.derivedLevel].code})`
                        }
                        readOnly={readOnly}
                        onChange={nivel => persist({ ...(group ?? base), nivel })}
                      />
                      <QoeSelect
                        label={`${el.name}: QOE del grupo`}
                        value={group?.qoe ?? 0}
                        readOnly={readOnly}
                        onChange={qoe => persist({ ...(group ?? base), qoe })}
                      />
                    </div>
                    {el.extras && (
                      <fieldset className="mt-2" disabled={readOnly}>
                        <legend className="text-xs font-semibold text-ink-soft">Extra features confirmadas (cuenta la más alta)</legend>
                        <div className="mt-1 grid grid-cols-2 gap-1.5">
                          {el.extras.map(x => {
                            const on = group?.extras.includes(x.id) ?? false;
                            return (
                              <label key={x.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-surface px-3 text-xs font-semibold text-ink">
                                <input
                                  type="checkbox"
                                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                                  checked={on}
                                  onChange={() => {
                                    const cur = group ?? base;
                                    const extras = on ? cur.extras.filter(id => id !== x.id) : [...cur.extras, x.id];
                                    persist({ ...cur, extras });
                                  }}
                                />
                                {x.label} <span className="text-ink-muted">+{x.bonus}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                    {!group && isAdmin && (
                      <p className="mt-2 text-xs text-ink-muted">Elige nivel o QOE para guardar la valoración del grupo.</p>
                    )}
                  </div>

                  <div className="mt-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                      <User className="w-3.5 h-3.5" aria-hidden="true" /> Individual
                      <span className="font-medium normal-case tracking-normal text-ink-muted">· {sum.scored}/4 con nivel</span>
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {ATHLETES.map(a => {
                        const row = find(el.id, a);
                        const val = sum.athletes[a];
                        return (
                          <li key={a} className="rounded-xl bg-track/50 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-ink">{a}</span>
                              {readOnly && (
                                <span className="flex items-center gap-2">
                                  <LevelSelect el={el} label="" value={row?.nivel ?? null} readOnly onChange={() => {}} />
                                  {row && <QoeSelect label="" value={row.qoe} readOnly onChange={() => {}} />}
                                </span>
                              )}
                              <span className="text-right text-sm font-bold text-ink tabular-nums">{val ? fmt(val.total) : '—'}</span>
                            </div>
                            {!readOnly && (
                              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                <LevelSelect
                                  el={el}
                                  label={`${el.name}: nivel de ${a}`}
                                  value={row?.nivel ?? null}
                                  readOnly={false}
                                  onChange={nivel =>
                                    nivel === null
                                      ? remove(el.id, a)
                                      : persist({ elemento: el.id, atleta: a, nivel, qoe: row?.qoe ?? 0, extras: [] })
                                  }
                                />
                                <QoeSelect
                                  label={`${el.name}: QOE de ${a}`}
                                  value={row?.qoe ?? 0}
                                  readOnly={false}
                                  disabled={!row}
                                  onChange={qoe => row && persist({ ...row, qoe })}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {isAdmin && hasAny && (
                    <button
                      type="button"
                      onClick={() => remove(el.id)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-danger rounded-md focus-visible:outline-2 focus-visible:outline-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Borrar puntuaciones de {el.name}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
