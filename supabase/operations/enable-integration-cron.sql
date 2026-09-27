-- Run AFTER saving the existing INTEGRATION_CRON_SECRET in Supabase Vault
-- as a secret named vouga_os_cron. Never paste the secret into this file.
-- Uses the same database and calls the public OS once per minute.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='vouga_os_cron' and length(decrypted_secret)>20) then
   raise exception 'First save INTEGRATION_CRON_SECRET in Vault with name vouga_os_cron';
 end if;
end $$;
select cron.schedule(
 'vouga-os-integrations',
 '* * * * *',
 $job$
 select net.http_post(
   url := 'https://os.vouga-agency.pt/api/integrations/cron',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='vouga_os_cron')
   ),
   body := '{}'::jsonb,
   timeout_milliseconds := 120000
 );
 $job$
);
commit;
-- Verify actual HTTP results, not just whether the scheduler ran:
-- select status_code,timed_out,error_msg,created from net._http_response order by created desc limit 5;
-- Pause if needed: select cron.alter_job(jobid,active:=false) from cron.job where jobname='vouga-os-integrations';
