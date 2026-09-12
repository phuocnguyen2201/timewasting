export const COUNTDOWN_SECONDS = 3
export const BREAK_SECONDS = 5
export const TOTAL_ROUNDS = 3

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function pickRandomLetter() {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)]
}
