-- Añade la fecha de última modificación a disco_cuarteto para mostrarla en la app ("Actualizado hoy, 18:30").
--
-- ESTADO: preparada, NO aplicada. La app funciona igual sin ella (simplemente no muestra la fecha);
-- al ejecutarla aparece sola, sin volver a desplegar.
-- Cómo ejecutarla: Supabase → SQL Editor → pegar y ejecutar.
-- Nota: la fila actual recibirá la fecha en que ejecutes esto; a partir de ahí se actualiza sola en cada guardado.
-- Deshacer: drop trigger disco_cuarteto_set_updated_at on public.disco_cuarteto;
--           drop function public.set_updated_at();
--           alter table public.disco_cuarteto drop column updated_at;

begin;

alter table public.disco_cuarteto
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists disco_cuarteto_set_updated_at on public.disco_cuarteto;
create trigger disco_cuarteto_set_updated_at
  before update on public.disco_cuarteto
  for each row execute function public.set_updated_at();

commit;
