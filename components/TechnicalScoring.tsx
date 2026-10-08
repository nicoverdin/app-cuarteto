"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, Users, User, Info } from 'lucide-react';
import { ATHLETES } from '../lib/athletes';
import { supabase } from '../lib/supabase';
import { CATALOG, CATALOG_SOURCE, QOE_VALUES, TechElement } from '../lib/technical/catalog';
import { ElementValue, Score, summarize, validateScore } from '../lib/technical/score';
import {
  TechSession, createSession, deleteScores, deleteSession, isMissingColumn, isMissingTable, listSessions, loadScores, saveScore,
  updateSessionElements,
} from '../lib/technical/store';

const isCoachUrl = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('entrenador') === 'nico';

const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const today = () => new Date().toISOString().slice(0, 10);

const selectCls =
  'w-full rounded-xl border border-line bg-surface px-2.5 py-2.5 text-sm font-semibold text-ink disabled:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function LevelSelect({ el, value, onChange, disabled, label, autoLabel }: {
  el: TechElement; value: number | null; onChange: (v: number | null) => void; disabled: boolean; label: string; autoLabel?: string;
}) {
  return (
    <select
      aria-label={label}
      className={selectCls}
      disabled={disabled}
      value={value === null ? '' : String(value)}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{autoLabel ?? '—'}</option>
      {el.levels.map((l, i) => (
        <option key={l.code} value={i}>{i === 0 ? 'Sin nivel' : l.code} · {l.base}</option>
      ))}
    </select>
  );
}

function QoeSelect({ value, onChange, disabled, label }: {
  value: number; onChange: (v: number) => void; disabled: boolean; label: string;
}) {
  return (
    <select aria-label={label} className={selectCls} disabled={disabled} value={value} onChange={e => onChange(Number(e.target.value))}>
      {QOE_VALUES.map(q => (
        <option key={q} value={q}>{q === 0 ? 'QOE 0' : `QOE ${signed(q)}`}</option>
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
  const isAdmin = useSyncExternalStore(() => () => {}, isCoachUrl, () => false);
  const [sessions, setSessions] = useState<TechSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState<string | null>(null);
  const [missingTables, setMissingTables] = useState(false);
  const [missingColumn, setMissingColumn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(today);
  const [newElements, setNewElements] = useState<string[]>(() => CATALOG.map(e => e.id));

  const fail = useCallback((e: unknown) => {
    if (isMissingTable(e as { code?: string })) setMissingTables(true);
    else if (isMissingColumn(e as { code?: string })) setMissingColumn(true);
    else setError('No se pudo guardar o cargar. Revisa la conexión e inténtalo de nuevo.');
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    listSessions(supabase)
      .then(list => {
        if (!alive) return;
        setSessions(list);
        setSessionId(list[0]?.id ?? null);
      })
      .catch(e => alive && fail(e))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [fail]);

  useEffect(() => {
    if (!supabase || !sessionId) return;
    let alive = true;
    loadScores(supabase, sessionId)
      .then(rows => alive && setScores(rows))
      .catch(e => alive && fail(e));
    return () => { alive = false; };
  }, [sessionId, fail]);

  const session = sessions.find(s => s.id === sessionId) ?? null;
  // Elementos de la sesión (vacío = todos). Solo estos se muestran y suman.
  const active = useMemo(
    () => CATALOG.filter(el => !session?.elementos.length || session.elementos.includes(el.id)),
    [session]
  );
  const summary = useMemo(() => summarize(scores, ATHLETES, active), [scores, active]);
  const find = (elemento: string, atleta: string | null) =>
    scores.find(s => s.elemento === elemento && s.atleta === atleta);

  // Guardado optimista con rollback si falla.
  const persist = async (next: Score) => {
    const reason = validateScore(next);
    if (reason || !supabase || !sessionId) { if (reason) setError(reason); return; }
    const prev = scores;
    setError(null);
    setScores([...prev.filter(s => !(s.elemento === next.elemento && s.atleta === next.atleta)), next]);
    try {
      await saveScore(supabase, sessionId, next);
    } catch (e) {
      setScores(prev);
      fail(e);
    }
  };

  const remove = async (elemento: string, atleta?: string | null) => {
    if (!supabase || !sessionId) return;
    const prev = scores;
    setError(null);
    setScores(prev.filter(s => !(s.elemento === elemento && (atleta === undefined || s.atleta === atleta))));
    try {
      await deleteScores(supabase, sessionId, elemento, atleta);
    } catch (e) {
      setScores(prev);
      fail(e);
    }
  };

  const addSession = async () => {
    const nombre = newName.trim();
    if (!supabase || !nombre) return;
    try {
      const created = await createSession(supabase, nombre, newDate || today(), newElements);
      setSessions(list => [created, ...list]);
      setSessionId(created.id);
      setScores([]);
      setNewName('');
      setNewElements(CATALOG.map(e => e.id));
      setCreating(false);
    } catch (e) {
      fail(e);
    }
  };

  // Añade o quita un elemento de la sesión actual. Quitarlo borra sus puntuaciones (con confirmación).
  const toggleElement = async (el: TechElement) => {
    if (!supabase || !session) return;
    const on = active.some(a => a.id === el.id);
    if (on && active.length === 1) return;
    if (on && scores.some(s => s.elemento === el.id) && !window.confirm(`¿Quitar ${el.name} y borrar sus puntuaciones de esta sesión?`)) return;
    const nextIds = on ? active.filter(a => a.id !== el.id).map(a => a.id) : CATALOG.filter(c => c.id === el.id || active.some(a => a.id === c.id)).map(c => c.id);
    const prevSessions = sessions;
    const prevScores = scores;
    setError(null);
    setSessions(list => list.map(s => (s.id === session.id ? { ...s, elementos: nextIds } : s)));
    if (on) setScores(list => list.filter(s => s.elemento !== el.id));
    try {
      if (on) await deleteScores(supabase, session.id, el.id);
      await updateSessionElements(supabase, session.id, nextIds);
    } catch (e) {
      setSessions(prevSessions);
      setScores(prevScores);
      fail(e);
    }
  };

  const removeSession = async () => {
    const current = sessions.find(s => s.id === sessionId);
    if (!supabase || !current) return;
    if (!window.confirm(`¿Borrar la sesión "${current.nombre}" y todas sus puntuaciones?`)) return;
    try {
      await deleteSession(supabase, current.id);
      const rest = sessions.filter(s => s.id !== current.id);
      setSessions(rest);
      setSessionId(rest[0]?.id ?? null);
      setScores([]);
    } catch (e) {
      fail(e);
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
      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm font-medium text-danger">
          {error}
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
                  onChange={e => { setScores([]); setSessionId(e.target.value); }}
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
                    onClick={() => toggleElement(el)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
                    <label key={el.id} className="flex items-center gap-2 rounded-lg bg-track px-2.5 py-2 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
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
                disabled={!newName.trim() || newElements.length === 0}
                className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Crear sesión
              </button>
            </form>
          )}

          {!loading && sessions.length === 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              {isAdmin ? 'Crea una sesión (competición o ensayo) para empezar a puntuar.' : 'Aún no hay sesiones puntuadas.'}
            </p>
          )}
        </section>
      )}

      {sessionId && !missingTables && !missingColumn && (
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
              const hasAny = scores.some(s => s.elemento === el.id);
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
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <LevelSelect
                        el={el}
                        label={`${el.name}: nivel del grupo`}
                        value={group?.nivel ?? null}
                        autoLabel={
                          sum.derivedLevel === null
                            ? 'Automático (faltan niveles)'
                            : `Automático (${sum.derivedLevel === 0 ? 'sin nivel' : el.levels[sum.derivedLevel].code})`
                        }
                        disabled={readOnly}
                        onChange={nivel => persist({ ...(group ?? base), nivel })}
                      />
                      <QoeSelect
                        label={`${el.name}: QOE del grupo`}
                        value={group?.qoe ?? 0}
                        disabled={readOnly}
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
                              <label key={x.id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2 text-xs font-semibold text-ink">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[var(--accent)]"
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
                          <li key={a} className="grid grid-cols-[4.5rem_1fr_1fr_3.5rem] items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-ink">{a}</span>
                            <LevelSelect
                              el={el}
                              label={`${el.name}: nivel de ${a}`}
                              value={row?.nivel ?? null}
                              disabled={readOnly}
                              onChange={nivel =>
                                nivel === null
                                  ? remove(el.id, a)
                                  : persist({ elemento: el.id, atleta: a, nivel, qoe: row?.qoe ?? 0, extras: [] })
                              }
                            />
                            <QoeSelect
                              label={`${el.name}: QOE de ${a}`}
                              value={row?.qoe ?? 0}
                              disabled={readOnly || !row}
                              onChange={qoe => row && persist({ ...row, qoe })}
                            />
                            <span className="text-right text-sm font-bold text-ink tabular-nums">{val ? fmt(val.total) : '—'}</span>
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
