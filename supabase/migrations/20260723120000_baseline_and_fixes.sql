-- Baseline del esquema + correcciones.
--
-- Las tablas ya existían en el proyecto remoto sin historial de migraciones, así
-- que todo aquí es idempotente: se puede aplicar sobre una base con datos o
-- sobre una base vacía y el resultado es el mismo.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.reminder_config (
  id               integer primary key,
  ntfy_topic       text,
  morning_hour     integer     not null default 8,
  evening_hour     integer     not null default 20,
  followup_minutes integer     not null default 30,
  timezone         text        not null default 'America/Lima',
  pill_stock       integer     not null default 0,
  pill_stock_alert integer     not null default 7,
  updated_at       timestamptz not null default now()
);

create table if not exists public.pill_logs (
  id             uuid primary key default gen_random_uuid(),
  dose           text        not null,
  scheduled_time timestamptz not null,
  taken_at       timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reminder_config: limpieza de columnas heredadas
-- ---------------------------------------------------------------------------

-- `whatsapp_number` en realidad guarda un topic de ntfy. El nombre viene de una
-- implementación anterior por WhatsApp y confunde.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reminder_config'
      and column_name = 'whatsapp_number'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reminder_config'
      and column_name = 'ntfy_topic'
  ) then
    alter table public.reminder_config rename column whatsapp_number to ntfy_topic;
  end if;
end $$;

alter table public.reminder_config drop column if exists callmebot_apikey;

-- Marca de la última alerta de stock enviada, para no repetirla cada vez que
-- corre el cron.
alter table public.reminder_config
  add column if not exists last_stock_alert_on date;

-- Es una tabla de una sola fila; que el esquema lo garantice.
alter table public.reminder_config drop constraint if exists reminder_config_singleton;
alter table public.reminder_config add constraint reminder_config_singleton check (id = 1);

insert into public.reminder_config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- pill_logs: la corrección central
-- ---------------------------------------------------------------------------

-- El upsert de la app usaba `onConflict: "dose, date(scheduled_time at time
-- zone 'America/Lima')"`. PostgREST solo acepta nombres de columna ahí, así que
-- cada confirmación fallaba con 42703 y no se guardaba nada.
--
-- `log_date` materializa ese día en zona Lima como columna real. No la hacemos
-- GENERATED porque la inmutabilidad de las conversiones de zona horaria es
-- frágil entre versiones de Postgres; la escribe siempre el servidor.
alter table public.pill_logs add column if not exists log_date date;

update public.pill_logs
   set log_date = (scheduled_time at time zone 'America/Lima')::date
 where log_date is null;

alter table public.pill_logs alter column log_date set not null;

-- Estado de los recordatorios enviados, para implementar followup_minutes.
alter table public.pill_logs add column if not exists last_notified_at timestamptz;
alter table public.pill_logs add column if not exists notify_count integer not null default 0;

alter table public.pill_logs drop constraint if exists pill_logs_dose_valid;
alter table public.pill_logs add constraint pill_logs_dose_valid
  check (dose in ('morning', 'evening'));

-- El constraint que hacía falta para que el upsert tenga sobre qué resolver.
create unique index if not exists pill_logs_dose_log_date_uniq
  on public.pill_logs (dose, log_date);

-- Ya existía `pill_logs_dose_day_unique` sobre la expresión
-- (dose, date(scheduled_time at time zone 'America/Lima')), que impone la misma
-- regla. No era el constraint el que faltaba: PostgREST no sabe nombrar un
-- índice por expresión en on_conflict, y por eso el upsert daba 42703.
--
-- Se elimina porque ahora es redundante y además peligroso: confirm_dose
-- resuelve el conflicto contra (dose, log_date), así que una violación del
-- índice viejo escaparía al ON CONFLICT y saldría como error 23505.
drop index if exists public.pill_logs_dose_day_unique;

create index if not exists pill_logs_log_date_idx
  on public.pill_logs (log_date desc);

-- ---------------------------------------------------------------------------
-- confirm_dose(): confirmación atómica
-- ---------------------------------------------------------------------------

-- Antes el cliente leía pill_stock, restaba 1 y escribía el resultado. Dos
-- pestañas abiertas, o un reintento, descontaban de más. Y el descuento ocurría
-- aunque el insert del log hubiera fallado, que es exactamente lo que venía
-- pasando: 0 filas en pill_logs con el stock en 59.
--
-- Ahora es una sola transacción, y es idempotente: reconfirmar una dosis ya
-- tomada no vuelve a descontar.
create or replace function public.confirm_dose(
  p_dose      text,
  p_log_date  date,
  p_scheduled timestamptz,
  p_taken     timestamptz
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_taken boolean;
  v_stock     integer;
begin
  if p_dose not in ('morning', 'evening') then
    raise exception 'dosis inválida: %', p_dose using errcode = '22023';
  end if;

  select taken_at is not null
    into v_was_taken
    from pill_logs
   where dose = p_dose and log_date = p_log_date;

  insert into pill_logs (dose, scheduled_time, taken_at, log_date)
  values (p_dose, p_scheduled, p_taken, p_log_date)
  on conflict (dose, log_date) do update
     set taken_at = coalesce(pill_logs.taken_at, excluded.taken_at);

  if coalesce(v_was_taken, false) then
    select pill_stock into v_stock from reminder_config where id = 1;
  else
    update reminder_config
       set pill_stock = greatest(pill_stock - 1, 0),
           updated_at = now()
     where id = 1
    returning pill_stock into v_stock;
  end if;

  return json_build_object(
    'already_taken', coalesce(v_was_taken, false),
    'pill_stock',    v_stock
  );
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- La anon key viaja en el bundle del navegador, o sea que es pública. Hasta
-- ahora cualquiera que la leyera podía reescribir el stock o borrar el
-- historial. Se activa RLS sin políticas: anon y authenticated quedan sin
-- acceso, y todo pasa por los route handlers de Next.js, que usan la service
-- role key (server-only) y hacen bypass de RLS.
alter table public.pill_logs       enable row level security;
alter table public.reminder_config enable row level security;

-- Se enumeran las políticas existentes en vez de nombrarlas: activar RLS no
-- sirve de nada si queda una política permisiva viva, y sus nombres dependen de
-- cómo se creó el proyecto (la UI de Supabase genera cosas como "Enable read
-- access for all users"). Un `drop policy if exists` con nombres adivinados
-- falla en silencio, que es exactamente lo que pasó la primera vez.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename in ('pill_logs', 'reminder_config')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    raise notice 'política eliminada: %.%', pol.tablename, pol.policyname;
  end loop;
end $$;

-- confirm_dose es SECURITY DEFINER: sin este revoke, anon podría llamarla vía
-- PostgREST y saltarse RLS por la puerta de atrás.
revoke all on function public.confirm_dose(text, date, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_dose(text, date, timestamptz, timestamptz)
  to service_role;
