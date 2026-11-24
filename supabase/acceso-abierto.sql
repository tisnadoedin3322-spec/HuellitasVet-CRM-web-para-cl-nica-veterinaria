-- Ejecútalo en Supabase (SQL Editor) DESPUÉS de schema.sql. Se puede ejecutar varias veces sin problema.
-- Proyecto académico con datos ficticios: deja el acceso abierto a propósito.
-- Para producción: cambia "anon, authenticated" por "authenticated" y agrega login con Supabase Auth.

-- 1) Permisos: en proyectos nuevos las tablas creadas con SQL no quedan abiertas a la API automáticamente
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;

-- 2) Seguridad por filas (RLS) con una política abierta en cada tabla
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acceso abierto proyecto academico" on public.%I', t);
    execute format('create policy "acceso abierto proyecto academico" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
