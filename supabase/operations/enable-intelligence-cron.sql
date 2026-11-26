-- Requires the existing Vouga pg_cron, pg_net and Vault secret. Run after deploying the endpoint.
begin;
do $$ begin
 if not exists(select from vault.decrypted_secrets where name='vouga_os_cron' and length(decrypted_secret)>20) then
   raise exception 'Configure vouga_os_cron in Vault first';
 end if;
end $$;
-- Supabase cron runs in UTC. Candidate UTC hours cover both offsets. Only the seven
-- matching Lisbon wall-clock slots dispatch an HTTP request (also on DST Sundays).
select cron.schedule('vouga-os-intelligence','0,30,45 6-12,16-17,19-20 * * *',$job$
 select net.http_post(url:='https://os.vouga-agency.pt/api/intelligence?scheduled=1',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vouga_os_cron')),
 body:='{}'::jsonb,timeout_milliseconds:=300000)
 where to_char(now() at time zone 'Europe/Lisbon','HH24:MI') in ('07:45','08:45','09:45','10:45','12:00','17:30','20:00');
$job$);
commit;
