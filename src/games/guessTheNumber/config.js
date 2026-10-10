export const SETUP_SECONDS = 45
export const DIGIT_COUNT = 4

export function randomDigit() {
  return String(Math.floor(Math.random() * 10))
}

// Blank slots get random digits, so a player who runs out of setup time
// still ends up with a valid 4-digit number.
export function fillBlanks(slots) {
  return slots.map((d) => d || randomDigit()).join('')
}

// Digits revealed by one player's guesses, by position. Those guesses are
// against the other player's number, so the board is that number's pattern.
export function revealedFrom(guesses, guesserId) {
  const board = Array(DIGIT_COUNT).fill(null)
  for (const g of guesses) {
    if (g.guesser_id !== guesserId) continue
    for (let i = 0; i < DIGIT_COUNT; i++) {
      if (g.hits[i] === '1') board[i] = g.guess[i]
    }
  }
  return board
}

// Your own number lives only on your device, so you can still see it after
// a while. The server never sends it back. Storage can be blocked, in which
// case the number just isn't remembered.
const storageKey = (matchId, playerId) => `guess-number:${matchId}:${playerId}`

export function saveMyNumber(matchId, playerId, digits) {
  try {
    sessionStorage.setItem(storageKey(matchId, playerId), digits)
  } catch {
    // Not remembered on this device.
  }
}

export function loadMyNumber(matchId, playerId) {
  try {
    return sessionStorage.getItem(storageKey(matchId, playerId))
  } catch {
    return null
  }
}

export function hitCount(hits) {
  return [...hits].filter((c) => c === '1').length
}
