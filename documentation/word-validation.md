# Guess the Word — Session Changes & Word Validation

This documents the changes made to the **Guess the Word** game in this
session, with most of the detail on how guess validation evolved and how
it works now.

## Summary of changes

1. **Scaffolded the project** — Vite + React + Tailwind, Supabase client,
   Netlify config, per `PROJECT_SPEC.md`.
2. **Built the first game, Guess the Word** — difficulty modes, masked
   word display, timed rounds, time-based scoring.
3. **Added a Home button** to leave a room.
4. **Room status lifecycle** — `waiting` → `started` → back to `waiting`
   when a session ends, and `expired` once the last player leaves
   (`leave_room()`, atomic via a row lock so two simultaneous leaves can't
   both skip the expiry).
5. **Host + multi-word sessions** — the room creator becomes host
   (`rooms.host_id`); only the host picks the session's settings before
   play starts, and the game round-trips through 1–5 words before
   returning to the setup screen with a 5s reveal + skip-ahead "Next
   word" step between them.
6. **Redesigned the word mechanic** (the bulk of this doc) — from "one
   stored target word" to "a pattern, verified against a real
   dictionary." See below.

## Word validation: the problem and how it evolved

### Attempt 1 — store one target word, compare for equality

The original design picked one word per round, stored it in
`rounds.word`, masked it to its first/last letter (`H___E`), and checked
guesses with `guess === word`.

**Bug:** many real words share a shape. `H___E` fits both `HOUSE` and
`HORSE` — a player typing `HORSE` was wrongly marked wrong because the
round had happened to store `HOUSE`. Comparing against a single stored
answer is the wrong model whenever more than one valid answer exists.

### Attempt 2 — store the pattern, not the word; check length + first/last char

Fixed by no longer storing a specific word at all. `rounds` stored only
`start_char`, `end_char`, and `word_length`; any guess matching all three
was accepted, with the actual "is this a real word" check done by looking
a normalized guess up in a small curated word list bundled in the app
(`DICTIONARY` in `words.js`).

**Bug found next:** pinning `word_length` has the same problem at a
bigger scale. Hundreds of real words start with "H" and end with "E" —
`HOUSE` (5), `HIKE` (4), `HORRIBLE` (8) — at every length. Requiring a
specific length rejected just as many valid answers as storing one fixed
word did. `word_length` was dropped; `rounds` now stores only
`start_char`/`end_char`.

### Attempt 3 — structural check only (letters + optional hyphen)

At one point `isValidWord()` was reimplemented as a purely structural,
single-pass check (adapted from a GeeksforGeeks algorithm): does the
string consist of letters, with at most one internal hyphen flanked by
letters on both sides?

**Bug found by manual testing:** a structural check can't tell a real
word from a word-shaped one. Typing `BsdfkdsfkT` against a `B...T`
pattern passed — it matches the first/last letter and is "shaped" like a
word (all letters), but it isn't a word at all. This is the same root
problem as Attempt 1, one level down: matching a *shape* (letters,
first/last character) isn't the same as matching *meaning*.

### Current implementation — real dictionary lookup

`isValidWord()` now checks a guess against
[`an-array-of-english-words`](https://www.npmjs.com/package/an-array-of-english-words),
a package exporting ~275,000 real English words as plain JSON.

```js
// src/games/guessTheWord/words.js
let dictionaryPromise = null

function loadDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = import('an-array-of-english-words').then(
      (mod) => new Set(mod.default.map((word) => word.toUpperCase()))
    )
  }
  return dictionaryPromise
}

// Kicks off the dictionary fetch without waiting on it — call this as soon
// as the game screen mounts so it's already loaded by the time anyone
// submits a guess.
export function preloadDictionary() {
  loadDictionary()
}

export async function isValidWord(word) {
  const dictionary = await loadDictionary()
  return dictionary.has(word.toUpperCase())
}
```

Guess validation for a submission is now two independent checks, both run
client-side before a guess is ever sent to the server
(`GuessTheWord.jsx`):

```js
if (!matchesPattern(normalized, round)) {
  setError(`Must start with ${round.start_char} and end with ${round.end_char}.`)
  return
}
...
if (!(await isValidWord(normalized))) {
  setError(`"${normalized}" isn't a real word.`)
  setSubmitting(false)
  return
}
```

- **`matchesPattern(word, { start_char, end_char })`** — cheap, synchronous
  shape check: does the guess start and end with the round's two letters?
- **`isValidWord(word)`** — the actual "is this real" check: dictionary
  membership.

Verified directly against the real data:

| Guess | `matchesPattern` (B...T) | `isValidWord` |
|---|---|---|
| `BAT` | ✅ | ✅ |
| `BSDFKDSFKT` | ✅ | ❌ (correctly rejected) |
| `HOUSE` | — | ✅ |
| `HORSE` | — | ✅ |
| `HORRIBLE` | — | ✅ |

### Why a dynamic `import()`

The word list is ~3 MB of JSON. A static `import` would bundle it into
the app's main JS, slowing down the Landing and Game List screens for
everyone, including players who never open this game. Using
`import('an-array-of-english-words')` instead lets Vite code-split it
into its own chunk, confirmed in the production build:

```
dist/assets/index-*.js                        495.47 kB │ gzip: 143.00 kB
dist/assets/an-array-of-english-words-*.js   3,362.61 kB │ gzip: 756.23 kB
```

`preloadDictionary()` is called once when the game screen mounts (not
when a round starts), so the fetch has already completed by the time
anyone is ready to type a guess.

### Known limitation

The dictionary check only runs **client-side**. The server-side RPC
(`submit_word_guess()` in `supabase/schema.sql`) re-verifies the pattern
and the round clock authoritatively, but not word realness — mirroring a
275k-word dictionary into Postgres and querying it per guess was judged
disproportionate for this app. A modified client could skip
`isValidWord()` and submit pattern-matching gibberish straight to the RPC
and still score a point. This is consistent with the rest of the app's
no-auth, casual-party trust model (e.g. `rooms`' RLS is publicly
readable/writable) — not a new gap introduced by this change.

If that trade-off ever needs closing: mirror the same word list (or a
curated subset) into a Postgres table and check membership inside
`submit_word_guess()`, so scoring stays authoritative even against a
tampered client.
