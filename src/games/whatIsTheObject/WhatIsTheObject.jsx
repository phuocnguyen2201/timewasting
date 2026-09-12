import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BREAK_SECONDS, COUNTDOWN_SECONDS, TOTAL_ROUNDS, pickRandomLetter } from './config'
import { isObjectWord } from './objectWords'

export default function WhatIsTheObject({ room, myPlayerId, isHost, players }) {
  const [round, setRound] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  // Load the current round (if any) and stay subscribed to new ones, plus
  // updates to the current one (that's how a client learns someone else
  // already won it).
  useEffect(() => {
    let ignore = false

    async function loadLatestRound() {
      const { data } = await supabase
        .from('object_rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!ignore && data) setRound(data)
    }

    loadLatestRound()

    const channel = supabase
      .channel(`object-rounds:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'object_rounds',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => setRound(payload.new)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'object_rounds',
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

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('object_rounds')
        .insert({
          room_id: room.id,
          round_index: 1,
          total_rounds: TOTAL_ROUNDS,
          letter: pickRandomLetter(),
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
        {TOTAL_ROUNDS} rounds. Each round shows a letter — first to name an
        object starting with it wins the point.
      </p>
      <button
        onClick={handleStart}
        disabled={starting}
        className="w-full max-w-xs rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {starting ? 'Starting...' : 'Start'}
      </button>
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

  const elapsed = (now - new Date(round.started_at).getTime()) / 1000
  const answered = Boolean(round.winner_player_id)
  const countdownLeft = Math.max(0, Math.ceil(COUNTDOWN_SECONDS - elapsed))
  const guessingOpen = !answered && elapsed >= COUNTDOWN_SECONDS
  const isLastRound = round.round_index >= round.total_rounds

  const breakElapsed = answered
    ? (now - new Date(round.answered_at).getTime()) / 1000
    : 0
  const breakLeft = Math.max(0, Math.ceil(BREAK_SECONDS - breakElapsed))

  async function handleAdvance() {
    if (advancing) return
    setAdvancing(true)

    if (isLastRound) {
      onSessionEnd()
      return
    }

    try {
      const { data, error } = await supabase
        .from('object_rounds')
        .insert({
          room_id: round.room_id,
          session_id: round.session_id,
          round_index: round.round_index + 1,
          total_rounds: round.total_rounds,
          letter: pickRandomLetter(),
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

  // Once someone's won the round, auto-advance after the break.
  useEffect(() => {
    if (!answered || breakLeft > 0) return
    handleAdvance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, breakLeft])

  async function handleSubmit(e) {
    e.preventDefault()
    const normalized = guess.trim().toUpperCase()
    if (!normalized || !guessingOpen || submitting) return
    setError(null)

    if (normalized[0] !== round.letter.toUpperCase()) {
      setError(`Must start with ${round.letter}.`)
      return
    }

    if (!isObjectWord(normalized)) {
      setError(`"${normalized}" isn't a recognized object.`)
      return
    }

    setSubmitting(true)

    try {
      const { data, error } = await supabase.rpc('submit_object_guess', {
        p_round_id: round.id,
        p_player_id: myPlayerId,
        p_guess: normalized,
      })
      if (error) throw error
      const { status } = data[0]
      if (status === 'correct') {
        setGuess('')
        // Same reasoning as handleAdvance below: don't wait on the
        // realtime UPDATE event to show our own win, in case it's slow
        // or never arrives.
        onRoundUpdate({
          ...round,
          winner_player_id: myPlayerId,
          answered_at: new Date().toISOString(),
        })
      } else if (status === 'already_answered') {
        setError('Someone already got it!')
      } else if (status === 'invalid_letter') {
        setError(`Must start with ${round.letter}.`)
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

      {!guessingOpen && !answered && (
        <p className="font-mono text-7xl font-bold text-gray-900 dark:text-gray-100">
          {countdownLeft}
        </p>
      )}

      {(guessingOpen || answered) && (
        <p className="font-mono text-8xl font-extrabold text-indigo-600">{round.letter}</p>
      )}

      {guessingOpen && (
        <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder={`An object starting with ${round.letter}...`}
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

      {answered && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">Round complete!</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {playerName(round.winner_player_id)} got it first.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLastRound ? 'Moving to final results' : 'Moving to next round'} in {breakLeft}s...
          </p>
        </div>
      )}
    </div>
  )
}
