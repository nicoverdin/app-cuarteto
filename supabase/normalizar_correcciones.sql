-- Migración: de una fila JSON (disco_cuarteto.data) a una fila por corrección.
--
-- ESTADO: preparada, NO aplicada. La app sigue usando disco_cuarteto hasta que se cambie su código.
-- Cómo ejecutarla: Supabase → SQL Editor → pegar y ejecutar (todo va en una transacción;
-- si algo falla, no se cambia nada). La tabla disco_cuarteto NO se toca, así que sirve de copia de seguridad.
-- Deshacer: drop table public.correcciones, public.partes cascade;  (y las dos funciones de abajo)

begin;

-- 1. Tablas ---------------------------------------------------------------
create table public.partes (
  id       text primary key,
  nombre   text not null,
  posicion int  not null
);

create table public.correcciones (
  id        text primary key,
  parte_id  text not null references public.partes(id) on delete cascade,
  texto     text not null check (char_length(btrim(texto)) between 1 and 500),
  estado    text not null default 'red' check (estado in ('red', 'yellow', 'green', 'pink')),
  posicion  int  not null,
  creada_en timestamptz not null default now()
);

create index correcciones_parte_posicion_idx on public.correcciones (parte_id, posicion);

-- 2. Copiar los datos actuales (el orden del array JSON pasa a ser "posicion") -------------
insert into public.partes (id, nombre, posicion)
select p.value ->> 'id', p.value ->> 'name', (p.ord - 1)::int
from public.disco_cuarteto d
cross join lateral jsonb_array_elements(d.data::jsonb) with ordinality as p(value, ord)
where d.id = 1;

insert into public.correcciones (id, parte_id, texto, estado, posicion)
select c.value ->> 'id', p.value ->> 'id', c.value ->> 'text', c.value ->> 'status', (c.ord - 1)::int
from public.disco_cuarteto d
cross join lateral jsonb_array_elements(d.data::jsonb) as p(value)
cross join lateral jsonb_array_elements(p.value -> 'corrections') with ordinality as c(value, ord)
where d.id = 1;

-- 3. Funciones atómicas (se ejecutan con los permisos de quien llama, así que respetan RLS) ------
-- Subir (-1) o bajar (+1) una corrección dentro de su parte, intercambiando posiciones.
create function public.mover_correccion(p_id text, p_direccion int)
returns void
language plpgsql
as $$
declare
  actual record;
  vecina record;
begin
  select * into actual from public.correcciones where id = p_id for update;
  if not found then return; end if;

  if p_direccion < 0 then
    select * into vecina from public.correcciones
    where parte_id = actual.parte_id and posicion < actual.posicion
    order by posicion desc limit 1 for update;
  else
    select * into vecina from public.correcciones
    where parte_id = actual.parte_id and posicion > actual.posicion
    order by posicion asc limit 1 for update;
  end if;
  if not found then return; end if;

  update public.correcciones set posicion = vecina.posicion where id = actual.id;
  update public.correcciones set posicion = actual.posicion where id = vecina.id;
end;
$$;

-- Añadir una corrección al final de su parte.
create function public.agregar_correccion(p_id text, p_parte_id text, p_texto text)
returns public.correcciones
language sql
as $$
  insert into public.correcciones (id, parte_id, texto, posicion)
  values (
    p_id, p_parte_id, btrim(p_texto),
    coalesce((select max(posicion) + 1 from public.correcciones where parte_id = p_parte_id), 0)
  )
  returning *;
$$;

-- 4. Seguridad (RLS) -----------------------------------------------------------------------------
alter table public.partes        enable row level security;
alter table public.correcciones  enable row level security;

-- Lectura pública (la vista del equipo no necesita sesión).
create policy "lectura publica partes"        on public.partes        for select to anon, authenticated using (true);
create policy "lectura publica correcciones"  on public.correcciones  for select to anon, authenticated using (true);

-- ESCRITURA: decisión pendiente. Sin una política de escritura, nadie puede modificar nada con la clave anónima.
-- Hoy la app no tiene login, así que la única forma de que el "modo entrenador" siga escribiendo sería abrir
-- la escritura a cualquiera que tenga la clave pública (es lo mismo que ocurre ahora con disco_cuarteto):
--
--   create policy "escritura abierta correcciones" on public.correcciones
--     for all to anon using (true) with check (true);
--
-- Más seguro: activar Supabase Auth, crear el usuario del entrenador y usar
--   for all to authenticated using (true) with check (true)
-- (o limitar a su uid: using (auth.uid() = '<uuid-del-entrenador>')).

-- 5. Tiempo real ---------------------------------------------------------------------------------
alter publication supabase_realtime add table public.partes, public.correcciones;

commit;
