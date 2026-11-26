begin;
-- Independent of the workspace snapshot, revision cache and client-side collections.
create table vouga_next.intelligence_folders (
  id text primary key, audience text unique not null,
  cursor_token text, lease uuid, lease_until timestamptz, last_sync timestamptz, last_error text
);
insert into vouga_next.intelligence_folders(id,audience) values
 ('1FTP-3cMLlczpn-M-VVUR8Qsu5Fg_ERTf','founders'),('1CxCH8m3qzSCDO05SuUqjeQzilDb1UlRW','commercial');
create table vouga_next.intelligence_streams (task_key text primary key, audience text not null references vouga_next.intelligence_folders(audience), unique(task_key,audience));
insert into vouga_next.intelligence_streams values
 ('manage_leads','commercial'),('general_leads','commercial'),('buying_signals','commercial'),('commercial_followup','commercial'),
 ('ai_radar','founders'),('funding_monitor','founders'),('vccm_lab','founders'),('founder_briefing','founders'),('infra_watchdog','founders'),
 ('strategic_networking','founders'),('talent_radar','founders'),('founder_content','founders'),('board_report','founders');

-- Source inventory includes incomplete documents. Only validated deliveries enter reports.
create table vouga_next.intelligence_files (
  id text primary key, folder_id text not null references vouga_next.intelligence_folders,
  name text not null, mime text not null, modified_at timestamptz not null,
  state text not null check(state in ('pending','ready','invalid','removed')),
  checked_at timestamptz, last_error text
);
create index intelligence_pending on vouga_next.intelligence_files(folder_id,checked_at) where state in ('pending','invalid');
create table vouga_next.intelligence_reports (
  drive_file_id text primary key references vouga_next.intelligence_files,
  task_key text not null, audience text not null, task_name text not null, schema_version integer not null check(schema_version=1),
  title text not null, summary text not null check(length(summary)<=350), content text not null,
  item_count bigint check(item_count>=0), delivered_at timestamptz not null, drive_file_url text not null,
  imported_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(task_key,audience) references vouga_next.intelligence_streams(task_key,audience)
);
create index intelligence_history on vouga_next.intelligence_reports(task_key,delivered_at desc,drive_file_id);
create table vouga_next.intelligence_reads (
  report_id text references vouga_next.intelligence_reports, member_id text not null, read_at timestamptz not null default now(), primary key(report_id,member_id)
);
create table vouga_next.intelligence_notifications (
  report_id text references vouga_next.intelligence_reports, member_id text not null, kind text not null default 'delivery',
  state text not null default 'pending' check(state in ('pending','sending','sent','uncertain','failed')),
  attempts integer not null default 0, available_at timestamptz not null default now(), claim uuid, claimed_at timestamptz, sent_at timestamptz, last_error text,
  primary key(report_id,member_id,kind)
);
create index intelligence_outbox on vouga_next.intelligence_notifications(available_at) where state='pending';

create function vouga_next.intelligence_access(actor text) returns text
language sql stable security definer set search_path='' as $$
  select case when actor in ('miguel','afonso','roque') then 'founders' when m.data->>'role'='engineer' and actor not in ('engineer','patrick') then 'commercial' end
  from vouga_next.members m join vouga_next.accounts a on a.row_key=m.row_key
  where m.row_key=actor and not coalesce((m.data->>'archived')::boolean,false) and not coalesce((a.data->>'disabled')::boolean,false)
$$;
revoke all on function vouga_next.intelligence_access(text) from public,anon,authenticated;

-- The application uses its own authenticated session, not a browser Supabase JWT.
-- Use a non-login, non-owner role for the reader RPC so RLS applies to every query.
create role vouga_intelligence_reader nologin nobypassrls;
grant vouga_intelligence_reader to current_user;
grant usage on schema vouga_next to vouga_intelligence_reader;
grant select on vouga_next.intelligence_reports,vouga_next.intelligence_files,vouga_next.intelligence_reads to vouga_intelligence_reader;
grant insert on vouga_next.intelligence_reads to vouga_intelligence_reader;
grant execute on function vouga_next.intelligence_access(text) to vouga_intelligence_reader;

alter table vouga_next.intelligence_files enable row level security;
alter table vouga_next.intelligence_reports enable row level security;
alter table vouga_next.intelligence_reads enable row level security;
alter table vouga_next.intelligence_notifications enable row level security;
alter table vouga_next.intelligence_folders enable row level security;
alter table vouga_next.intelligence_streams enable row level security;

create policy intelligence_visible_source on vouga_next.intelligence_files for select to vouga_intelligence_reader using (
 state='ready' and (current_setting('vouga.intel_scope',true)='founders' or
 (current_setting('vouga.intel_scope',true)='commercial' and folder_id='1CxCH8m3qzSCDO05SuUqjeQzilDb1UlRW'))
);
create policy intelligence_visible_report on vouga_next.intelligence_reports for select to vouga_intelligence_reader using (
 exists(select 1 from vouga_next.intelligence_files f where f.id=drive_file_id and
 ((f.folder_id='1CxCH8m3qzSCDO05SuUqjeQzilDb1UlRW' and audience='commercial') or (f.folder_id='1FTP-3cMLlczpn-M-VVUR8Qsu5Fg_ERTf' and audience='founders')))
);
create policy intelligence_own_reads on vouga_next.intelligence_reads for all to vouga_intelligence_reader
using(member_id=current_setting('vouga.intel_member',true))
with check(member_id=current_setting('vouga.intel_member',true) and exists(select 1 from vouga_next.intelligence_reports r where r.drive_file_id=report_id));

create function public.vouga_next_intelligence_read(actor text, operation text, args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform set_config('vouga.intel_scope',coalesce(vouga_next.intelligence_access(actor),''),true);
 perform set_config('vouga.intel_member',actor,true);
 if operation='mark' then
   insert into vouga_next.intelligence_reads(report_id,member_id) select drive_file_id,actor from vouga_next.intelligence_reports where drive_file_id=args->>'id' on conflict do nothing;
   return 'true';
 elsif operation='detail' then
   select jsonb_build_object('id',r.drive_file_id,'title',r.title,'task_key',r.task_key,'summary',r.summary,'item_count',r.item_count,
     'delivered_at',r.delivered_at,'updated_at',r.updated_at,'content',r.content,'drive_file_url',r.drive_file_url,'source_modified_at',f.modified_at,'folder_id',f.folder_id)
     into result from vouga_next.intelligence_reports r join vouga_next.intelligence_files f on f.id=r.drive_file_id where r.drive_file_id=args->>'id';
 elsif operation='streams' then
   select jsonb_object_agg(task_key,to_jsonb(s)-'task_key') into result from (
     select distinct on (r.task_key) r.task_key,r.drive_file_id as id,r.title,r.summary,r.item_count,r.delivered_at,r.updated_at,
     max(r.updated_at) over(partition by r.task_key) as last_updated,
     count(*) filter(where v.report_id is null) over(partition by r.task_key) as unread_count
     from vouga_next.intelligence_reports r left join vouga_next.intelligence_reads v on v.report_id=r.drive_file_id
     where (args->>'date') is null or (r.delivered_at at time zone 'Europe/Lisbon')::date=(args->>'date')::date
     order by r.task_key,r.delivered_at desc,r.drive_file_id
   ) s;
   return coalesce(result,'{}');
 elsif operation='history' then
   select jsonb_agg(to_jsonb(s) order by delivered_at desc,id) into result from (
    select r.drive_file_id as id,r.task_key,r.title,r.summary,r.item_count,r.delivered_at,r.updated_at,v.report_id is null as unread
    from vouga_next.intelligence_reports r left join vouga_next.intelligence_reads v on v.report_id=r.drive_file_id
    where r.task_key=args->>'key' and ((args->>'date') is null or (r.delivered_at at time zone 'Europe/Lisbon')::date=(args->>'date')::date)
    order by r.delivered_at desc,r.drive_file_id limit 31 offset greatest(0,(args->>'offset')::int)
   ) s;
   return coalesce(result,'[]');
 else raise exception 'Unknown read operation';
 end if;
 return coalesce(result,'null');
end $$;
grant create on schema public to vouga_intelligence_reader;
alter function public.vouga_next_intelligence_read(text,text,jsonb) owner to vouga_intelligence_reader;
revoke create on schema public from vouga_intelligence_reader;
revoke all on function public.vouga_next_intelligence_read(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vouga_next_intelligence_read(text,text,jsonb) to service_role;

-- Cursor advancement, source inventory and import/outbox updates are transactional.
create function public.vouga_next_intelligence_sync(folder text, ticket uuid, operation text, args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare dir vouga_next.intelligence_folders; f jsonb; source vouga_next.intelligence_files; result jsonb; first_delivery boolean; h jsonb;
begin
 select * into strict dir from vouga_next.intelligence_folders where id=folder for update;
 if operation='begin' then
   if dir.lease<>ticket and dir.lease_until>now() then return 'null'; end if;
   update vouga_next.intelligence_folders set lease=ticket,lease_until=now()+interval '5 minutes' where id=folder;
   return jsonb_build_object('cursor',dir.cursor_token,'started',clock_timestamp());
 end if;
 if dir.lease is distinct from ticket or dir.lease_until<=now() then raise exception 'Expired sync lease'; end if;
 update vouga_next.intelligence_folders set lease_until=now()+interval '5 minutes' where id=folder;
 if operation='index' then
   if (args->>'snapshot')::boolean then
     update vouga_next.intelligence_files set state='removed' where folder_id=folder and state<>'removed'
       and id not in (select j->>'id' from jsonb_array_elements(args->'files') j);
   end if;
   for f in select * from jsonb_array_elements(args->'files') loop
     if (f->>'removed')::boolean then
       update vouga_next.intelligence_files set state='removed' where id=f->>'id' and folder_id=folder;
     else
       insert into vouga_next.intelligence_files as old(id,folder_id,name,mime,modified_at,state)
       values(f->>'id',folder,f->>'name',f->>'mimeType',(f->>'modifiedTime')::timestamptz,'pending')
       on conflict(id) do update set folder_id=excluded.folder_id,name=excluded.name,mime=excluded.mime,modified_at=excluded.modified_at,state='pending',checked_at=null,last_error=null
       where old.modified_at<=excluded.modified_at and (old.modified_at<>excluded.modified_at or old.folder_id<>folder or old.name<>excluded.name or old.state='removed');
     end if;
   end loop;
   update vouga_next.intelligence_folders set cursor_token=args->>'cursor' where id=folder;
 elsif operation='pending' then
   select jsonb_agg(to_jsonb(t)) into result from (select id,name,mime,modified_at from vouga_next.intelligence_files where folder_id=folder
    and state in ('pending','invalid') and (checked_at is null or checked_at < (args->>'started')::timestamptz)
    order by checked_at nulls first,modified_at desc,id limit 20) t;
   return coalesce(result,'[]');
 elsif operation in ('invalid','import') then
   select * into source from vouga_next.intelligence_files where id=args->>'id' and folder_id=folder for update;
   if not found or source.modified_at<>(args->>'modified')::timestamptz or source.state='removed' then return 'false'; end if;
   if operation='invalid' then
    update vouga_next.intelligence_files set state='invalid',last_error=left(args->>'error',300),checked_at=clock_timestamp() where id=source.id;
   else
    h:=args->'header';
    if dir.audience is distinct from h->>'audience' or h->>'status' is distinct from 'ready' or (h->>'schema_version')::int is distinct from 1 then raise exception 'Invalid report'; end if;
    first_delivery:=not exists(select from vouga_next.intelligence_reports where drive_file_id=source.id);
    insert into vouga_next.intelligence_reports(drive_file_id,task_key,audience,task_name,schema_version,title,summary,content,item_count,delivered_at,drive_file_url)
    values(source.id,h->>'task_key',dir.audience,h->>'task_name',1,args->>'title',h->>'summary',args->>'content',(h->>'item_count')::bigint,(h->>'delivered_at')::timestamptz,args->>'url')
    on conflict(drive_file_id) do update set task_key=excluded.task_key,audience=excluded.audience,task_name=excluded.task_name,title=excluded.title,
    summary=excluded.summary,content=excluded.content,item_count=excluded.item_count,delivered_at=excluded.delivered_at,drive_file_url=excluded.drive_file_url,updated_at=now();
    update vouga_next.intelligence_files set state='ready',checked_at=clock_timestamp(),last_error=null where id=source.id;
    if first_delivery then
      insert into vouga_next.intelligence_notifications(report_id,member_id)
      select source.id,m.row_key from vouga_next.members m where vouga_next.intelligence_access(m.row_key) in ('founders',dir.audience)
       and nullif(m.data->>'telegramChatId','') is not null on conflict do nothing;
    end if;
   end if;
 elsif operation in ('finish','error','pause') then
   update vouga_next.intelligence_folders set lease=null,lease_until=null,last_sync=case when operation='finish' then now() else last_sync end,last_error=left(args->>'error',300) where id=folder;
 else raise exception 'Unknown sync operation';
 end if;
 return 'true';
end $$;
revoke all on function public.vouga_next_intelligence_sync(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vouga_next_intelligence_sync(text,uuid,text,jsonb) to service_role;

create function public.vouga_next_intelligence_delivery(ticket uuid,operation text,args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if operation='claim' then
  update vouga_next.intelligence_notifications set state='uncertain',last_error='Envio sem confirmação' where state='sending' and claimed_at<now()-interval '5 minutes';
  -- RPC transport retries may repeat a claim. Return only that ticket's own receipt.
  if not exists(select from vouga_next.intelligence_notifications where claim=ticket) then
   with selected as (
     select n.report_id,n.member_id,n.kind from vouga_next.intelligence_notifications n
     join vouga_next.intelligence_files f on f.id=n.report_id and f.state='ready'
     join vouga_next.intelligence_reports r on r.drive_file_id=f.id
     join vouga_next.intelligence_folders d on d.id=f.folder_id and d.audience=r.audience
     join vouga_next.members m on m.row_key=n.member_id
     where n.state='pending' and n.available_at<=now() and nullif(m.data->>'telegramChatId','') is not null
      and vouga_next.intelligence_access(m.row_key) in ('founders',d.audience) and (args->>'folder' is null or f.folder_id=args->>'folder')
     order by n.available_at,n.report_id,n.member_id limit 1 for update of n skip locked
   ) update vouga_next.intelligence_notifications n set claim=ticket,state='sending',claimed_at=now(),attempts=attempts+1
     from selected s where (n.report_id,n.member_id,n.kind)=(s.report_id,s.member_id,s.kind);
  end if;
  select jsonb_build_object('id',r.drive_file_id,'chat',m.data->>'telegramChatId','summary',r.summary,'item_count',r.item_count,'task_key',r.task_key,'delivered_at',r.delivered_at)
   into result from vouga_next.intelligence_notifications n join vouga_next.members m on m.row_key=n.member_id
   join vouga_next.intelligence_reports r on r.drive_file_id=n.report_id where n.claim=ticket and n.state='sending';
  return coalesce(result,'null');
 elsif operation='finish' then
  if args->>'state' not in ('sent','pending','uncertain','failed') then raise exception 'Unknown delivery state'; end if;
  update vouga_next.intelligence_notifications set state=case when args->>'state'='pending' and attempts>=8 then 'failed' else args->>'state' end,
   sent_at=case when args->>'state'='sent' then now() end,last_error=left(args->>'error',300),available_at=now()+make_interval(secs=>greatest(60,coalesce((args->>'retry')::int,0)))
   where claim=ticket and state='sending';
 else raise exception 'Unknown delivery operation';
 end if;
 return 'true';
end $$;
create unique index intelligence_delivery_claim on vouga_next.intelligence_notifications(claim) where claim is not null;
revoke all on function public.vouga_next_intelligence_delivery(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vouga_next_intelligence_delivery(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
