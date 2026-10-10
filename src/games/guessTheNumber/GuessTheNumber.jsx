import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  DIGIT_COUNT,
  SETUP_SECONDS,
  fillBlanks,
  hitCount,
  loadMyNumber,
  revealedFrom,
  saveMyNumber,
} from './config'

const EMPTY_DETAILS = { lockedIn: [], guesses: [] }

function nameOf(players, playerId) {
  return players.find((p) => p.id === playerId)?.name ?? '...'
}

export default function GuessTheNumber({ room, myPlayerId, isHost, players }) {
  const [match, setMatch] = useState(null)
  // Details are tagged with the match they belong to, so a previous match's
  // data never shows up while the new match's details are still loading.
  const [details, setDetails] = useState({ matchId: null, lockedIn: [], guesses: [] })
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const matchId = match?.id
  const { lockedIn, guesses } = details.matchId === matchId ? details : EMPTY_DETAILS

  // Load the latest match and stay subscribed to new ones and updates to it
  // (that's how both players learn the setup finished and whose turn it is).
  useEffect(() => {
    let ignore = false

    async function loadLatestMatch() {
      const { data } = await supabase
        .from('guess_number_matches')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!ignore && data) setMatch(data)
    }

    loadLatestMatch()

    const channel = supabase
      .channel(`guess-number-matches:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guess_number_matches',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => setMatch(payload.new)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'guess_number_matches',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => setMatch(payload.new)
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [room.id])

  // Who has locked in a number, and every guess so far, for the current match.
  useEffect(() => {
    if (!matchId) return
    let ignore = false

    async function loadDetails() {
      const [{ data: secrets }, { data: rows }] = await Promise.all([
        supabase.from('guess_number_secrets').select('player_id').eq('match_id', matchId),
        supabase
          .from('guess_number_guesses')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true }),
      ])
      if (ignore) return
      setDetails({
        matchId,
        lockedIn: (secrets ?? []).map((s) => s.player_id),
        guesses: rows ?? [],
      })
    }

    loadDetails()

    const channel = supabase
      .channel(`guess-number-details:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guess_number_secrets',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) =>
          setDetails((prev) => ({
            ...prev,
            lockedIn: [...prev.lockedIn, payload.new.player_id],
          }))
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guess_number_guesses',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) =>
          setDetails((prev) => ({ ...prev, guesses: [...prev.guesses, payload.new] }))
      )
      .subscribe()

    return () => {
      ignore = true
      supabase.removeChannel(channel)
    }
  }, [matchId])

  async function handleStart(playerAId, playerBId) {
    setStarting(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('guess_number_matches')
        .insert({ room_id: room.id, player_a_id: playerAId, player_b_id: playerBId })
        .select()
        .single()
      if (error) throw error
      setMatch(data)

      if (room.status !== 'started') {
        await supabase.from('rooms').update({ status: 'started' }).eq('id', room.id)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }

  if (!match) {
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
          Two players. Each picks a secret 4-digit number in {SETUP_SECONDS}s,
          then you take turns guessing each other's number.
        </p>
        {players.length !== 2 && (
          <p className="text-sm text-gray-400">
            Needs exactly 2 players ({players.length} in the room).
          </p>
        )}
        <button
          onClick={() => handleStart(players[0].id, players[1].id)}
          disabled={starting || players.length !== 2}
          className="w-full max-w-xs rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? 'Starting...' : 'Start game'}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    )
  }

  const seated = match.player_a_id === myPlayerId || match.player_b_id === myPlayerId
  if (!seated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <p className="text-gray-500 dark:text-gray-400">
          This game is for two players. Waiting for the next one...
        </p>
      </div>
    )
  }

  if (match.status === 'setup') {
    return (
      <SetupView
        key={match.id}
        match={match}
        myPlayerId={myPlayerId}
        opponentName={nameOf(players, opponentIdOf(match, myPlayerId))}
        lockedIn={lockedIn}
      />
    )
  }

  return (
    <PlayView
      key={match.id}
      match={match}
      myPlayerId={myPlayerId}
      players={players}
      guesses={guesses}
      isHost={isHost}
      starting={starting}
      error={error}
      onPlayAgain={() => handleStart(match.player_a_id, match.player_b_id)}
    />
  )
}

function opponentIdOf(match, myPlayerId) {
  return match.player_a_id === myPlayerId ? match.player_b_id : match.player_a_id
}

function SetupView({ match, myPlayerId, opponentName, lockedIn }) {
  const [slots, setSlots] = useState(Array(DIGIT_COUNT).fill(''))
  const [now, setNow] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(interval)
  }, [])

  const deadlineMs = new Date(match.created_at).getTime() + SETUP_SECONDS * 1000
  const timeLeft = Math.max(0, Math.ceil((deadlineMs - now) / 1000))
  const expired = timeLeft === 0
  const submitted = lockedIn.includes(myPlayerId)

  async function submit(digits) {
    setSubmitting(true)
    setError(null)
    // Saved before the RPC, since the match can flip to playing (and the
    // play view read this) before the RPC's response arrives.
    saveMyNumber(match.id, myPlayerId, digits)
    try {
      const { error } = await supabase.rpc('submit_number_secret', {
        p_match_id: match.id,
        p_player_id: myPlayerId,
        p_secret: digits,
      })
      if (error) throw error
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Out of time: lock in whatever's typed, with random digits for the blanks.
  // The RPC ignores a second submit, so a late duplicate is harmless.
  useEffect(() => {
    if (expired && !submitted) submit(fillBlanks(slots))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400">Choose your number</p>
        <p className="font-mono text-2xl font-bold text-indigo-600">{timeLeft}s</p>
      </div>

      {submitted ? (
        <p className="text-gray-500 dark:text-gray-400">
          Number locked in. Waiting for {opponentName} to choose...
        </p>
      ) : (
        <>
          <p className="max-w-xs text-center text-gray-500 dark:text-gray-400">
            Pick four digits. {opponentName} is choosing too.
          </p>
          <DigitInput
            value={slots}
            onChange={setSlots}
            disabled={submitting || expired}
          />
          <button
            onClick={() => submit(slots.join(''))}
            disabled={submitting || slots.some((d) => !d)}
            className="w-full max-w-xs rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Locking in...' : 'I chose my number'}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function PlayView({ match, myPlayerId, players, guesses, isHost, starting, error, onPlayAgain }) {
  const [slots, setSlots] = useState(Array(DIGIT_COUNT).fill(''))
  const [submitting, setSubmitting] = useState(false)
  const [guessError, setGuessError] = useState(null)
  const [myNumber] = useState(() => loadMyNumber(match.id, myPlayerId))
  const [showMine, setShowMine] = useState(true)

  const opponentId = opponentIdOf(match, myPlayerId)
  const opponentName = nameOf(players, opponentId)
  const finished = match.status === 'finished'
  const myTurn = !finished && match.current_turn_player_id === myPlayerId
  const iWon = finished && match.winner_player_id === myPlayerId
  const latest = guesses[guesses.length - 1]

  // Your own number, always in full.
  const myDigits = myNumber ? myNumber.split('') : Array(DIGIT_COUNT).fill(null)
  // The opponent's number, as your guesses have revealed it so far.
  const theirBoard = revealedFrom(guesses, myPlayerId)

  function describe(g) {
    const who = g.guesser_id === myPlayerId ? 'You' : nameOf(players, g.guesser_id)
    const hits = hitCount(g.hits)
    return `${who} guessed ${g.guess}: ${hits} ${hits === 1 ? 'number' : 'numbers'} right`
  }

  async function handleGuess() {
    setSubmitting(true)
    setGuessError(null)
    try {
      const { data, error } = await supabase.rpc('submit_number_guess', {
        p_match_id: match.id,
        p_player_id: myPlayerId,
        p_guess: slots.join(''),
      })
      if (error) throw error
      const { result_status } = data[0]
      if (result_status === 'not_your_turn') setGuessError("It's not your turn.")
      else if (result_status === 'not_playing') setGuessError('This game is over.')
      else setSlots(Array(DIGIT_COUNT).fill(''))
    } catch (err) {
      setGuessError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="text-center">
        {finished ? (
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {iWon ? 'You guessed it. You win!' : `${opponentName} guessed it first.`}
          </p>
        ) : (
          !myTurn && (
            <p className="font-semibold text-gray-900 dark:text-gray-100">
              Waiting for {opponentName} to guess...
            </p>
          )
        )}
        {latest && (
          <p className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">{describe(latest)}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-10">
        <Board
          label="Your number"
          digits={myDigits}
          mine
          hidden={!showMine}
          onToggleHidden={() => setShowMine((show) => !show)}
        />
        <Board label={`${opponentName}'s number`} digits={theirBoard} />
        {!myNumber && (
          <p className="text-xs text-gray-400">
            Your number isn't saved on this device.
          </p>
        )}
      </div>

      <hr className="w-full max-w-xs border-gray-200 dark:border-gray-800" />

      {myTurn && (
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            Your turn: guess {opponentName}'s number
          </p>
          <DigitInput value={slots} onChange={setSlots} disabled={submitting} />
          <button
            onClick={handleGuess}
            disabled={submitting || slots.some((d) => !d)}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guessing...' : 'Guess'}
          </button>
        </div>
      )}

      {finished && isHost && (
        <button
          onClick={onPlayAgain}
          disabled={starting}
          className="w-full max-w-xs rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          Play again
        </button>
      )}

      {(guessError || error) && <p className="text-sm text-red-500">{guessError || error}</p>}

      {guesses.length > 0 && (
        <ol className="w-full max-w-xs space-y-1">
          {[...guesses].reverse().map((g) => (
            <li
              key={g.id}
              className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {describe(g)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Board({ label, digits, mine = false, hidden = false, onToggleHidden }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p
        className={`text-xs uppercase tracking-wide ${
          mine ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-gray-400'
        }`}
      >
        {label}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          {digits.map((d, i) => (
            <span
              key={i}
              className={`flex h-12 w-10 items-center justify-center rounded-lg font-mono text-2xl font-bold text-gray-900 dark:text-gray-100 ${
                mine
                  ? 'border-4 border-indigo-600 dark:border-indigo-400'
                  : 'border border-gray-300 dark:border-gray-700'
              }`}
            >
              {hidden && d ? '•' : (d ?? '')}
            </span>
          ))}
        </div>
        {onToggleHidden && (
          <button
            type="button"
            onClick={onToggleHidden}
            className="flex h-12 w-10 items-center justify-center rounded-lg border border-gray-300 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            {hidden ? 'Show' : 'Hide'}
          </button>
        )}
      </div>
    </div>
  )
}

function DigitInput({ value, onChange, disabled }) {
  const inputs = useRef([])

  function handleChange(i, raw) {
    // maxLength is 2 so typing over a filled box keeps the newest digit.
    const digit = raw.replace(/\D/g, '').slice(-1)
    onChange(value.map((d, j) => (j === i ? digit : d)))
    if (digit && i < DIGIT_COUNT - 1) inputs.current[i + 1]?.focus()
  }

  return (
    <div className="flex gap-2">
      {value.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={d}
          disabled={disabled}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          className="h-14 w-12 rounded-lg border border-gray-300 text-center font-mono text-2xl focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      ))}
    </div>
  )
}
