// Only used to source each round's pattern (see pickRandomWord() /
// patternFromWord()) — the round stores the *shape* of the word it picked
// (first char, last char), never the word itself, and never its length
// either: hundreds of real words start with "H" and end with "E" at all
// kinds of lengths (HOUSE, HIKE, HORRIBLE, ...), so pinning the length
// would reject just as many valid answers as storing one fixed word did.
// Guesses are checked against a real dictionary instead — see
// isValidWord() below — not this list.
export const DICTIONARY = [
  'CAKE', 'FROG', 'KITE', 'LAMP', 'MOON', 'RAIN', 'SNOW', 'STAR',
  'BOAT', 'DOOR', 'FISH', 'GOLD', 'LEAF', 'NEST', 'RING', 'SHIP',
  'BEACH', 'CHAIR', 'CLOUD', 'HOUSE', 'HORSE', 'MUSIC', 'PLANT', 'RIVER',
  'SMILE', 'HEDGE', 'MOUSE', 'PLATE', 'STONE', 'TABLE', 'TIGER', 'WATCH',
  'PENGUIN', 'JOURNEY', 'BLANKET', 'VOLCANO', 'HARMONY', 'CRYSTAL',
  'FESTIVAL', 'DOLPHIN', 'CAPSULE', 'GALLERY', 'ORCHARD', 'PYRAMID',
  'SANDWICH', 'STADIUM', 'TSUNAMI', 'UMBRELLA', 'WHISPER', 'CABINET',
  'DIAMOND', 'ELEPHANT',
  'ENCYCLOPEDIA', 'MISCHIEVOUS', 'PHOTOSYNTHESIS', 'XYLOPHONE',
  'CHOREOGRAPHY', 'ENTREPRENEUR', 'HIPPOPOTAMUS', 'KALEIDOSCOPE',
  'PROCRASTINATE', 'RENDEZVOUS', 'SILHOUETTE', 'BUREAUCRACY',
  'CONNOISSEUR', 'INCONSPICUOUS', 'ONOMATOPOEIA', 'PARALLELOGRAM',
  'QUINTESSENTIAL', 'SUBTERRANEAN', 'UNPRECEDENTED', 'WHEELBARROW',
]

export function pickRandomWord() {
  return DICTIONARY[Math.floor(Math.random() * DICTIONARY.length)]
}

export function patternFromWord(word) {
  return {
    start_char: word[0],
    end_char: word[word.length - 1],
  }
}

// Real dictionary validation lives in lib/dictionary.js, shared with any
// other game that needs to check a guess is a real word — re-exported here
// so existing imports of these two names keep working unchanged.
export { isValidWord, preloadDictionary } from '../../lib/dictionary'

export function matchesPattern(word, { start_char, end_char }) {
  const w = word.toUpperCase().trim()
  return (
    w.length > 0 &&
    w[0] === start_char.toUpperCase() &&
    w[w.length - 1] === end_char.toUpperCase()
  )
}
