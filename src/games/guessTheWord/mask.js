// No word_length is stored anymore (see words.js), so there's no fixed
// number of blanks to render — just the two letters the answer has to
// start and end with.
export function maskPattern({ start_char, end_char }) {
  return `${start_char} ⋯ ${end_char}`
}
