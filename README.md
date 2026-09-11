# Game Night

Browser-based, mobile-first multiplayer game app. See [PROJECT_SPEC.md](./PROJECT_SPEC.md)
for the full product spec.

## Stack

- Vite + React + Tailwind CSS
- Supabase (Postgres + Realtime) for rooms, players, and live leaderboards
- Netlify for hosting

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run [supabase/schema.sql](./supabase/schema.sql) in the SQL editor to create
   the `games`, `rooms`, `players`, `rounds`, and `answers` tables (with
   Realtime + RLS enabled) plus the `submit_word_guess()` scoring function
   and the `leave_room()` cleanup function. Re-running it drops and
   recreates `rounds`/`answers` (in-progress gameplay data, not worth
   migrating column-by-column) — `games`/`rooms`/`players` are altered in
   place instead.
3. Run [supabase/seed.sql](./supabase/seed.sql) to register the "Guess the
   Word" game so it shows up on the Game List screen.
4. Copy your Project URL and anon key into `.env` as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.

## Room lifecycle

`rooms.status` gates whether a room code is joinable
(`GameDetail.jsx`'s join flow only matches `status = 'waiting'`):

- **`waiting`** — open to new joiners. Set on create, and again once a game
  session ends (last word revealed).
- **`started`** — a session is in progress; new joins are rejected.
- **`expired`** — the last player left. Set atomically by the `leave_room()`
  function so two people leaving at once can't both think someone's still
  there and skip it.

## Deploying

Connect the repo to Netlify — `netlify.toml` already sets the build command
(`npm run build`) and publish directory (`dist`), plus the SPA redirect rule
for client-side routing. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
as environment variables in the Netlify site settings.

## Project structure

```
src/
  components/       Leaderboard, GameCard
  context/          PlayerProvider (per-session player name)
  lib/              supabase client, room code generator
  pages/            Landing, GameList, GameDetail, GameRoom
  games/
    guessTheWord/   the "Guess the Word" game (see below)
supabase/
  schema.sql        tables, indexes, Realtime + RLS policies,
                     submit_word_guess(), leave_room()
  seed.sql          registers games in the catalog
```

## Games

Each game lives under `src/games/<slug>/` and is registered by `slug` in the
`GAMES` map in [src/pages/GameRoom.jsx](./src/pages/GameRoom.jsx), matched
against the room's `games.slug` column.

### Guess the Word (`guess-the-word`)

Each round has a *pattern* — a random first and last letter (e.g. `H ⋯ E`,
any length) — not a single target word. Players race to type as many real
words fitting that pattern as they can before time runs out (HOUSE, HIKE,
and HORRIBLE are all valid for `H ⋯ E`); each word can only be claimed
once, so once someone's typed it, it's off the table for everyone else.
Most words claimed wins.

- **Why no stored target word (or length)**: the round used to store one
  specific word and reject anything else, but many real words share a
  shape — both HOUSE and HORSE fit `H___E` — so comparing against a single
  answer wrongly rejected valid guesses. Pinning the length has the same
  problem at a bigger scale: hundreds of words start with "H" and end with
  "E" at every length. Now `rounds` only stores `start_char`/`end_char`;
  see `matchesPattern()` in [words.js](./src/games/guessTheWord/words.js),
  run client-side before a guess is even sent to the server.
- **`isValidWord()`**: an actual dictionary lookup, via
  [an-array-of-english-words](https://www.npmjs.com/package/an-array-of-english-words)
  (~275k real English words). It's ~3MB of JSON, so it's loaded through a
  dynamic `import()` — Vite code-splits it into its own chunk instead of
  bloating the main bundle, and `preloadDictionary()` kicks the fetch off
  as soon as the game screen mounts so it's ready before anyone submits a
  guess. Earlier versions of this check only confirmed the guess matched
  the round's first/last letter (or, briefly, that it was letter-shaped at
  all) — either way "BSDFKDSFKT" scored against a B...T pattern, since
  nothing ever checked it was a real word.
- **Host**: whoever created the room (`rooms.host_id`, claimed on first
  join — see `isCreatorRef` in [GameRoom.jsx](./src/pages/GameRoom.jsx)).
  Only the host sees the time-limit/word-count pickers; this is a
  client-side gate only, same trust model as the rest of this no-auth v1.
- **Time limits** ([config.js](./src/games/guessTheWord/config.js)): 15s,
  30s, or 45s per word, chosen once for the whole session.
- **Sessions**: a host-chosen time limit + word count (1-5) shares one
  `session_id`; each word is a `rounds` row with a `word_index`/
  `total_words`. A unique `(session_id, word_index)` constraint means if
  two clients race to advance to the next word, only one insert wins — the
  loser's error is swallowed and its realtime subscription picks up the
  winner's round.
- **Claiming a word**: `submit_word_guess()` re-checks the pattern and the
  round clock server-side, then tries to insert into `answers`, which has
  a unique `(round_id, guess)` constraint — that's what actually makes
  "only one player can claim a word" hold up even if two people submit the
  same word at the same instant; the second insert just fails. Each claim
  is worth a flat 1 point, added to `players.score` in the same
  transaction. The claimed-words list at the bottom of the screen is every
  row in `answers` for the round, live via Realtime.
- **Known limitation**: the dictionary check only runs client-side —
  `submit_word_guess()` still only re-verifies the pattern and the clock,
  not realness (mirroring a 275k-word list into Postgres and checking it
  per guess is disproportionate for this app). A modified client could
  skip `isValidWord()` and submit pattern-matching gibberish straight to
  the RPC and still score. Consistent with this app's existing no-auth,
  casual-party trust model (see `rooms`' publicly-readable RLS).
