-- Programa el envío de recordatorios.
--
-- NO va en supabase/migrations: necesita que la service role key esté guardada en
-- Vault, y `supabase db push` no puede resolver eso solo. Se ejecuta una vez, a
-- mano, desde el SQL Editor del dashboard de Supabase.
--
-- PASO 1 — guardar la llave en Vault. Reemplaza el placeholder por el valor de
-- SUPABASE_SERVICE_ROLE_KEY (Dashboard → Project Settings → API) y ejecútalo:
--
--   select vault.create_secret(
--     'PEGA_AQUI_LA_SERVICE_ROLE_KEY',
--     'pastilla_service_role_key',
--     'Llave usada por el cron para invocar la edge function send-reminder'
--   );
--
-- Se guarda cifrada, así que no queda a la vista en la definición del cron.
-- Para rotarla después: select vault.update_secret(id, 'nueva_llave')
--
-- PASO 2 — ejecutar todo lo de abajo.

create extension if not exists pg_cron with schema cron;
create extension if not exists pg_net with schema extensions;

-- Cada 15 minutos. La función decide sola si toca avisar; correrla de más no
-- genera notificaciones de más. Esta granularidad es la que permite que
-- followup_minutes funcione con cualquier valor a partir de 15.
select cron.unschedule('pastilla-send-reminder')
where exists (select 1 from cron.job where jobname = 'pastilla-send-reminder');

select cron.schedule(
  'pastilla-send-reminder',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://pqdrbbcgziacgjpfnlha.supabase.co/functions/v1/send-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pastilla_service_role_key'
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Comprobaciones
-- ---------------------------------------------------------------------------

-- ¿Quedó programado?
--   select jobid, jobname, schedule, active from cron.job;

-- ¿Está corriendo bien? (status y respuesta de las últimas corridas)
--   select runid, status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'pastilla-send-reminder')
--    order by start_time desc limit 10;

-- ¿Qué devolvió la edge function?
--   select id, status_code, content, created
--     from net._http_response order by created desc limit 10;
