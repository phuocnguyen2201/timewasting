// Shared English dictionary lookup, used by any game that needs to check a
// guess is a real word. Loaded via a dynamic import so Vite code-splits it
// into its own chunk — it's ~3MB of JSON (an-array-of-english-words, ~275k
// words), never in the initial page bundle, only fetched once a game
// actually needs it.
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
// as a game screen mounts so it's already loaded by the time anyone
// submits a guess.
export function preloadDictionary() {
  loadDictionary()
}

export async function isValidWord(word) {
  const dictionary = await loadDictionary()
  return dictionary.has(word.toUpperCase())
}

// For callers that want to run many lookups (e.g. scanning a whole grid for
// every real word it happens to contain) without an await per word.
export async function getDictionary() {
  return loadDictionary()
}
