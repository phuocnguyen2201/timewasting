import { getDictionary } from '../../lib/dictionary'
import { ALL_DIRECTIONS, DIFFICULTIES } from './config'
import { THEMES } from './themes'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const PLACEMENT_ATTEMPTS = 40

function randomLetter() {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
}

function shuffle(array) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// The cells a placement occupies, in order from its first letter to its
// last. Shared by the generator (to check/reserve cells) and the game view
// (to highlight a claimed word on the grid).
export function cellsForPlacement({ row, col, dr, dc, word }) {
  return Array.from({ length: word.length }, (_, i) => ({
    row: row + dr * i,
    col: col + dc * i,
  }))
}

// Every straight run of letters (either direction, length 3..size) that
// exists anywhere in the grid, as {word, row, col, dr, dc} placements. Used
// to find "bonus" words that landed in the grid purely from the random
// fill letters — see generatePuzzle() below for why that matters.
function scanGridRuns(grid, size) {
  const runs = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const [dr, dc] of ALL_DIRECTIONS) {
        let word = ''
        for (let len = 1; len <= size; len++) {
          const r = row + dr * (len - 1)
          const c = col + dc * (len - 1)
          if (r < 0 || r >= size || c < 0 || c >= size) break
          word += grid[r][c]
          if (word.length >= 3) {
            runs.push({ word, row, col, dr, dc })
          }
        }
      }
    }
  }
  return runs
}

// Builds a size x size letter grid with a subset of the theme's words
// hidden in it, per the given difficulty's directions/word count. Words may
// cross paths if they agree on the shared letter (the standard word-search
// technique) but never overwrite a conflicting one — a placement attempt
// that doesn't fit cleanly after PLACEMENT_ATTEMPTS tries is just skipped,
// so the round may end up with fewer words than the difficulty's target.
//
// The leftover cells are filled with random letters, and randomness being
// what it is, those fill letters sometimes spell out a real word by pure
// coincidence (e.g. "PIE" appearing diagonally without ever having been
// placed there) — the word list stays hidden from players (see WordSearch.
// jsx), so a player who spots one has no way to know it "wasn't supposed to
// count." Rather than fight that, this scans the finished grid for any
// other real dictionary word actually traceable in it and folds a capped,
// random sample of them into the round as legitimate bonus finds.
export async function generatePuzzle(difficulty, theme) {
  const { size, wordCount, directions } = DIFFICULTIES[difficulty]
  const candidates = shuffle(
    (THEMES[theme] ?? []).filter((w) => w.length >= 3 && w.length <= size)
  )

  const grid = Array.from({ length: size }, () => Array(size).fill(null))
  const placements = []

  for (const word of candidates) {
    if (placements.length >= wordCount) break

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const [dr, dc] = directions[Math.floor(Math.random() * directions.length)]

      // Valid start bounds for this direction, so the whole word lands
      // inside the grid.
      const rowStart = dr >= 0 ? 0 : word.length - 1
      const rowEnd = dr <= 0 ? size - 1 : size - word.length
      const colStart = dc >= 0 ? 0 : word.length - 1
      const colEnd = dc <= 0 ? size - 1 : size - word.length
      if (rowStart > rowEnd || colStart > colEnd) continue

      const row = rowStart + Math.floor(Math.random() * (rowEnd - rowStart + 1))
      const col = colStart + Math.floor(Math.random() * (colEnd - colStart + 1))

      let fits = true
      for (let i = 0; i < word.length && fits; i++) {
        const existing = grid[row + dr * i][col + dc * i]
        if (existing !== null && existing !== word[i]) fits = false
      }
      if (!fits) continue

      for (let i = 0; i < word.length; i++) {
        grid[row + dr * i][col + dc * i] = word[i]
      }
      placements.push({ word, row, col, dr, dc })
      break
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) grid[r][c] = randomLetter()
    }
  }

  const dictionary = await getDictionary()
  const seen = new Set(placements.map((p) => p.word))
  const bonusCap = Math.ceil(wordCount / 2)
  const bonusPlacements = []

  for (const run of shuffle(scanGridRuns(grid, size))) {
    if (bonusPlacements.length >= bonusCap) break
    if (seen.has(run.word) || !dictionary.has(run.word)) continue
    seen.add(run.word)
    bonusPlacements.push(run)
  }

  const allPlacements = [...placements, ...bonusPlacements]

  return {
    size,
    grid,
    words: allPlacements.map((p) => p.word),
    placements: allPlacements,
  }
}
