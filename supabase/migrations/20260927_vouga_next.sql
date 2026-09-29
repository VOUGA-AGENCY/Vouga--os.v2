-- Vouga OS v2: isolated storage in the EXISTING Supabase project.
-- Run this file once in Dashboard > SQL Editor. No legacy table is altered.
-- Rows retain the domain payload in JSONB; queryable CRM fields are generated below.
-- Only service_role can call the two API functions. Browser keys cannot read these data.
begin;
create schema if not exists vouga_next;
revoke all on schema vouga_next from public, anon, authenticated;
create table if not exists vouga_next.workspace (
  singleton boolean primary key default true check(singleton),
  revision bigint not null check(revision>=0),
  schema_version integer not null check(schema_version=5)
);
create table if not exists vouga_next.collections (
  name text primary key,
  table_name text not null unique
);
create table if not exists vouga_next.mutations (
  id uuid primary key, fingerprint text not null, revision bigint not null,
  created_at timestamptz not null default now()
);
insert into vouga_next.collections values ('members','members') on conflict(name) do nothing;
create table if not exists vouga_next.members (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.members enable row level security;
revoke all on vouga_next.members from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('accounts','accounts') on conflict(name) do nothing;
create table if not exists vouga_next.accounts (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.accounts enable row level security;
revoke all on vouga_next.accounts from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('sessions','sessions') on conflict(name) do nothing;
create table if not exists vouga_next.sessions (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.sessions enable row level security;
revoke all on vouga_next.sessions from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('organizations','companies') on conflict(name) do nothing;
create table if not exists vouga_next.companies (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.companies enable row level security;
revoke all on vouga_next.companies from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('contacts','contacts') on conflict(name) do nothing;
create table if not exists vouga_next.contacts (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.contacts enable row level security;
revoke all on vouga_next.contacts from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('interactions','company_interactions') on conflict(name) do nothing;
create table if not exists vouga_next.company_interactions (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.company_interactions enable row level security;
revoke all on vouga_next.company_interactions from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('projects','projects') on conflict(name) do nothing;
create table if not exists vouga_next.projects (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.projects enable row level security;
revoke all on vouga_next.projects from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('tasks','tasks') on conflict(name) do nothing;
create table if not exists vouga_next.tasks (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.tasks enable row level security;
revoke all on vouga_next.tasks from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('taskComments','task_comments') on conflict(name) do nothing;
create table if not exists vouga_next.task_comments (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.task_comments enable row level security;
revoke all on vouga_next.task_comments from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('taskAttachments','task_attachments') on conflict(name) do nothing;
create table if not exists vouga_next.task_attachments (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.task_attachments enable row level security;
revoke all on vouga_next.task_attachments from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('taskActivity','task_history') on conflict(name) do nothing;
create table if not exists vouga_next.task_history (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.task_history enable row level security;
revoke all on vouga_next.task_history from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('meetings','calendar_events') on conflict(name) do nothing;
create table if not exists vouga_next.calendar_events (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.calendar_events enable row level security;
revoke all on vouga_next.calendar_events from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('updates','project_updates') on conflict(name) do nothing;
create table if not exists vouga_next.project_updates (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.project_updates enable row level security;
revoke all on vouga_next.project_updates from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('notes','notes') on conflict(name) do nothing;
create table if not exists vouga_next.notes (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.notes enable row level security;
revoke all on vouga_next.notes from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('inbox','inbox') on conflict(name) do nothing;
create table if not exists vouga_next.inbox (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.inbox enable row level security;
revoke all on vouga_next.inbox from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('reminders','reminders') on conflict(name) do nothing;
create table if not exists vouga_next.reminders (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.reminders enable row level security;
revoke all on vouga_next.reminders from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('pullRequests','pull_requests') on conflict(name) do nothing;
create table if not exists vouga_next.pull_requests (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.pull_requests enable row level security;
revoke all on vouga_next.pull_requests from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('reminderReceipts','reminder_receipts') on conflict(name) do nothing;
create table if not exists vouga_next.reminder_receipts (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.reminder_receipts enable row level security;
revoke all on vouga_next.reminder_receipts from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('activity','activity_events') on conflict(name) do nothing;
create table if not exists vouga_next.activity_events (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.activity_events enable row level security;
revoke all on vouga_next.activity_events from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('externalConnections','external_connections') on conflict(name) do nothing;
create table if not exists vouga_next.external_connections (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.external_connections enable row level security;
revoke all on vouga_next.external_connections from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('integrationJobs','integration_jobs') on conflict(name) do nothing;
create table if not exists vouga_next.integration_jobs (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.integration_jobs enable row level security;
revoke all on vouga_next.integration_jobs from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('pendingActions','pending_actions') on conflict(name) do nothing;
create table if not exists vouga_next.pending_actions (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.pending_actions enable row level security;
revoke all on vouga_next.pending_actions from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('notificationDeliveries','notification_deliveries') on conflict(name) do nothing;
create table if not exists vouga_next.notification_deliveries (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.notification_deliveries enable row level security;
revoke all on vouga_next.notification_deliveries from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('oauthStates','oauth_states') on conflict(name) do nothing;
create table if not exists vouga_next.oauth_states (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.oauth_states enable row level security;
revoke all on vouga_next.oauth_states from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('telegramLinks','telegram_links') on conflict(name) do nothing;
create table if not exists vouga_next.telegram_links (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.telegram_links enable row level security;
revoke all on vouga_next.telegram_links from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('agentReceipts','agent_receipts') on conflict(name) do nothing;
create table if not exists vouga_next.agent_receipts (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.agent_receipts enable row level security;
revoke all on vouga_next.agent_receipts from public, anon, authenticated, service_role;
insert into vouga_next.collections values ('captureReceipts','capture_receipts') on conflict(name) do nothing;
create table if not exists vouga_next.capture_receipts (
  row_key text primary key check(length(row_key) between 1 and 2048),
  position integer not null check(position>=0),
  data jsonb not null check(jsonb_typeof(data)='object')
);
alter table vouga_next.capture_receipts enable row level security;
revoke all on vouga_next.capture_receipts from public, anon, authenticated, service_role;
alter table vouga_next.companies add column if not exists name text generated always as (data->>'name') stored;
alter table vouga_next.companies add column if not exists stage text generated always as (data->>'stage') stored;
create index if not exists companies_stage_idx on vouga_next.companies(stage);
alter table vouga_next.companies add column if not exists owner_id text generated always as (data->>'ownerId') stored;
create index if not exists companies_owner_id_idx on vouga_next.companies(owner_id);
alter table vouga_next.contacts add column if not exists name text generated always as (data->>'name') stored;
alter table vouga_next.contacts add column if not exists company_id text generated always as (data->>'organizationId') stored;
create index if not exists contacts_company_id_idx on vouga_next.contacts(company_id);
alter table vouga_next.company_interactions add column if not exists company_id text generated always as (data->>'organizationId') stored;
create index if not exists company_interactions_company_id_idx on vouga_next.company_interactions(company_id);
alter table vouga_next.tasks add column if not exists title text generated always as (data->>'title') stored;
alter table vouga_next.tasks add column if not exists status text generated always as (data->>'status') stored;
alter table vouga_next.tasks add column if not exists owner_id text generated always as (data->>'ownerId') stored;
create index if not exists tasks_owner_id_idx on vouga_next.tasks(owner_id);
alter table vouga_next.tasks add column if not exists company_id text generated always as (data->>'organizationId') stored;
create index if not exists tasks_company_id_idx on vouga_next.tasks(company_id);
alter table vouga_next.tasks add column if not exists project_id text generated always as (data->>'projectId') stored;
create index if not exists tasks_project_id_idx on vouga_next.tasks(project_id);
alter table vouga_next.tasks add column if not exists priority text generated always as (data->>'priority') stored;
alter table vouga_next.tasks add column if not exists size text generated always as (data->>'size') stored;
alter table vouga_next.projects add column if not exists name text generated always as (data->>'name') stored;
alter table vouga_next.projects add column if not exists owner_id text generated always as (data->>'ownerId') stored;
create index if not exists projects_owner_id_idx on vouga_next.projects(owner_id);
alter table vouga_next.projects add column if not exists company_id text generated always as (data->>'organizationId') stored;
create index if not exists projects_company_id_idx on vouga_next.projects(company_id);
alter table vouga_next.calendar_events add column if not exists title text generated always as (data->>'title') stored;
alter table vouga_next.calendar_events add column if not exists calendar_key text generated always as (data->>'calendarKey') stored;
alter table vouga_next.calendar_events add column if not exists google_event_id text generated always as (data->>'googleEventId') stored;
create index if not exists calendar_events_google_event_id_idx on vouga_next.calendar_events(google_event_id);
alter table vouga_next.calendar_events add column if not exists google_calendar_id text generated always as (data->>'googleCalendarId') stored;
create index if not exists calendar_events_google_calendar_id_idx on vouga_next.calendar_events(google_calendar_id);
alter table vouga_next.activity_events add column if not exists entity_type text generated always as (data->>'entityType') stored;
alter table vouga_next.activity_events add column if not exists entity_id text generated always as (data->>'entityId') stored;
create index if not exists activity_events_entity_id_idx on vouga_next.activity_events(entity_id);
alter table vouga_next.activity_events add column if not exists project_id text generated always as (data->>'projectId') stored;
create index if not exists activity_events_project_id_idx on vouga_next.activity_events(project_id);
alter table vouga_next.activity_events add column if not exists company_id text generated always as (data->>'companyId') stored;
create index if not exists activity_events_company_id_idx on vouga_next.activity_events(company_id);
alter table vouga_next.activity_events add column if not exists source text generated always as (data->>'source') stored;
alter table vouga_next.integration_jobs add column if not exists state text generated always as (data->>'state') stored;
create index if not exists integration_jobs_state_idx on vouga_next.integration_jobs(state);
alter table vouga_next.integration_jobs add column if not exists job_key text generated always as (data->>'key') stored;
create unique index if not exists integration_jobs_key_unique on vouga_next.integration_jobs(job_key);
create unique index if not exists calendar_external_unique on vouga_next.calendar_events(google_calendar_id,google_event_id) where google_event_id is not null;
alter table vouga_next.workspace enable row level security;
alter table vouga_next.collections enable row level security;
alter table vouga_next.mutations enable row level security;
revoke all on vouga_next.workspace, vouga_next.collections, vouga_next.mutations from public, anon, authenticated, service_role;

create or replace function public.vouga_next_read() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare result jsonb; c record; items jsonb;
begin
  select jsonb_build_object('schemaVersion',schema_version,'revision',revision)
    into result from vouga_next.workspace where singleton;
  if result is null then return null; end if;
  for c in select name,table_name from vouga_next.collections loop
    execute format('select coalesce(jsonb_agg(data order by position,row_key), ''[]''::jsonb) from vouga_next.%I',c.table_name) into items;
    result := result || jsonb_build_object(c.name,items);
  end loop;
  return result;
end; $$;
revoke all on function public.vouga_next_read() from public,anon,authenticated;
grant execute on function public.vouga_next_read() to service_role;

create or replace function public.vouga_next_commit(
  p_expected_revision bigint, p_mutation_id uuid, p_schema_version integer,
  p_upserts jsonb, p_deletes jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare current_revision bigint; next_revision bigint; receipt record;
  fingerprint_value text; item jsonb; target_table text;
begin
  if p_schema_version is distinct from 5 or p_expected_revision is null or p_expected_revision < -1
    or p_mutation_id is null or jsonb_typeof(p_upserts) is distinct from 'array'
    or jsonb_typeof(p_deletes) is distinct from 'array' then
    raise exception 'Invalid workspace mutation' using errcode='22023';
  end if;
  -- Global revision serializes short database writes across web and worker processes.
  perform pg_advisory_xact_lock(774903271);
  fingerprint_value := encode(sha256(convert_to(jsonb_build_array(p_expected_revision,p_schema_version,p_upserts,p_deletes)::text,'UTF8')),'hex');
  select * into receipt from vouga_next.mutations where id=p_mutation_id;
  if found then
    if receipt.fingerprint <> fingerprint_value then raise exception 'Mutation ID reused with different content' using errcode='22023'; end if;
    return jsonb_build_object('status','ok','revision',receipt.revision);
  end if;
  select revision into current_revision from vouga_next.workspace where singleton for update;
  if current_revision is null then
    if p_expected_revision <> -1 then return jsonb_build_object('status','conflict','revision',-1); end if;
    next_revision:=1;
  else
    if p_expected_revision <> current_revision then return jsonb_build_object('status','conflict','revision',current_revision); end if;
    next_revision:=current_revision+1;
  end if;
  for item in select value from jsonb_array_elements(p_deletes) loop
    select table_name into target_table from vouga_next.collections where name=item->>'collection';
    if target_table is null or nullif(item->>'key','') is null then raise exception 'Invalid collection' using errcode='22023'; end if;
    execute format('delete from vouga_next.%I where row_key=$1',target_table) using item->>'key';
  end loop;
  for item in select value from jsonb_array_elements(p_upserts) loop
    select table_name into target_table from vouga_next.collections where name=item->>'collection';
    if target_table is null or nullif(item->>'key','') is null or jsonb_typeof(item->'data') is distinct from 'object'
      or jsonb_typeof(item->'position') is distinct from 'number' then raise exception 'Invalid record' using errcode='22023'; end if;
    execute format('insert into vouga_next.%I(row_key,position,data) values($1,$2,$3) on conflict(row_key) do update set position=excluded.position,data=excluded.data',target_table)
      using item->>'key',(item->>'position')::integer,item->'data';
  end loop;
  -- Core references are checked at the end, so inserts can arrive in any order.
  if exists(select 1 from vouga_next.companies c where not exists(select 1 from vouga_next.members m where m.row_key=c.owner_id))
    or exists(select 1 from vouga_next.contacts c where not exists(select 1 from vouga_next.companies o where o.row_key=c.company_id))
    or exists(select 1 from vouga_next.company_interactions c where not exists(select 1 from vouga_next.companies o where o.row_key=c.company_id))
    or exists(select 1 from vouga_next.tasks t where not exists(select 1 from vouga_next.members m where m.row_key=t.owner_id)
      or (t.project_id is not null and not exists(select 1 from vouga_next.projects p where p.row_key=t.project_id))
      or (t.company_id is not null and not exists(select 1 from vouga_next.companies o where o.row_key=t.company_id)))
    or exists(select 1 from vouga_next.accounts a where not exists(select 1 from vouga_next.members m where m.row_key=a.row_key))
    or exists(select 1 from vouga_next.projects p where not exists(select 1 from vouga_next.members m where m.row_key=p.owner_id)
      or (p.company_id is not null and not exists(select 1 from vouga_next.companies o where o.row_key=p.company_id))) then
    raise exception 'Invalid workspace references' using errcode='23503';
  end if;
  insert into vouga_next.workspace(singleton,revision,schema_version) values(true,next_revision,p_schema_version)
    on conflict(singleton) do update set revision=excluded.revision,schema_version=excluded.schema_version;
  insert into vouga_next.mutations(id,fingerprint,revision) values(p_mutation_id,fingerprint_value,next_revision);
  -- Receipts are intentionally retained: delayed retries must never execute twice.
  return jsonb_build_object('status','ok','revision',next_revision);
end; $$;
revoke all on function public.vouga_next_commit(bigint,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vouga_next_commit(bigint,uuid,integer,jsonb,jsonb) to service_role;
-- Private files: access only through the backend after task permission checks.
insert into storage.buckets(id,name,public,file_size_limit)
  values('vouga-next-attachments','vouga-next-attachments',false,20971520)
  on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='vouga-next-attachments' and public) then
    raise exception 'The Vouga attachments bucket must be private';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
