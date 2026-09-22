import { useEffect, useRef, useState } from 'react'
import { preloadDictionary } from '../../lib/dictionary'
import { supabase } from '../../lib/supabase'
import {
  BREAK_SECONDS,
  DIFFICULTIES,
  HINT_DELAY_SECONDS,
  SUBMIT_DEBOUNCE_MS,
  TOTAL_ROUNDS,
} from './config'
import { cellsForPlacement, generatePuzzle } from './grid'
import { pickRandomTheme } from './themes'

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }

const PLAYER_COLORS = [
  'bg-indigo-300 dark:bg-indigo-800',
  'bg-emerald-300 dark:bg-emerald-800',
  'bg-amber-300 dark:bg-amber-800',
  'bg-rose-300 dark:bg-rose-800',
  'bg-sky-300 dark:bg-sky-800',
  'bg-violet-300 dark:bg-violet-800',
  'bg-teal-300 dark:bg-teal-800',
  'bg-orange-300 dark:bg-orange-800',
]

function colorForPlayer(playerId, players) {
  const idx = players.findIndex((p) => p.id === playerId)
  return PLAYER_COLORS[Math.max(idx, 0) % PLAYER_COLORS.length]
}

export default function WordSearch({ room, myPlayerId, isHost, players }) {
  const [round, setRound] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  // generatePuzzle() scans the finished grid for bonus real-word finds, so
  // kick off the (~3MB, code-split) dictionary fetch as soon as the game
  // screen mounts, well before the host clicks a difficulty.
  useEffect(() => {
    preloadDictionary()
  }, [])

  // Load the current round (if any) and stay subscribed to new ones.
  useEffect(() => {
    let ignore = false

    async function loadLatestRound() {
      const { data } = await supabase
        .from('word_search_rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!ignore && data) setRound(data)
    }

    loadLatestRound()

    const channel = supabase
      .channel(`word-search-rounds:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'word_search_rounds',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => setRound(payload.new)
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [room.id])

  async function handleStartSession(difficulty) {
    setStarting(true)
    setError(null)
    try {
      const theme = pickRandomTheme()
      const puzzle = await generatePuzzle(difficulty, theme)
      const { data, error } = await supabase
        .from('word_search_rounds')
        .insert({
          room_id: room.id,
          round_index: 1,
          total_rounds: TOTAL_ROUNDS,
          difficulty,
          theme,
          ...puzzle,
        })
        .select()
        .single()
      if (error) throw error
      setRound(data)

      if (room.status !== 'started') {
        await supabase.from('rooms').update({ status: 'started' }).eq('id', room.id)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }

  async function handleSessionEnd() {
    setRound(null)
    // Reopen the room to new joiners now that the game is back at the
    // setup screen.
    await supabase.from('rooms').update({ status: 'waiting' }).eq('id', room.id)
  }

  if (round) {
    return (
      <RoundView
        key={round.id}
        round={round}
        room={room}
        myPlayerId={myPlayerId}
        isHost={isHost}
        players={players}
        onSessionEnd={handleSessionEnd}
      />
    )
  }

  if (!isHost) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <p className="text-gray-500 dark:text-gray-400">
          Waiting for the host to start the game...
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="max-w-xs text-center text-gray-500 dark:text-gray-400">
        Pick a difficulty. {TOTAL_ROUNDS} rounds, a new themed grid each
        round — press the letters of a hidden word in order to claim it
        before someone else does.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {Object.entries(DIFFICULTIES).map(([key, d]) => (
          <button
            key={key}
            onClick={() => handleStartSession(key)}
            disabled={starting}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            {d.label}{' '}
            <span className="font-normal text-gray-400">
              — {d.rows}x{d.cols}, {d.wordCount} words
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function RoundView({ round, room, myPlayerId, isHost, players, onSessionEnd }) {
  const [selectedCells, setSelectedCells] = useState([]) // [{ row, col }] in press order
  const [claims, setClaims] = useState([]) // [{ id, player_id, word }]
  const [submitting, setSubmitting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [breakCountdown, setBreakCountdown] = useState(BREAK_SECONDS)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const claimsRef = useRef(claims)
  claimsRef.current = claims

  function playerName(playerId) {
    return players.find((p) => p.id === playerId)?.name ?? '...'
  }

  // Drives the hint timer below — ticking every second is plenty for a
  // 45s threshold.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Load + subscribe to words claimed so far this round.
  useEffect(() => {
    let ignore = false

    async function loadClaims() {
      const { data } = await supabase
        .from('word_search_answers')
        .select('id, player_id, word, answered_at')
        .eq('round_id', round.id)
        .order('answered_at', { ascending: true })
      if (!ignore && data) setClaims(data)
    }
    loadClaims()

    const channel = supabase
      .channel(`word-search-answers:${round.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'word_search_answers',
          filter: `round_id=eq.${round.id}`,
        },
        (payload) => setClaims((prev) => [...prev, payload.new])
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [round.id])

  const isLastRound = round.round_index >= round.total_rounds
  const allFound = claims.length >= round.words.length
  const myClaims = claims.filter((c) => c.player_id === myPlayerId)

  async function handleNext() {
    if (advancing) return
    setAdvancing(true)

    const theme = pickRandomTheme()
    const puzzle = await generatePuzzle(round.difficulty, theme)
    const { error } = await supabase.from('word_search_rounds').insert({
      room_id: room.id,
      session_id: round.session_id,
      round_index: round.round_index + 1,
      total_rounds: round.total_rounds,
      difficulty: round.difficulty,
      theme,
      ...puzzle,
    })

    // 23505 = another client already advanced this session; the new round
    // will arrive for us via realtime either way.
    if (error && error.code !== '23505') {
      setError(error.message)
      setAdvancing(false)
    }
  }

  // Once every word's found, auto-advance to the next round after a short
  // break — except on the final round, which stays put so the scoreboard
  // below stays visible until the host starts a new game.
  useEffect(() => {
    if (!allFound || isLastRound) return
    setBreakCountdown(BREAK_SECONDS)
    const countdown = setInterval(() => {
      setBreakCountdown((s) => Math.max(0, s - 1))
    }, 1000)
    const timeout = setTimeout(() => {
      handleNext()
    }, BREAK_SECONDS * 1000)
    return () => {
      clearInterval(countdown)
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFound, isLastRound])

  const pendingWord = selectedCells.map(({ row, col }) => round.grid[row][col]).join('')

  // Verified exactly like the old typing flow: check the built-up word
  // against the round's word list and the claims already in, then let the
  // atomic submit_word_search_guess RPC (unique on round + word) be the
  // authority — that's what actually makes "other players can't claim it
  // once someone has" hold under a race, same as every other game here.
  async function submitGuess(normalized) {
    if (!normalized) return
    setError(null)

    if (!round.words.includes(normalized)) {
      setError(`"${normalized}" isn't a hidden word.`)
      return
    }
    if (claimsRef.current.some((c) => c.word === normalized)) {
      setError(`Someone already found "${normalized}".`)
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('submit_word_search_guess', {
        p_round_id: round.id,
        p_player_id: myPlayerId,
        p_guess: normalized,
      })
      if (error) throw error
      const { status } = data[0]
      if (status === 'already_claimed') {
        setError(`Someone already found "${normalized}".`)
      } else if (status === 'not_in_list') {
        setError(`"${normalized}" isn't a hidden word.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleCellPress(row, col) {
    if (allFound || submitting) return
    setError(null)
    setSelectedCells((prev) => [...prev, { row, col }])
  }

  function handleClearSelection() {
    setSelectedCells([])
    setError(null)
  }

  // A pause of SUBMIT_DEBOUNCE_MS after the last press auto-submits
  // whatever's been built up so far, then clears the selection either way
  // so the next word starts fresh.
  useEffect(() => {
    if (selectedCells.length === 0) return
    const timeout = setTimeout(() => {
      submitGuess(pendingWord)
      setSelectedCells([])
    }, SUBMIT_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCells])

  // Cell -> player color for every claimed word's letters.
  const cellColor = {}
  for (const placement of round.placements) {
    const claim = claims.find((c) => c.word === placement.word)
    if (!claim) continue
    const color = colorForPlayer(claim.player_id, players)
    for (const { row, col } of cellsForPlacement(placement)) {
      cellColor[`${row}-${col}`] = color
    }
  }

  const selectedSet = new Set(selectedCells.map(({ row, col }) => `${row}-${col}`))

  // Support: once nobody's found a new word in a while, give everyone a
  // nudge by highlighting the first letter of one undiscovered word. The
  // clock resets on every find, so the threshold is "45s stuck on the same
  // word," not "45s into the round." Derived straight from shared
  // round/claims data (no extra state to sync), so it always lands on the
  // same word for every player, and automatically moves to another
  // undiscovered word — with its own fresh 45s — once that one's claimed.
  const lastFindAt =
    claims.length > 0
      ? Math.max(...claims.map((c) => new Date(c.answered_at).getTime()))
      : new Date(round.started_at).getTime()
  const secondsSinceLastFind = (now - lastFindAt) / 1000
  const hintWord =
    !allFound && secondsSinceLastFind >= HINT_DELAY_SECONDS
      ? round.words.find((w) => !claims.some((c) => c.word === w))
      : null
  const hintPlacement = hintWord
    ? round.placements.find((p) => p.word === hintWord)
    : null
  const hintCellKey = hintPlacement ? `${hintPlacement.row}-${hintPlacement.col}` : null

  return (
    <div className="flex flex-1 flex-col items-center gap-5 p-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400">
          Round {round.round_index}/{round.total_rounds} · {round.theme} ·{' '}
          {DIFFICULTIES[round.difficulty]?.label}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {claims.length}/{round.words.length} found · You found{' '}
          {myClaims.length}
        </p>
        {hintCellKey && (
          <p className="mt-1 text-xs font-semibold text-amber-500 dark:text-amber-400">
            Hint: a starting letter is highlighted below
          </p>
        )}
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${round.cols}, minmax(0, 1fr))` }}
      >
        {round.grid.map((rowLetters, r) =>
          rowLetters.map((letter, c) => {
            const cellKey = `${r}-${c}`
            const isSelected = selectedSet.has(cellKey)
            const isHint = !isSelected && hintCellKey === cellKey
            return (
              <button
                key={cellKey}
                type="button"
                onClick={() => handleCellPress(r, c)}
                disabled={allFound || submitting}
                className={`flex aspect-square w-11 select-none items-center justify-center rounded-lg font-mono text-lg font-bold transition active:scale-90 disabled:cursor-not-allowed sm:w-14 sm:text-2xl ${
                  cellColor[cellKey] ??
                  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                } ${isSelected ? 'ring-4 ring-indigo-500' : ''} ${
                  isHint ? 'animate-pulse ring-4 ring-amber-400' : ''
                }`}
              >
                {letter}
              </button>
            )
          })
        )}
      </div>

      <div className="flex min-h-[2.5rem] w-full max-w-xs items-center justify-center gap-3 rounded-lg border border-gray-200 px-4 py-2 dark:border-gray-800">
        <p className="flex-1 text-center font-mono text-xl font-bold tracking-[0.2em] text-gray-900 dark:text-gray-100">
          {pendingWord || (
            <span className="text-sm font-normal tracking-normal text-gray-400">
              Press letters to spell a word...
            </span>
          )}
        </p>
        {selectedCells.length > 0 && (
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      {claims.length > 0 && (
        <div className="flex w-full max-w-xs flex-wrap justify-center gap-2">
          {claims.map((claim) => (
            <span
              key={claim.word}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${colorForPlayer(
                claim.player_id,
                players
              )}`}
            >
              {claim.word} · {playerName(claim.player_id)}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {allFound && !isLastRound && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All words found! Next round in {breakCountdown}s...
        </p>
      )}

      {allFound && isLastRound && (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
            Game over — every word found!
          </p>
          <FinalScoreboard players={players} />
          {isHost ? (
            <button
              onClick={onSessionEnd}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Play again →
            </button>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Waiting for the host to start a new game...
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Standard competition ranking (1224): tied scores share a place, and the
// next distinct score picks up at the rank it would've had without the tie.
function FinalScoreboard({ players }) {
  const ranked = [...players].sort((a, b) => b.score - a.score)
  const ranks = ranked.map((p, i) =>
    i > 0 && p.score < ranked[i - 1].score ? null : i + 1
  )
  // Fill ties forward: a null (score equal to the previous row) picks up
  // the rank of the row above it.
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === null) ranks[i] = ranks[i - 1]
  }

  return (
    <div className="w-full max-w-xs">
      <p className="mb-2 text-center text-xs uppercase tracking-wide text-gray-400">
        Final Scoreboard
      </p>
      <ol className="space-y-1">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900"
          >
            <span className="flex items-center gap-2">
              <span className="w-6 text-center text-gray-400">
                {MEDALS[ranks[i]] ?? ranks[i]}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {p.name}
              </span>
            </span>
            <span className="font-mono text-gray-700 dark:text-gray-300">
              {p.score}
            </span>
          </li>
        ))}
        {ranked.length === 0 && (
          <li className="py-2 text-center text-sm text-gray-400">No players</li>
        )}
      </ol>
    </div>
  )
}
