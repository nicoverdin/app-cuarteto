"use client";
import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserCheck } from 'lucide-react';
import { signIn, signOut, useCoach, useWantsCoach } from '../lib/auth';

const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// Acceso del entrenador. Solo aparece con ?entrenador=nico (para las alumnas no existe) y, una vez dentro,
// muestra la cuenta y «Salir». Los permisos reales los dan las políticas de la BD, no esta interfaz.
export default function CoachBar() {
  const coach = useCoach();
  const wants = useWantsCoach();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // cerrojo síncrono contra doble envío
  const [error, setError] = useState<string | null>(null);

  // Tras un acceso correcto el formulario sigue bloqueado hasta que se sabe si la cuenta es de entrenador
  // (la comprobación en la BD puede tardar unos segundos). Se libera en cuanto hay respuesta, o a los 12 s.
  useEffect(() => {
    if (!busy) return;
    const answered = coach.status !== 'out' && coach.status !== 'loading';
    const t = setTimeout(() => { busyRef.current = false; setBusy(false); }, answered ? 0 : 12000);
    return () => clearTimeout(t);
  }, [busy, coach.status]);

  if (coach.status === 'coach') {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-ink-soft">
          <UserCheck className="w-4 h-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">{coach.email ?? 'Entrenador'}</span>
        </span>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Salir
        </button>
      </div>
    );
  }

  if (!wants || coach.status === 'loading') return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    if (message) {
      setError(message);
      busyRef.current = false;
      setBusy(false);
    } else {
      setPassword(''); // el bloqueo se libera en el efecto de arriba
    }
  };

  return (
    <section aria-label="Acceso de entrenador" className="mb-5 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">Acceso de entrenador</h2>
      {coach.status === 'denied' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Esta cuenta ({coach.email}) no tiene permiso de entrenador.{' '}
          <button type="button" onClick={() => signOut()} className="font-semibold underline">Cambiar de cuenta</button>
        </p>
      )}
      {coach.status === 'unavailable' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Falta ejecutar <code>supabase/cerrar_escritura.sql</code> en Supabase.
        </p>
      )}
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block text-xs font-semibold text-ink-soft">
          Correo
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <p role="status" className="sr-only">{busy ? 'Entrando…' : ''}</p>
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LogIn className="w-4 h-4" aria-hidden="true" />
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
