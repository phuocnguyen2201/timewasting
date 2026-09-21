export const TOTAL_ROUNDS = 3
export const BREAK_SECONDS = 5

// Direction vectors are [dRow, dCol] — all 8 compass directions (forward
// and reversed, straight and diagonal) at every difficulty, so a word is
// never just "reading left to right." Difficulty only scales grid size and
// word count.
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
    size: 6,
    wordCount: 3,
    directions: ALL_DIRECTIONS,
  },
  medium: {
    label: 'Medium',
    size: 8,
    wordCount: 3,
    directions: ALL_DIRECTIONS,
  },
  hard: {
    label: 'Hard',
    size: 10,
    wordCount: 3,
    directions: ALL_DIRECTIONS,
  },
}
