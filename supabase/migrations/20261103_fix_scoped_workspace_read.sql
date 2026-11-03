-- Corrects SQLSTATE 55000: SQL alias c collided with the PL/pgSQL record c.
-- Replaces only the read function; does not modify data or scheduling.
-- Additive, service-role-only read. Does not modify rows, existing functions, cron or Google semantics.
-- A scope contains COMPLETE collections: stable positions + the existing global CAS commit protect writes.
create or replace function public.vouga_next_read_scoped(p_collections text[]) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare result jsonb; c record; items jsonb;
begin
  if p_collections is null or exists (
    select 1 from unnest(p_collections) as requested(name)
    where not exists (select 1 from vouga_next.collections as catalog_entry where catalog_entry.name=requested.name)
  ) then raise exception 'Invalid collection scope'; end if;
  select jsonb_build_object('schemaVersion',schema_version,'revision',revision)
    into result from vouga_next.workspace where singleton;
  if result is null then return null; end if;
  for c in select name,table_name from vouga_next.collections loop
    items := '[]'::jsonb;
    if c.name = any(p_collections) then
      execute format('select coalesce(jsonb_agg(data order by position,row_key), ''[]''::jsonb) from vouga_next.%I', c.table_name) into items;
    end if;
    result := result || jsonb_build_object(c.name,items);
  end loop;
  return result;
end; $$;
revoke all on function public.vouga_next_read_scoped(text[]) from public,anon,authenticated;
grant execute on function public.vouga_next_read_scoped(text[]) to service_role;
notify pgrst, 'reload schema';
