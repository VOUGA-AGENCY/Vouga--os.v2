-- Read-only audit. Run in Supabase SQL Editor; does not run the worker or send messages.
-- Do not select cron.job.command or Vault values: they are not needed for diagnosis.
select jobid,jobname,schedule,active
from cron.job where jobname='vouga-os-integrations';

select start_time,end_time,status
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='vouga-os-integrations')
order by start_time desc limit 15;

-- A successful cron SQL execution only proves the HTTP request was queued.
-- Check actual HTTP results too; deliberately exclude response bodies and secrets.
select created,status_code,timed_out,error_msg
from net._http_response order by created desc limit 15;
