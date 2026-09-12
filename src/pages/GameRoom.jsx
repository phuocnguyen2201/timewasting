import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import Leaderboard from '../components/Leaderboard'
import { usePlayer } from '../context/PlayerContext'
import GuessTheWord from '../games/guessTheWord/GuessTheWord'
import WhatIsTheObject from '../games/whatIsTheObject/WhatIsTheObject'
import { supabase } from '../lib/supabase'

const GAMES = {
  'guess-the-word': GuessTheWord,
  'what-is-the-object': WhatIsTheObject,
}

export default function GameRoom() {
  const { code } = useParams()
  const { playerName } = usePlayer()
  const location = useLocation()
  const isCreatorRef = useRef(location.state?.isCreator === true)

  const [room, setRoom] = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Load the room and join it as a player (or resume as one already in it).
  useEffect(() => {
    if (!playerName) return
    let ignore = false

    async function joinRoom() {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*, games(slug, name)')
        .eq('code', code)
        .maybeSingle()

      if (ignore) return
      if (roomError || !room) {
        setError(roomError?.message ?? 'Room not found.')
        setLoading(false)
        return
      }
      setRoom(room)

      const { data: existing } = await supabase
        .from('players')
        .select('id')
        .eq('room_id', room.id)
        .eq('name', playerName)
        .maybeSingle()

      if (ignore) return

      if (existing) {
        setMyPlayerId(existing.id)
        setLoading(false)
        return
      }

      const { data: created, error: joinError } = await supabase
        .from('players')
        .insert({ room_id: room.id, name: playerName, score: 0 })
        .select('id')
        .single()

      if (ignore) return
      if (joinError) {
        setError(joinError.message)
        setLoading(false)
        return
      }
      setMyPlayerId(created.id)

      // The room's creator becomes host, so they're the one who gets to
      // configure each game session (difficulty, word count, ...).
      if (isCreatorRef.current && !room.host_id) {
        const { error: hostError } = await supabase
          .from('rooms')
          .update({ host_id: created.id })
          .eq('id', room.id)
        if (!ignore && !hostError) {
          setRoom((prev) => (prev ? { ...prev, host_id: created.id } : prev))
        }
      }

      setLoading(false)
    }

    joinRoom()
    return () => {
      ignore = true
    }
  }, [code, playerName])

  // Subscribe to live player list + score updates for this room.
  useEffect(() => {
    if (!room) return

    async function loadPlayers() {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .order('joined_at', { ascending: true })
      setPlayers(data ?? [])
    }

    loadPlayers()

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${room.id}`,
        },
        () => loadPlayers()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [room])

  if (!playerName) {
    return <Navigate to="/" replace />
  }

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Fire-and-forget: don't block navigation on this cleanup. The RPC
  // handles removing the player and, if the room's now empty, expiring it.
  function handleLeave() {
    if (room && myPlayerId) {
      supabase.rpc('leave_room', { p_room_id: room.id, p_player_id: myPlayerId })
    }
  }

  const GameComponent = room?.games?.slug ? GAMES[room.games.slug] : null
  const isHost = Boolean(myPlayerId) && room?.host_id === myPlayerId

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <div className="relative flex flex-col items-center gap-2 border-b border-gray-200 p-6 dark:border-gray-800">
        <Link
          to="/games"
          onClick={handleLeave}
          title="Leave room"
          aria-label="Leave room"
          className="absolute left-4 top-4 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6"
          >
            <path d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.06l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.69Z" />
            <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
          </svg>
        </Link>
        <p className="text-sm text-gray-500 dark:text-gray-400">Room Code</p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-4xl font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">
            {code}
          </span>
          <button
            onClick={handleCopy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {players.length} {players.length === 1 ? 'player' : 'players'} in room
        </p>
      </div>

      <div className="flex flex-1 flex-col">
        {loading && (
          <p className="p-6 text-center text-gray-400">Joining room...</p>
        )}
        {error && <p className="p-6 text-center text-red-500">{error}</p>}
        {!loading && !error && room && myPlayerId && GameComponent && (
          <GameComponent
            room={room}
            myPlayerId={myPlayerId}
            isHost={isHost}
            players={players}
          />
        )}
        {!loading && !error && room && !GameComponent && (
          <div className="flex-1 p-6 text-center text-gray-500 dark:text-gray-400">
            Gameplay area — TBD per game type.
          </div>
        )}
      </div>

      <Leaderboard players={players} />
    </div>
  )
}
