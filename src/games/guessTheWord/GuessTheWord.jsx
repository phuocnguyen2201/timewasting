import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { REVEAL_SECONDS, TIME_OPTIONS, WORD_COUNT_OPTIONS } from './config'
import { maskPattern } from './mask'
import {
  isValidWord,
  matchesPattern,
  patternFromWord,
  pickRandomWord,
  preloadDictionary,
} from './words'

export default function GuessTheWord({ room, myPlayerId, isHost, players }) {
  const [round, setRound] = useState(null)
  const [selectedDuration, setSelectedDuration] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  // Kick off the (~3MB, code-split) dictionary fetch as soon as the game
  // screen mounts, well before anyone's ready to submit a guess.
  useEffect(() => {
    preloadDictionary()
  }, [])

  // Load the current round (if any) and stay subscribed to new ones.
  useEffect(() => {
    let ignore = false

    async function loadLatestRound() {
      const { data } = await supabase
        .from('rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!ignore && data) setRound(data)
    }

    loadLatestRound()

    const channel = supabase
      .channel(`rounds:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
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

  async function handleStartSession(totalWords) {
    setStarting(true)
    setError(null)
    try {
      const pattern = patternFromWord(pickRandomWord())
      const { data, error } = await supabase
        .from('rounds')
        .insert({
          room_id: room.id,
          duration_seconds: selectedDuration,
          ...pattern,
          total_words: totalWords,
          word_index: 1,
        })
        .select()
        .single()
      if (error) throw error
      setRound(data)
      setSelectedDuration(null)

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

  if (!selectedDuration) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-gray-500 dark:text-gray-400">Pick a time limit per word:</p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          {TIME_OPTIONS.map((seconds) => (
            <button
              key={seconds}
              onClick={() => setSelectedDuration(seconds)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              {seconds}s
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="text-gray-500 dark:text-gray-400">
        How many words? ({selectedDuration}s each)
      </p>
      <div className="grid w-full max-w-xs grid-cols-5 gap-2">
        {WORD_COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => handleStartSession(n)}
            disabled={starting}
            className="aspect-square rounded-lg border border-gray-300 text-lg font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            {n}
          </button>
        ))}
      </div>
      <button
        onClick={() => setSelectedDuration(null)}
        className="text-sm text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
      >
        ← Choose a different time limit
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function RoundView({ round, room, myPlayerId, players, onSessionEnd }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000
    return Math.max(0, round.duration_seconds - elapsed)
  })
  const [guess, setGuess] = useState('')
  const [claims, setClaims] = useState([]) // [{ id, player_id, guess, score_awarded }]
  const [submitting, setSubmitting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [revealCountdown, setRevealCountdown] = useState(REVEAL_SECONDS)
  const [error, setError] = useState(null)

  function playerName(playerId) {
    return players.find((p) => p.id === playerId)?.name ?? '...'
  }

  // Load + subscribe to words claimed so far this round.
  useEffect(() => {
    let ignore = false

    async function loadClaims() {
      const { data } = await supabase
        .from('answers')
        .select('id, player_id, guess, score_awarded')
        .eq('round_id', round.id)
        .order('answered_at', { ascending: true })
      if (!ignore && data) setClaims(data)
    }
    loadClaims()

    const channel = supabase
      .channel(`answers:${round.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
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

  // Countdown clock, driven off the round's server timestamp.
  useEffect(() => {
    function tick() {
      const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000
      setTimeLeft(Math.max(0, round.duration_seconds - elapsed))
    }
    const interval = setInterval(tick, 200)
    return () => clearInterval(interval)
  }, [round.started_at, round.duration_seconds])

  const revealed = timeLeft <= 0
  const isLastWord = round.word_index >= round.total_words
  const myClaims = claims.filter((c) => c.player_id === myPlayerId)

  async function handleNext() {
    if (advancing) return
    setAdvancing(true)

    if (isLastWord) {
      onSessionEnd()
      return
    }

    const pattern = patternFromWord(pickRandomWord())
    const { error } = await supabase.from('rounds').insert({
      room_id: room.id,
      session_id: round.session_id,
      duration_seconds: round.duration_seconds,
      ...pattern,
      total_words: round.total_words,
      word_index: round.word_index + 1,
    })

    // 23505 = another client already advanced this session; the new round
    // will arrive for us via realtime either way.
    if (error && error.code !== '23505') {
      setError(error.message)
      setAdvancing(false)
    }
  }

  // Once revealed, auto-advance after REVEAL_SECONDS unless someone skips.
  useEffect(() => {
    if (!revealed) return
    setRevealCountdown(REVEAL_SECONDS)
    const countdown = setInterval(() => {
      setRevealCountdown((s) => Math.max(0, s - 1))
    }, 1000)
    const timeout = setTimeout(() => {
      handleNext()
    }, REVEAL_SECONDS * 1000)
    return () => {
      clearInterval(countdown)
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])

  async function handleSubmit(e) {
    e.preventDefault()
    const normalized = guess.trim().toUpperCase()
    if (!normalized || revealed || submitting) return
    setError(null)

    // Check everything we can locally before spending a round trip: the
    // word has to fit the round's pattern and actually be a real word —
    // this is the "verify against a dictionary, don't just match the
    // first/last letter" fix.
    if (!matchesPattern(normalized, round)) {
      setError(`Must start with ${round.start_char} and end with ${round.end_char}.`)
      return
    }
    if (claims.some((c) => c.guess === normalized)) {
      setError(`Someone already guessed "${normalized}".`)
      return
    }

    setSubmitting(true)

    if (!(await isValidWord(normalized))) {
      setError(`"${normalized}" isn't a real word.`)
      setSubmitting(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc('submit_word_guess', {
        p_round_id: round.id,
        p_player_id: myPlayerId,
        p_guess: normalized,
      })
      if (error) throw error
      const { status } = data[0]
      if (status === 'correct') {
        setGuess('')
      } else if (status === 'already_claimed') {
        setError(`Someone already guessed "${normalized}".`)
      } else if (status === 'invalid_pattern') {
        setError(`"${normalized}" doesn't fit the pattern.`)
      } else if (status === 'time_up') {
        setError("Time's up!")
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400">
          Word {round.word_index}/{round.total_words} · You found {myClaims.length}
        </p>
        <p className="font-mono text-5xl font-bold tracking-[0.2em] text-gray-900 dark:text-gray-100">
          {maskPattern(round)}
        </p>
      </div>

      <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full bg-indigo-600 transition-[width] duration-200 ease-linear"
          style={{ width: `${(timeLeft / round.duration_seconds) * 100}%` }}
        />
      </div>
      <p className="font-mono text-lg text-gray-600 dark:text-gray-300">
        {timeLeft.toFixed(1)}s
      </p>

      {!revealed && (
        <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Your guess"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg uppercase focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={submitting || !guess.trim()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="w-full max-w-xs">
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
          Guessed words ({claims.length})
        </p>
        <ol className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
          {claims.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm dark:bg-gray-900"
            >
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                {c.guess}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {playerName(c.player_id)}
              </span>
            </li>
          ))}
          {claims.length === 0 && (
            <li className="py-2 text-center text-sm text-gray-400">
              No words guessed yet
            </li>
          )}
        </ol>
      </div>

      {revealed && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
            You found {myClaims.length} word{myClaims.length === 1 ? '' : 's'} this round.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLastWord ? 'Final results' : 'Next word'} in {revealCountdown}s...
          </p>
          <button
            onClick={handleNext}
            disabled={advancing}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            {isLastWord ? 'See results →' : 'Next word →'}
          </button>
        </div>
      )}
    </div>
  )
}
