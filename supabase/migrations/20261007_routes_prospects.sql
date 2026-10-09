-- Vouga OS v2: shared routes, the shared prospect base and a cheap revision check.
-- Additive only: two new tables, one row in vouga_next.collections and four functions.
-- No existing table, row or function is changed. Run once in Dashboard > SQL Editor, after 20260927_vouga_next.sql.
begin;

-- The app keeps its last full read in memory and only downloads the workspace again when this number changed.
-- A full read is ~0.5 MB; asking for the revision costs a few bytes (Egress on the Free plan is 5 GB/month).
create or replace function public.vouga_next_revision() returns bigint
language sql stable security definer set search_path = pg_catalog as $$
  select revision from vouga_next.workspace where singleton;
$$;
revoke all on function public.vouga_next_revision() from public,anon,authenticated;
grant execute on function public.vouga_next_revision() to service_role;

-- Routes are a normal workspace collection: read and written by vouga_next_read / vouga_next_commit.
insert into vouga_next.collections values ('routes','visit_routes') on conflict(name) do nothing;
create table if not exists vouga_next.visit_routes (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.visit_routes enable row level security;
revoke all on vouga_next.visit_routes from public, anon, authenticated, service_role;
alter table vouga_next.visit_routes add column if not exists owner_id text generated always as (data->>'ownerId') stored;
create index if not exists visit_routes_owner_id_idx on vouga_next.visit_routes(owner_id);

-- Prospects are NOT a workspace collection: vouga_next_read would load all of them on every request.
-- They are read by map area or by id through the functions below.
create table if not exists vouga_next.prospects (
  id text primary key check(length(id) between 1 and 300),
  data jsonb not null check(jsonb_typeof(data)='object'),
  lat double precision generated always as ((data->>'lat')::double precision) stored,
  lng double precision generated always as ((data->>'lng')::double precision) stored,
  sector text generated always as (data->>'group') stored,
  organization_id text generated always as (data->>'organizationId') stored,
  updated_at timestamptz not null default now()
);
alter table vouga_next.prospects enable row level security;
revoke all on vouga_next.prospects from public, anon, authenticated, service_role;
create index if not exists prospects_position_idx on vouga_next.prospects(lat,lng);
create index if not exists prospects_sector_idx on vouga_next.prospects(sector);

create or replace function public.vouga_next_prospects_query(
  p_min_lat double precision, p_max_lat double precision, p_min_lng double precision, p_max_lng double precision,
  p_ids text[], p_limit integer
) returns jsonb
language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(data), '[]'::jsonb) from (
    select p.data from vouga_next.prospects p
    where (p_ids is null or p.id = any(p_ids))
      and (p_min_lat is null or p.lat between p_min_lat and p_max_lat)
      and (p_min_lng is null or p.lng between p_min_lng and p_max_lng)
    order by p.id
    limit least(greatest(coalesce(p_limit, 5000), 1), 20000)
  ) rows;
$$;

create or replace function public.vouga_next_prospects_upsert(p_items jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog as $$
declare item jsonb; written integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'Invalid prospects' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) is distinct from 'object' or nullif(item->>'id','') is null
      or jsonb_typeof(item->'lat') is distinct from 'number' or jsonb_typeof(item->'lng') is distinct from 'number' then
      raise exception 'Invalid prospect' using errcode='22023';
    end if;
    insert into vouga_next.prospects(id,data,updated_at) values(item->>'id',item,now())
      on conflict(id) do update set data=excluded.data,updated_at=now();
    written := written + 1;
  end loop;
  return written;
end; $$;

create or replace function public.vouga_next_prospects_delete(p_ids text[]) returns integer
language plpgsql security definer set search_path = pg_catalog as $$
declare removed integer;
begin
  delete from vouga_next.prospects where id = any(p_ids);
  get diagnostics removed = row_count;
  return removed;
end; $$;

revoke all on function public.vouga_next_prospects_query(double precision,double precision,double precision,double precision,text[],integer) from public,anon,authenticated;
revoke all on function public.vouga_next_prospects_upsert(jsonb) from public,anon,authenticated;
revoke all on function public.vouga_next_prospects_delete(text[]) from public,anon,authenticated;
grant execute on function public.vouga_next_prospects_query(double precision,double precision,double precision,double precision,text[],integer) to service_role;
grant execute on function public.vouga_next_prospects_upsert(jsonb) to service_role;
grant execute on function public.vouga_next_prospects_delete(text[]) to service_role;
commit;
