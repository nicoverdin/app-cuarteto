-- Sección "Técnica": sesiones de puntuación y puntuaciones por elemento / patinadora / grupo.
--
-- ESTADO: preparada, NO aplicada. La ruta /tecnica avisa de que faltan las tablas hasta que se ejecute.
-- Cómo ejecutarla: Supabase → SQL Editor → pegar y ejecutar (una transacción: si algo falla no se cambia nada).
-- Es re-ejecutable: no falla ni pierde datos si ya se aplicó antes (también sirve para migrar versiones anteriores).
-- Deshacer: drop table public.puntuaciones_tecnicas, public.sesiones_tecnicas cascade;

begin;

create table if not exists public.sesiones_tecnicas (
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
create table if not exists public.puntuaciones_tecnicas (
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

-- Migración de versiones anteriores -----------------------------------------------------------
-- (sin "elementos" en sesiones_tecnicas, o sin el check de ids). Es seguro repetirla.
alter table public.sesiones_tecnicas add column if not exists elementos text[] not null default '{}';

-- "elementos" solo puede tener ids no vacíos (sin atarlos al catálogo, que vive en la app).
alter table public.sesiones_tecnicas drop constraint if exists sesiones_tecnicas_elementos_ids;
alter table public.sesiones_tecnicas add constraint sesiones_tecnicas_elementos_ids
  check (array_position(elementos, null) is null and array_position(elementos, '') is null);

-- Límites de tamaño (re-ejecutable). "not valid": no revisa las filas que ya existan (no falla si alguna se pasa),
-- pero se aplica a toda inserción o modificación nueva.
alter table public.puntuaciones_tecnicas drop constraint if exists puntuaciones_tecnicas_elemento_len;
alter table public.puntuaciones_tecnicas add constraint puntuaciones_tecnicas_elemento_len check (char_length(elemento) <= 64) not valid;
alter table public.puntuaciones_tecnicas drop constraint if exists puntuaciones_tecnicas_atleta_len;
alter table public.puntuaciones_tecnicas add constraint puntuaciones_tecnicas_atleta_len check (char_length(atleta) <= 60) not valid;
alter table public.puntuaciones_tecnicas drop constraint if exists puntuaciones_tecnicas_extras_len;
alter table public.puntuaciones_tecnicas add constraint puntuaciones_tecnicas_extras_len check (cardinality(extras) <= 20) not valid;
alter table public.sesiones_tecnicas drop constraint if exists sesiones_tecnicas_elementos_len;
alter table public.sesiones_tecnicas add constraint sesiones_tecnicas_elementos_len check (cardinality(elementos) <= 50) not valid;

-- Marca de última actualización -----------------------------------------------------------------
create or replace function public.puntuaciones_tecnicas_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizada_en = now();
  return new;
end;
$$;

drop trigger if exists puntuaciones_tecnicas_touch on public.puntuaciones_tecnicas;
create trigger puntuaciones_tecnicas_touch
  before update on public.puntuaciones_tecnicas
  for each row execute function public.puntuaciones_tecnicas_touch();

-- Seguridad (RLS) ------------------------------------------------------------------------------
alter table public.sesiones_tecnicas      enable row level security;
alter table public.puntuaciones_tecnicas  enable row level security;

-- Mismo nombre que usa cerrar_escritura.sql; se borran también los nombres antiguos.
drop policy if exists "lectura publica sesiones"       on public.sesiones_tecnicas;
drop policy if exists "lectura publica puntuaciones"   on public.puntuaciones_tecnicas;
drop policy if exists "lectura publica"                on public.sesiones_tecnicas;
drop policy if exists "lectura publica"                on public.puntuaciones_tecnicas;
drop policy if exists "escritura abierta sesiones"     on public.sesiones_tecnicas;
drop policy if exists "escritura abierta puntuaciones" on public.puntuaciones_tecnicas;

create policy "lectura publica" on public.sesiones_tecnicas     for select to anon, authenticated using (true);
create policy "lectura publica" on public.puntuaciones_tecnicas for select to anon, authenticated using (true);

-- ESCRITURA: este script ya NO la abre. Sin política de escritura nadie puede modificar nada con la clave
-- anónima. Ejecuta después supabase/cerrar_escritura.sql, que da permiso de escritura solo al entrenador
-- (cuenta de Supabase Auth). Si ya tenías las políticas "escritura abierta", las borra más arriba y ese script
-- las sustituye.

commit;
