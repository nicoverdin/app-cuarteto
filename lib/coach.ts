// Lógica pura del acceso de entrenador (sin React ni Supabase) para poder probarla.

export type CoachStatus =
  | 'loading' // comprobando la sesión
  | 'out' // sin sesión
  | 'coach' // sesión de entrenador verificada por la BD
  | 'denied' // sesión válida, pero esa cuenta no es de entrenador
  | 'unavailable'; // falta ejecutar supabase/cerrar_escritura.sql (no existe es_entrenador())

interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** Interpreta la respuesta de `rpc('es_entrenador')`. `network` = no se pudo hablar con la BD. */
export function classifyCoachCheck(res: RpcResult): CoachStatus | 'network' {
  if (!res.error) return res.data === true ? 'coach' : 'denied';
  // 42883 / PGRST202: la función no existe (SQL sin ejecutar).
  if (res.error.code === '42883' || res.error.code === 'PGRST202') return 'unavailable';
  return 'network';
}

/** Mensaje en español para un error de inicio de sesión. */
export function loginErrorMessage(error: { message?: string; status?: number } | null): string {
  const msg = error?.message ?? '';
  if (/invalid login credentials|invalid_credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar el correo de esta cuenta en Supabase.';
  if (error?.status === 429 || /rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espera un momento.';
  return 'No se pudo iniciar sesión. Revisa la conexión e inténtalo de nuevo.';
}
