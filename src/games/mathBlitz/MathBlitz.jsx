import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BREAK_SECONDS,
  DIFFICULTIES,
  TOTAL_ROUNDS,
  computeAnswer,
  generateProblem,
  operatorSymbol,
} from './config'

export default function MathBlitz({ room, myPlayerId, isHost, players }) {
  const [round, setRound] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  // Load the current round (if any) and stay subscribed to new ones, plus
  // updates to the current one (that's how a client learns someone else
  // already solved it).
  useEffect(() => {
    let ignore = false

    async function loadLatestRound() {
      const { data } = await supabase
        .from('math_rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!ignore && data) setRound(data)
    }

    loadLatestRound()

    const channel = supabase
      .channel(`math-rounds:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'math_rounds',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => setRound(payload.new)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'math_rounds',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) =>
          setRound((prev) => (prev && prev.id === payload.new.id ? payload.new : prev))
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [room.id])

  async function handleStart(difficulty) {
    setStarting(true)
    setError(null)
    try {
      const problem = generateProblem(difficulty)
      const { data, error } = await supabase
        .from('math_rounds')
        .insert({
          room_id: room.id,
          round_index: 1,
          total_rounds: TOTAL_ROUNDS,
          difficulty,
          operand_a: problem.operand_a,
          operand_b: problem.operand_b,
          operator: problem.operator,
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
        myPlayerId={myPlayerId}
        players={players}
        onSessionEnd={handleSessionEnd}
        onRoundUpdate={setRound}
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
        Pick a difficulty. {TOTAL_ROUNDS} rounds — first to solve each
        problem wins the point.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {Object.entries(DIFFICULTIES).map(([key, d]) => (
          <button
            key={key}
            onClick={() => handleStart(key)}
            disabled={starting}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            {d.label}{' '}
            <span className="font-normal text-gray-400">
              — {d.timeoutSeconds}s per problem
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function RoundView({ round, myPlayerId, players, onSessionEnd, onRoundUpdate }) {
  const [now, setNow] = useState(() => Date.now())
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(interval)
  }, [])

  function playerName(playerId) {
    return players.find((p) => p.id === playerId)?.name ?? '...'
  }

  const timeoutSeconds = DIFFICULTIES[round.difficulty].timeoutSeconds
  const startedAtMs = new Date(round.started_at).getTime()
  const elapsed = (now - startedAtMs) / 1000
  const answered = Boolean(round.winner_player_id)
  const timeLeft = Math.max(0, Math.ceil(timeoutSeconds - elapsed))
  const expired = !answered && elapsed >= timeoutSeconds
  const roundOver = answered || expired
  const guessingOpen = !roundOver
  const isLastRound = round.round_index >= round.total_rounds

  const roundEndMs = answered
    ? new Date(round.answered_at).getTime()
    : startedAtMs + timeoutSeconds * 1000
  const breakLeft = roundOver
    ? Math.max(0, Math.ceil(BREAK_SECONDS - (now - roundEndMs) / 1000))
    : BREAK_SECONDS

  async function handleAdvance() {
    if (advancing) return
    setAdvancing(true)

    if (isLastRound) {
      onSessionEnd()
      return
    }

    try {
      const problem = generateProblem(round.difficulty)
      const { data, error } = await supabase
        .from('math_rounds')
        .insert({
          room_id: round.room_id,
          session_id: round.session_id,
          round_index: round.round_index + 1,
          total_rounds: round.total_rounds,
          difficulty: round.difficulty,
          operand_a: problem.operand_a,
          operand_b: problem.operand_b,
          operator: problem.operator,
        })
        .select()
        .single()

      if (error) {
        // 23505 = another client already advanced this session; the new
        // round will arrive for us via realtime instead.
        if (error.code === '23505') return
        throw error
      }

      // Update our own state directly rather than waiting on realtime —
      // this is also what keeps things moving if that INSERT event never
      // arrives (dropped connection, etc.) instead of leaving the screen
      // stuck on "Round complete" forever.
      onRoundUpdate(data)
    } catch (err) {
      setError(err.message)
      setAdvancing(false)
    }
  }

  // Once the round's over (won or timed out), auto-advance after the break.
  useEffect(() => {
    if (!roundOver || breakLeft > 0) return
    handleAdvance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundOver, breakLeft])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!guessingOpen || submitting) return
    const trimmed = guess.trim()
    const parsed = Number(trimmed)
    if (trimmed === '' || Number.isNaN(parsed)) {
      setError('Enter a number.')
      return
    }
    setError(null)
    setSubmitting(true)

    try {
      const { data, error } = await supabase.rpc('submit_math_guess', {
        p_round_id: round.id,
        p_player_id: myPlayerId,
        p_guess: parsed,
      })
      if (error) throw error
      const { status } = data[0]
      if (status === 'correct') {
        setGuess('')
        // Same reasoning as handleAdvance above: don't wait on the
        // realtime UPDATE event to show our own win.
        onRoundUpdate({
          ...round,
          winner_player_id: myPlayerId,
          answered_at: new Date().toISOString(),
        })
      } else if (status === 'already_answered') {
        setError('Someone already solved it!')
      } else if (status === 'incorrect') {
        setError('Not quite — try again.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <p className="text-xs uppercase tracking-wide text-gray-400">
        Round {round.round_index}/{round.total_rounds}
      </p>

      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-5xl font-extrabold text-gray-900 dark:text-gray-100">
          {round.operand_a} {operatorSymbol(round.operator)} {round.operand_b}
        </p>
        {!roundOver && (
          <p className="font-mono text-2xl font-bold text-indigo-600">{timeLeft}s</p>
        )}
      </div>

      {guessingOpen && (
        <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
          <input
            type="number"
            inputMode="numeric"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Your answer..."
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={submitting || guess.trim() === ''}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {roundOver && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {answered ? 'Round complete!' : "Time's up!"}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {answered
              ? `${playerName(round.winner_player_id)} got it first.`
              : 'Nobody solved it in time.'}{' '}
            Answer: {computeAnswer(round)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLastRound ? 'Moving to final results' : 'Moving to next round'} in {breakLeft}s...
          </p>
        </div>
      )}
    </div>
  )
}
