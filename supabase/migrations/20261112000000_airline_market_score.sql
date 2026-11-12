alter table public.score_history
  add column if not exists source text;

create table if not exists public.airline_market_sessions (
  session_date date primary key,
  change_percent numeric not null,
  points integer not null
);

alter table public.airline_market_sessions enable row level security;
revoke all on table public.airline_market_sessions from public, anon, authenticated;

create or replace function public.apply_airline_market_session(
  p_session_date date,
  p_change_percent numeric
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  point_change integer;
  updated_score public.brady_stats.score%type;
begin
  if p_session_date is null
      or p_session_date > (now() at time zone 'America/New_York')::date
      or p_change_percent is null
      or p_change_percent <= -100
      or p_change_percent > 100 then
    raise exception 'Invalid JETS market session';
  end if;

  point_change := round(p_change_percent * 5)::integer;

  -- A retry or a market holiday can return a session we already processed.
  insert into public.airline_market_sessions (session_date, change_percent, points)
  values (p_session_date, p_change_percent, point_change)
  on conflict (session_date) do nothing;

  if not found then
    return false;
  end if;

  if point_change <> 0 then
    update public.brady_stats
    set score = score + point_change, updated_at = now()
    where id = 1
    returning score into strict updated_score;

    insert into public.score_history (delta, new_score, source)
    values (point_change, updated_score, 'airline_market');
  end if;

  return true;
end;
$$;

revoke execute on function public.apply_airline_market_session(date, numeric)
  from public, anon, authenticated;
grant execute on function public.apply_airline_market_session(date, numeric) to service_role;
