-- Math Blitz — run this in the Supabase SQL editor after schema.sql.
--
-- Not part of supabase/schema.sql because that file lives outside this
-- repo (supabase/ is gitignored) — see README.md's Supabase setup
-- section. This script is self-contained and only adds what Math Blitz
-- needs: the math_rounds table, its RPC, and a games catalog row.

create table if not exists math_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  session_id uuid not null default gen_random_uuid(),
  round_index int not null,
  total_rounds int not null,
  difficulty text not null,
  operand_a int not null,
  operand_b int not null,
  operator text not null,
  winner_player_id uuid references players (id) on delete set null,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (session_id, round_index)
);

alter table math_rounds enable row level security;

-- Same no-auth, casual-party trust model as the rest of the app's tables
-- (see README's "Known limitation" note under Guess the Word).
create policy "math_rounds are publicly readable" on math_rounds
  for select using (true);
create policy "math_rounds are publicly insertable" on math_rounds
  for insert with check (true);
create policy "math_rounds are publicly updatable" on math_rounds
  for update using (true) with check (true);

alter publication supabase_realtime add table math_rounds;

-- Recomputes the correct answer server-side from the stored operands
-- instead of trusting anything the client sent, so — unlike the other
-- games' RPCs — this one is authoritative on its own; see each RPC's
-- "Known limitation" note for the games that only check shape/pattern
-- server-side and lean on the client for real validation.
create or replace function submit_math_guess(
  p_round_id uuid,
  p_player_id uuid,
  p_guess int
)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round math_rounds%rowtype;
  v_correct int;
  v_updated int;
begin
  select * into v_round from math_rounds where id = p_round_id for update;

  if not found then
    return query select 'not_found'::text;
    return;
  end if;

  if v_round.winner_player_id is not null then
    return query select 'already_answered'::text;
    return;
  end if;

  v_correct := case v_round.operator
    when '+' then v_round.operand_a + v_round.operand_b
    when '-' then v_round.operand_a - v_round.operand_b
    when '*' then v_round.operand_a * v_round.operand_b
  end;

  if p_guess is distinct from v_correct then
    return query select 'incorrect'::text;
    return;
  end if;

  update math_rounds
    set winner_player_id = p_player_id, answered_at = now()
    where id = p_round_id and winner_player_id is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return query select 'already_answered'::text;
    return;
  end if;

  update players set score = score + 1 where id = p_player_id;

  return query select 'correct'::text;
end;
$$;

grant execute on function submit_math_guess(uuid, uuid, int) to anon, authenticated;

-- Registers the game so it shows up on the Game List screen. Adjust the
-- column list if your local games table differs (this repo's actual
-- seed.sql isn't tracked — see README's Supabase setup section).
insert into games (name, slug, description, category)
values (
  'Math Blitz',
  'math-blitz',
  'Race to solve quick math problems — first correct answer wins the point.',
  'speed'
)
on conflict (slug) do nothing;
