-- Sección "Técnica": sesiones de puntuación y puntuaciones por elemento / patinadora / grupo.
--
-- ESTADO: preparada, NO aplicada. La ruta /tecnica avisa de que faltan las tablas hasta que se ejecute.
-- Cómo ejecutarla: Supabase → SQL Editor → pegar y ejecutar (una transacción: si algo falla no se cambia nada).
-- Deshacer: drop table public.puntuaciones_tecnicas, public.sesiones_tecnicas cascade;

begin;

create table public.sesiones_tecnicas (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null check (char_length(btrim(nombre)) between 1 and 80),
  fecha     date not null default current_date,
  -- ids de los elementos que se puntúan en esta sesión (catalog.ts). Vacío = todos.
  elementos text[] not null default '{}',
  creada_en timestamptz not null default now()
);

-- atleta = '' es la puntuación del GRUPO (cuarteto completo); si no, el nombre de la patinadora.
-- nivel = índice del nivel en lib/technical/catalog.ts (0 = sin nivel, 1 = Base, 2 = Nivel 1 …).
-- En el grupo, nivel null = "automático" (se deriva de los niveles de las patinadoras).
-- Los rangos reales (según elemento) los valida la app con el catálogo; aquí solo los límites duros.
create table public.puntuaciones_tecnicas (
  sesion_id  uuid not null references public.sesiones_tecnicas(id) on delete cascade,
  elemento   text not null,
  atleta     text not null default '',
  nivel      int  check (nivel between 0 and 9),
  qoe        int  not null default 0 check (qoe between -3 and 3),
  extras     text[] not null default '{}',
  actualizada_en timestamptz not null default now(),
  primary key (sesion_id, elemento, atleta),
  check (atleta = '' or nivel is not null),
  check (atleta = '' or extras = '{}')
);

create function public.puntuaciones_tecnicas_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizada_en = now();
  return new;
end;
$$;

create trigger puntuaciones_tecnicas_touch
  before update on public.puntuaciones_tecnicas
  for each row execute function public.puntuaciones_tecnicas_touch();

-- Seguridad (RLS) ------------------------------------------------------------------------------
alter table public.sesiones_tecnicas      enable row level security;
alter table public.puntuaciones_tecnicas  enable row level security;

create policy "lectura publica sesiones"       on public.sesiones_tecnicas     for select to anon, authenticated using (true);
create policy "lectura publica puntuaciones"   on public.puntuaciones_tecnicas for select to anon, authenticated using (true);

-- ESCRITURA ABIERTA con la clave anónima: la app no tiene login (el "modo entrenador" es solo una URL),
-- así que es el mismo nivel de protección que disco_cuarteto. Para cerrarla, activa Supabase Auth y cambia
-- "to anon" por "to authenticated" (o limita a auth.uid() del entrenador).
create policy "escritura abierta sesiones"     on public.sesiones_tecnicas     for all to anon using (true) with check (true);
create policy "escritura abierta puntuaciones" on public.puntuaciones_tecnicas for all to anon using (true) with check (true);

commit;

-- Si ya habías ejecutado una versión anterior de este archivo (sin "elementos"), ejecuta solo esto:
--   alter table public.sesiones_tecnicas add column if not exists elementos text[] not null default '{}';
