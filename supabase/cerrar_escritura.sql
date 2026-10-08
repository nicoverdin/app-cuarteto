-- Cierra la escritura abierta: solo el ENTRENADOR (cuenta de Supabase Auth) puede escribir; cualquiera puede leer.
--
-- ANTES de ejecutarlo (una sola vez, en el panel de Supabase):
--   1. Authentication → Users → "Add user" → "Create new user": correo y contraseña del entrenador
--      (marca "Auto Confirm User").
--   2. Authentication → Sign In / Providers → desactiva "Allow new users to sign up" (nadie más puede crear cuentas).
--      Aunque alguien lo hiciera, solo escribirían las cuentas de la tabla public.entrenadores de abajo.
--   3. Cambia el correo de la línea marcada con «EDITA» por el del paso 1.
-- Orden: ejecuta ANTES los demás scripts de supabase/ que uses (puntuaciones_tecnicas.sql, normalizar_correcciones.sql) y
-- este el ÚLTIMO; vuelve a ejecutarlo si creas tablas nuevas. Cómo ejecutarlo: SQL Editor → pegar y ejecutar. Va en una transacción; si el correo no existe, se cancela todo y
-- no se cambia nada (así no te quedas sin poder escribir). Se puede volver a ejecutar (p. ej. tras crear más tablas).
-- Después, el modo entrenador de la app (?entrenador=nico) pide correo y contraseña.
--
-- Tablas afectadas (si existen): disco_cuarteto, partes, correcciones, sesiones_tecnicas, puntuaciones_tecnicas.
-- OJO: borra TODAS las políticas que tuvieran esas tablas y las recrea (lectura pública + escritura del entrenador).
-- Deshacer escritura abierta (no recomendado): create policy "escritura abierta" on public.<tabla> for all to anon using (true) with check (true);

begin;

-- 1. Quién es entrenador ---------------------------------------------------------------------------
create table if not exists public.entrenadores (
  user_id uuid primary key references auth.users(id) on delete cascade
);
-- Con RLS activa y sin políticas, nadie puede leer ni escribir esta tabla con las claves públicas.
alter table public.entrenadores enable row level security;

-- EDITA: el correo de la cuenta del entrenador creada en el paso 1.
insert into public.entrenadores (user_id)
select id from auth.users where lower(email) = lower('CAMBIA_ESTE_CORREO@ejemplo.com')
on conflict do nothing;

do $$
begin
  if not exists (select 1 from public.entrenadores) then
    raise exception 'No hay ningún entrenador: crea el usuario en Authentication y pon su correo en la línea marcada «EDITA» de este archivo.';
  end if;
end $$;

-- 2. Función de comprobación (la usa la app y las políticas) ---------------------------------------
create or replace function public.es_entrenador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.entrenadores where user_id = auth.uid());
$$;

revoke all on function public.es_entrenador() from public;
grant execute on function public.es_entrenador() to anon, authenticated;

-- 3. Políticas: lectura pública, escritura solo del entrenador -------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['disco_cuarteto', 'partes', 'correcciones', 'sesiones_tecnicas', 'puntuaciones_tecnicas'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format(
      'create policy "escritura entrenador" on public.%I for all to authenticated using (public.es_entrenador()) with check (public.es_entrenador())',
      t
    );
  end loop;
end $$;

commit;
