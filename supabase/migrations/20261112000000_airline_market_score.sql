alter table public.score_history add column if not exists source text;

create table if not exists public.airline_market_state (
  id integer primary key check (id = 1),
  session_date date,
  last_snapshot_at timestamptz,
  applied_points integer not null default 0
);

alter table public.airline_market_state enable row level security;
revoke all on table public.airline_market_state from public, anon, authenticated;

insert into public.airline_market_state (id) values (1) on conflict do nothing;

create or replace function public.apply_airline_market_snapshot(
  p_snapshot_at timestamptz,
  p_change_percent numeric
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  market_session date := (p_snapshot_at at time zone 'America/New_York')::date;
  previous public.airline_market_state%rowtype;
  target_points integer;
  point_change integer;
  updated_score public.brady_stats.score%type;
begin
  if p_snapshot_at is null or p_change_percent is null
      or p_change_percent <= -100 or p_change_percent > 100
      or market_session <> (now() at time zone 'America/New_York')::date
      or p_snapshot_at > now() + interval '10 seconds' then
    raise exception 'Invalid JETS market snapshot';
  end if;

  -- Serialize market updates so retries and overlapping requests are safe.
  select * into strict previous from public.airline_market_state where id = 1 for update;
  if p_snapshot_at <= previous.last_snapshot_at then
    return 0;
  end if;

  target_points := round(p_change_percent * 5)::integer;
  point_change := target_points - case
    when previous.session_date = market_session then previous.applied_points
    else 0
  end;

  if point_change <> 0 then
    update public.brady_stats
    set score = score + point_change, updated_at = now()
    where id = 1
    returning score into strict updated_score;

    insert into public.score_history (delta, new_score, source)
    values (point_change, updated_score, 'airline_market');
  end if;

  update public.airline_market_state
  set session_date = market_session, last_snapshot_at = p_snapshot_at, applied_points = target_points
  where id = 1;

  return point_change;
end;
$$;

revoke execute on function public.apply_airline_market_snapshot(timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.apply_airline_market_snapshot(timestamptz, numeric) to service_role;
