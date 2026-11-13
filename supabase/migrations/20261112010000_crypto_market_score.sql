create table if not exists public.crypto_market_state (
  id integer primary key check (id = 1),
  session_date date,
  last_snapshot_at timestamptz,
  applied_points integer not null default 0
);
alter table public.crypto_market_state enable row level security;
revoke all on public.crypto_market_state from public, anon, authenticated;
grant select, update on public.crypto_market_state to service_role;
insert into public.crypto_market_state (id) values (1) on conflict do nothing;

create or replace function public.apply_crypto_market_snapshot(
  p_snapshot_at timestamptz, p_spread_percent numeric
) returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  market_day date := (p_snapshot_at at time zone 'UTC')::date;
  previous public.crypto_market_state%rowtype;
  target_points integer;
  point_change integer;
  updated_score public.brady_stats.score%type;
begin
  if p_snapshot_at is null or p_spread_percent is null
      or abs(p_spread_percent) > 100
      or market_day <> (now() at time zone 'UTC')::date
      or p_snapshot_at > now()
      or p_snapshot_at < now() - interval '10 minutes' then
    raise exception 'Invalid crypto snapshot';
  end if;

  select * into strict previous from public.crypto_market_state where id = 1 for update;
  if p_snapshot_at <= previous.last_snapshot_at then
    return 0;
  end if;

  target_points := greatest(-3, least(3, round(p_spread_percent / 2)::integer));
  point_change := target_points - case
    when previous.session_date = market_day then previous.applied_points else 0 end;

  if point_change <> 0 then
    update public.brady_stats set score = score + point_change, updated_at = now()
      where id = 1 returning score into strict updated_score;
    insert into public.score_history (delta, new_score, source)
      values (point_change, updated_score, 'crypto_market');
  end if;

  update public.crypto_market_state
    set session_date = market_day, last_snapshot_at = p_snapshot_at, applied_points = target_points
    where id = 1;
  return point_change;
end;
$$;
revoke all on function public.apply_crypto_market_snapshot(timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.apply_crypto_market_snapshot(timestamptz, numeric) to service_role;
