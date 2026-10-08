"use client";
import { useSyncExternalStore } from 'react';
import { supabase, timeoutSignal } from './supabase';
import { classifyCoachCheck, loginErrorMessage, CoachStatus } from './coach';

// Acceso del entrenador con Supabase Auth. La seguridad real son las políticas RLS (supabase/cerrar_escritura.sql):
// esto solo decide qué muestra la interfaz. El estado se guarda en un store de módulo, como lib/athletes.ts.

export interface CoachState {
  status: CoachStatus;
  email: string | null;
}

const LOADING: CoachState = { status: 'loading', email: null };
let state: CoachState = LOADING;
const listeners = new Set<() => void>();
let started = false;

const set = (next: CoachState) => {
  if (next.status === state.status && next.email === state.email) return;
  state = next;
  listeners.forEach(l => l());
};

// Última cuenta verificada como entrenador en este dispositivo: sirve sin conexión (solo para la interfaz;
// sin red tampoco se puede guardar nada).
const CACHE_KEY = 'cuarteto:coach-uid';
const readCache = () => {
  try { return localStorage.getItem(CACHE_KEY); } catch { return null; }
};
const writeCache = (uid: string | null) => {
  try {
    if (uid) localStorage.setItem(CACHE_KEY, uid);
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* almacenamiento no disponible */ }
};

// Cada resolución lleva un número: si mientras comprueba el rol llega un login/logout, el resultado viejo se descarta.
let generation = 0;

async function resolve(session: { user: { id: string; email?: string } } | null) {
  const mine = ++generation;
  if (!supabase) return set({ status: 'out', email: null });
  if (!session) {
    writeCache(null);
    return set({ status: 'out', email: null });
  }
  const email = session.user.email ?? null;
  const sig = timeoutSignal();
  const res = await supabase.rpc('es_entrenador').abortSignal(sig as AbortSignal);
  if (mine !== generation) return;
  const verdict = classifyCoachCheck(res);
  if (verdict === 'network') {
    // Sin red: nos fiamos de la última verificación de esta misma cuenta.
    return set({ status: readCache() === session.user.id ? 'coach' : 'out', email });
  }
  writeCache(verdict === 'coach' ? session.user.id : null);
  set({ status: verdict, email });
}

function start() {
  if (started || !supabase || typeof window === 'undefined') return;
  started = true;
  const client = supabase;
  client.auth.getSession().then(({ data }) => resolve(data.session)).catch(() => set({ status: 'out', email: null }));
  // Dentro del callback no se deben hacer otras llamadas a Supabase (bloqueo): se difiere.
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => { resolve(session).catch(() => set({ status: 'out', email: null })); }, 0);
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  start();
  return () => { listeners.delete(l); };
};

/** Estado del acceso de entrenador. En servidor y en la primera pintura es siempre `loading`. */
export const useCoach = (): CoachState => useSyncExternalStore(subscribe, () => state, () => LOADING);

/** ¿La URL pide el modo entrenador (?entrenador=nico)? Solo muestra el formulario de acceso; no da permisos. */
const wantsCoachNow = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('entrenador') === 'nico';
export const useWantsCoach = () => useSyncExternalStore(() => () => {}, wantsCoachNow, () => false);

/** Devuelve un mensaje de error en español, o null si el acceso fue bien. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'La base de datos no está configurada.';
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? loginErrorMessage(error) : null;
  } catch {
    return loginErrorMessage(null);
  }
}

export async function signOut() {
  if (!supabase) return;
  writeCache(null);
  await supabase.auth.signOut().catch(() => {});
}
