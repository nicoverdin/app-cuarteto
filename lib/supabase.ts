import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RoutinePart } from '../types';
import { isValidRoutine } from './routine';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Cliente seguro: es null si las variables no están (p. ej. en el build).
// Sin sesión de usuario: la app no usa auth, así que no persistimos nada.
export const supabase: SupabaseClient | null = url.startsWith('http')
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export interface RoutineRow {
  data: RoutinePart[];
  /** ISO de la última modificación; null si la tabla aún no tiene la columna updated_at. */
  updatedAt: string | null;
}

/** Lee la rutina guardada. `null` = la BD está vacía; lanza si hay un error real. */
export async function fetchRoutine(client: SupabaseClient): Promise<RoutineRow | null> {
  const query = (columns: string) =>
    client.from('disco_cuarteto').select(columns).eq('id', 1).maybeSingle();

  let { data, error } = await query('data, updated_at');
  // 42703 = la columna no existe todavía (SQL de supabase/agregar_updated_at.sql sin ejecutar): seguimos sin fecha.
  if (error && (error.code === '42703' || /updated_at/.test(error.message))) {
    ({ data, error } = await query('data'));
  }
  if (error) throw error;

  const row = data as unknown as { data?: unknown; updated_at?: string | null } | null;
  return row && isValidRoutine(row.data) ? { data: row.data, updatedAt: row.updated_at ?? null } : null;
}
