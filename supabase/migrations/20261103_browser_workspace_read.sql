-- Read-only browser payload. No rows, tables or existing functions are changed.
-- All calendar events are retained. Only non-rendered sync Activity and private
-- worker/OAuth/receipt collections are omitted from this separate read model.
-- Full reads, Agent, backups and all writes continue to use vouga_next_read.
create or replace function public.vouga_next_read_browser() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare result jsonb; c record; items jsonb;
begin
  select jsonb_build_object('schemaVersion',schema_version,'revision',revision)
    into result from vouga_next.workspace where singleton;
  if result is null then return null; end if;
  for c in select name,table_name from vouga_next.collections loop
    if c.name in ('externalConnections','integrationJobs','notificationDeliveries','oauthStates','telegramLinks','agentReceipts','captureReceipts') then
      items := '[]'::jsonb;
    elsif c.name = 'activity' then
      execute format($query$
        select coalesce(jsonb_agg(data order by position,row_key), '[]'::jsonb)
        from vouga_next.%I
        where data->>'entityType' in ('task','company')
          or nullif(data->>'projectId','') is not null
          or nullif(data->>'companyId','') is not null
      $query$, c.table_name) into items;
    else
      execute format('select coalesce(jsonb_agg(data order by position,row_key), ''[]''::jsonb) from vouga_next.%I',c.table_name) into items;
    end if;
    result := result || jsonb_build_object(c.name,items);
  end loop;
  return result;
end; $$;
revoke all on function public.vouga_next_read_browser() from public,anon,authenticated;
grant execute on function public.vouga_next_read_browser() to service_role;
notify pgrst, 'reload schema';
