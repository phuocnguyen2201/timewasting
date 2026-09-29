# Game Night

A browser-based, mobile-friendly multiplayer game app. Create a room, share
the code, and play quick party games with friends in real time.

## How to play

1. **Open the app** and enter your name.
2. **Pick a game** from the list.
3. **Create a room**, or **join** a friend's room with their 4-letter room code.
4. **The host starts the game.** Everyone in the room plays at the same time,
   and points show up on the live leaderboard.
5. When the last round ends, the room reopens so you can play again.

### Games

- **Guess the Word** — Each round gives you a first and last letter (like
  `H ⋯ E`). Type as many real words as you can that fit. Each word can only
  be claimed once, so be quick. Most words wins.
- **Math Blitz** — A math problem appears. Be the first to type the right
  answer to score. The host picks the difficulty.
- **What Is The Object** — A letter appears. Be the first to name an object
  that starts with it.
- **Word Search** — Find the hidden words in the grid by tapping their
  letters in order. First to claim a word gets the point. The host picks the
  difficulty.

## Run it yourself

```bash
npm install
cp .env.example .env   # add your Supabase project URL + anon key
npm run dev
```

You'll need a free [Supabase](https://supabase.com) project. Put its URL and
anon key in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then
run the SQL files in the SQL editor to create the tables.

## Deploying

Pushes to `main` deploy automatically to GitHub Pages. Add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repo secrets and set
Pages → Source to **GitHub Actions**. Netlify also works via `netlify.toml`.

See [PROJECT_SPEC.md](./PROJECT_SPEC.md) for the full product spec.
