-- Opt in only after backing up the project and verifying exports in a test project.
-- Enable Supabase Cron (pg_cron) in the dashboard before running this file.
select cron.schedule(
 'musicrequest-expired-evenings',
 '17 * * * *',
 'select public.purge_expired_dj_evenings();'
);
