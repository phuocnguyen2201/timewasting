export const TOTAL_ROUNDS = 3
export const BREAK_SECONDS = 5

// If this many seconds pass with no new word found (reset on every find),
// the first letter of one still-undiscovered word gets highlighted for
// everyone.
export const HINT_DELAY_SECONDS = 45

// How long a player can pause between cell presses before their current
// selection auto-submits as a guess.
export const SUBMIT_DEBOUNCE_MS = 500

// Direction vectors are [dRow, dCol] — all 8 compass directions (forward
// and reversed, straight and diagonal) at every difficulty, so a word is
// never just "reading left to right."
export const ALL_DIRECTIONS = [
  [0, 1], // right
  [0, -1], // left
  [1, 0], // down
  [-1, 0], // up
  [1, 1], // diagonal down-right
  [1, -1], // diagonal down-left
  [-1, 1], // diagonal up-right
  [-1, -1], // diagonal up-left
]

export const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    rows: 6,
    cols: 6,
    wordCount: 3,
    directions: ALL_DIRECTIONS,
  },
  medium: {
    label: 'Medium',
    rows: 6,
    cols: 8,
    wordCount: 3,
    directions: ALL_DIRECTIONS,
  },
}
