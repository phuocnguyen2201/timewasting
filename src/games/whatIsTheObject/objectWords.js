import OBJECT_WORDS from './objectWords.json'

// A curated, human-vetted list of ~6,800 common nouns (public domain —
// desiquintans.com/nounlist), used here instead of the general ~275k-word
// English dictionary in lib/dictionary.js. That general dictionary accepts
// *any* real word, including obscure/technical entries nobody would
// recognize as "a thing" — which is exactly why gibberish-feeling guesses
// were scoring. This list is hand-checked for commonly-known words, so a
// correct guess actually reads as a real object.
const OBJECT_WORD_SET = new Set(OBJECT_WORDS)

export function isObjectWord(word) {
  return OBJECT_WORD_SET.has(word.toUpperCase())
}
