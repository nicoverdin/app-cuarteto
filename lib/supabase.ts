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

/** Lee la rutina guardada. `null` = la BD está vacía; lanza si hay un error real. */
export async function fetchRoutine(client: SupabaseClient): Promise<RoutinePart[] | null> {
  const { data, error } = await client.from('disco_cuarteto').select('data').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data && isValidRoutine(data.data) ? data.data : null;
}
