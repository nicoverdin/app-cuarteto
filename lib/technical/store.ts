import type { SupabaseClient } from '@supabase/supabase-js';
import { validateScore, type Score } from './score';

export interface TechSession {
  id: string;
  nombre: string;
  fecha: string;
  /** Elementos que se puntúan en la sesión; vacío = todos. */
  elementos: string[];
}

interface Row {
  elemento: string;
  atleta: string;
  nivel: number | null;
  qoe: number;
  extras: string[] | null;
}

const toScore = (r: Row): Score => ({
  elemento: r.elemento,
  atleta: r.atleta === '' ? null : r.atleta,
  nivel: r.nivel,
  qoe: r.qoe,
  extras: r.extras ?? [],
});

/** Postgres 42P01 / PostgREST PGRST205: las tablas aún no existen (SQL sin ejecutar). */
export const isMissingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';

/** Postgres 42703: falta una columna (SQL de migración desactualizado). */
export const isMissingColumn = (e: { code?: string } | null) => e?.code === '42703';

export async function listSessions(db: SupabaseClient): Promise<TechSession[]> {
  const { data, error } = await db
    .from('sesiones_tecnicas')
    .select('id, nombre, fecha, elementos')
    .order('fecha', { ascending: false })
    .order('creada_en', { ascending: false });
  if (error) throw error;
  return data as TechSession[];
}

export async function createSession(db: SupabaseClient, nombre: string, fecha: string, elementos: string[]): Promise<TechSession> {
  const { data, error } = await db
    .from('sesiones_tecnicas')
    .insert({ nombre, fecha, elementos })
    .select('id, nombre, fecha, elementos')
    .single();
  if (error) throw error;
  return data as TechSession;
}

export async function updateSessionElements(db: SupabaseClient, id: string, elementos: string[]) {
  const { error } = await db.from('sesiones_tecnicas').update({ elementos }).eq('id', id);
  if (error) throw error;
}

export async function deleteSession(db: SupabaseClient, id: string) {
  const { error } = await db.from('sesiones_tecnicas').delete().eq('id', id);
  if (error) throw error;
}

/** Carga las puntuaciones de una sesión. Descarta (y cuenta) las filas que no cumplen el catálogo. */
export async function loadScores(db: SupabaseClient, sessionId: string): Promise<{ scores: Score[]; ignored: number }> {
  const { data, error } = await db
    .from('puntuaciones_tecnicas')
    .select('elemento, atleta, nivel, qoe, extras')
    .eq('sesion_id', sessionId);
  if (error) throw error;
  const all = (data as Row[]).map(toScore);
  const scores = all.filter(s => validateScore(s) === null);
  return { scores, ignored: all.length - scores.length };
}

export async function saveScore(db: SupabaseClient, sessionId: string, s: Score) {
  const { error } = await db.from('puntuaciones_tecnicas').upsert(
    { sesion_id: sessionId, elemento: s.elemento, atleta: s.atleta ?? '', nivel: s.nivel, qoe: s.qoe, extras: s.extras },
    { onConflict: 'sesion_id,elemento,atleta' }
  );
  if (error) throw error;
}

/** Borra la puntuación de una patinadora (`atleta`), la del grupo (`null`) o, sin `atleta`, el elemento entero. */
export async function deleteScores(db: SupabaseClient, sessionId: string, elemento: string, atleta?: string | null) {
  let q = db.from('puntuaciones_tecnicas').delete().eq('sesion_id', sessionId).eq('elemento', elemento);
  if (atleta !== undefined) q = q.eq('atleta', atleta ?? '');
  const { error } = await q;
  if (error) throw error;
}
