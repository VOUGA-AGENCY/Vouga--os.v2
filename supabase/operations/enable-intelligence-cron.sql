-- Requires the existing Vouga pg_cron, pg_net and Vault secret. Run after deploying the endpoint.
begin;
do $$ begin
 if not exists(select from vault.decrypted_secrets where name='vouga_os_cron' and length(decrypted_secret)>20) then
   raise exception 'Configure vouga_os_cron in Vault first';
 end if;
end $$;
-- Supabase cron runs in UTC. Candidate UTC hours cover both offsets. Only the
-- matching Lisbon wall-clock slots dispatch an HTTP request (also on DST Sundays).
select cron.schedule('vouga-os-intelligence','10,25,40 6-10,15-17 * * *',$job$
 select net.http_post(url:='https://os.vouga-agency.pt/api/intelligence?scheduled=1',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vouga_os_cron')),
 body:='{}'::jsonb,timeout_milliseconds:=300000)
 from (values (now() at time zone 'Europe/Lisbon')) as clock(local_time)
 where exists (
   select 1 from (values
     ('07:10',1,7), ('07:40',1,7), ('08:10',1,7), ('09:10',1,7),
     ('08:25',1,5), ('08:40',1,5), ('16:40',1,5),
     ('10:10',1,1), ('10:10',7,7), ('17:10',5,5)
   ) as slots(slot,first_day,last_day)
   where slot = to_char(local_time,'HH24:MI')
     and extract(isodow from local_time) between first_day and last_day
 );
$job$);
commit;
