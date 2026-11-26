-- Execute in a disposable database AFTER the schema migrations. Rolls back its fixtures.
begin;
insert into vouga_next.members(row_key,position,data)
values ('miguel',0,'{"id":"miguel","role":"admin","telegramChatId":"1"}'),('intel-test-eng',0,'{"id":"intel-test-eng","role":"engineer","telegramChatId":"2"}'),
('intel-test-off',0,'{"id":"intel-test-off","role":"engineer","archived":true,"telegramChatId":"3"}') on conflict do nothing;
insert into vouga_next.accounts(row_key,position,data) select row_key,0,jsonb_build_object('memberId',row_key) from vouga_next.members where row_key in ('miguel','intel-test-eng','intel-test-off') on conflict do nothing;
do $test$
declare f text; task text; aud text; ticket uuid; file text; header jsonb; payload jsonb; x jsonb; sender uuid:=gen_random_uuid();
begin
 foreach aud in array array['commercial','founders'] loop
  select id into f from vouga_next.intelligence_folders where audience=aud;
  file:='fixture_'||aud;
  task:=case aud when 'commercial' then 'manage_leads' else 'board_report' end;
  ticket:=gen_random_uuid();
  perform public.vouga_next_intelligence_sync(f,ticket,'begin','{}');
  if public.vouga_next_intelligence_sync(f,gen_random_uuid(),'begin','{}')<>'null'::jsonb then raise exception 'Parallel sync'; end if;
  perform public.vouga_next_intelligence_sync(f,ticket,'index',jsonb_build_object('cursor','a','snapshot',true,'files',jsonb_build_array(jsonb_build_object('id',file,'name','Delivery','modifiedTime','2026-11-25T08:00Z','mimeType','doc'))));
  header:=jsonb_build_object('task_key',task,'audience',aud,'task_name','Demo','schema_version',1,'status','ready','summary','Demo','item_count',7,'delivered_at','2026-11-25T08:00Z');
  payload:=jsonb_build_object('id',file,'header',header,'modified','2026-11-25T08:00Z','title','Demo','content','body','url','https://docs.google.com/');
  perform public.vouga_next_intelligence_sync(f,ticket,'invalid',payload||'{"error":"Incomplete"}');
  if public.vouga_next_intelligence_read('miguel','detail',jsonb_build_object('id',file))<>'null'::jsonb then raise exception 'Invalid report leaked'; end if;
  if jsonb_array_length(public.vouga_next_intelligence_sync(f,ticket,'pending',jsonb_build_object('started',clock_timestamp()+interval '1 second')))=0 then raise exception 'Cannot recover incomplete file'; end if;
  perform public.vouga_next_intelligence_sync(f,ticket,'import',payload);
  perform public.vouga_next_intelligence_sync(f,ticket,'import',payload||'{"title":"Updated"}');
  if (public.vouga_next_intelligence_read('miguel','detail',jsonb_build_object('id',file))->>'title') is distinct from 'Updated' then raise exception 'Founder read/update'; end if;
  perform public.vouga_next_intelligence_sync(f,ticket,'finish','{}');
 end loop;
 if public.vouga_next_intelligence_read('intel-test-eng','detail','{"id":"fixture_founders"}')<>'null'::jsonb or public.vouga_next_intelligence_read('intel-test-off','streams','{}')<>'{}'::jsonb then raise exception 'RLS leak'; end if;
 if public.vouga_next_intelligence_read('intel-test-eng','streams','{}')->'manage_leads'->>'unread_count' is distinct from '1' then raise exception 'Missing unread'; end if;
 perform public.vouga_next_intelligence_read('intel-test-eng','mark','{"id":"fixture_commercial"}');
 if public.vouga_next_intelligence_read('intel-test-eng','streams','{}')->'manage_leads'->>'unread_count' is distinct from '0' or public.vouga_next_intelligence_read('miguel','streams','{}')->'manage_leads'->>'unread_count' is distinct from '1' then raise exception 'Read receipt isolation'; end if;
 if jsonb_array_length(public.vouga_next_intelligence_read('intel-test-eng','history','{"key":"manage_leads","date":"2026-11-25","offset":0}'))<>1 then raise exception 'History'; end if;
 if (select count(*) from vouga_next.intelligence_notifications where report_id like 'fixture_%')<>3 then raise exception 'Recipient isolation/dedup'; end if;
 x:=public.vouga_next_intelligence_delivery(sender,'claim','{}');
 if x='null' or public.vouga_next_intelligence_delivery(sender,'claim','{}')<>x then raise exception 'Claim not idempotent'; end if;
 perform public.vouga_next_intelligence_delivery(sender,'finish','{"state":"uncertain"}');
 if public.vouga_next_intelligence_delivery(sender,'claim','{}')<>'null'::jsonb then raise exception 'Ambiguous replay'; end if;
 select id into f from vouga_next.intelligence_folders where audience='commercial';
 ticket:=gen_random_uuid();
 perform public.vouga_next_intelligence_sync(f,ticket,'begin','{}');
 perform public.vouga_next_intelligence_sync(f,ticket,'index','{"cursor":"b","files":[{"id":"fixture_commercial","removed":true}]}');
 if public.vouga_next_intelligence_read('miguel','detail','{"id":"fixture_commercial"}')<>'null'::jsonb then raise exception 'Removed file visible'; end if;
 if has_function_privilege('authenticated','public.vouga_next_intelligence_read(text,text,jsonb)','execute') or has_function_privilege('anon','public.vouga_next_intelligence_delivery(uuid,text,jsonb)','execute') then raise exception 'Exposed RPC'; end if;
end $test$;
rollback;
