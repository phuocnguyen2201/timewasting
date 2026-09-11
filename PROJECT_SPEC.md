# Game Night App — Project Spec

## Overview
A browser-based, mobile-first multiplayer game app. Players enter a name, browse
a catalog of games, create or join a game room via a 4-character code, play,
and see a live leaderboard.

## Tech Stack
- **Frontend:** React + Tailwind CSS
- **Backend / DB / Realtime:** Supabase (Postgres + Auth + Realtime)
- **Hosting:** Netlify (frontend). Supabase hosts the backend/DB itself.

## Screens / User Flow

### 1. Landing Screen
- Displays app name/logo
- Input field: player name
- Continue button → goes to Game List screen

### 2. Game List Screen
- Search bar (top)
- Filter controls (top)
- Grid of available games, displayed in **2 columns**
- Tapping a game opens two options:
  - **Create Game** → generates a room
  - **Join Game** → enter existing room code

### 3. Create Game Flow
- Generates a **4-character room code** (uppercase, avoid ambiguous chars like 0/O, 1/I)
- Code is displayed prominently with a **copy-to-clipboard** button for sharing
- Room is created in Supabase (table: `rooms`), host = creator

### 4. Join Game Flow
- Input field for entering a 4-character code
- Validates code against active rooms in Supabase
- On success, joins the room and syncs player list via Supabase Realtime

### 5. Game Screen
- Actual gameplay area (TBD per game type)
- **Leaderboard** displayed at the bottom of the screen, updating live via
  Supabase Realtime subscriptions as scores change

## Data Model (initial draft)
- `games` — id, name, description, thumbnail, category (for search/filter)
- `rooms` — id, code (4-char, unique/active), game_id, host_id, status, created_at
- `players` — id, room_id, name, score, joined_at
- Realtime channel per room for player join/leave + score updates

## Open Questions / Next Decisions
- What type(s) of games are being built first (trivia, card-based, turn-based)?
  This determines how much game logic runs client-side vs. needs server functions.
- Do we need player auth, or is a per-session name (no login) enough for v1?
- Room code expiry / cleanup strategy (e.g. auto-close inactive rooms after X min)

## Setup Notes for Claude Code
- Initialize with Vite + React + Tailwind
- Add Supabase client SDK, connect to project via `.env` (SUPABASE_URL, SUPABASE_ANON_KEY)
- Set up Netlify deploy (netlify.toml, build command `npm run build`, publish dir `dist`)
- Use Supabase Realtime channels for room state and leaderboard sync
