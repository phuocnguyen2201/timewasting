import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { generateRoomCode } from '../lib/roomCode'
import { supabase } from '../lib/supabase'

export default function GameDetail() {
  const { gameId } = useParams()
  const { playerName } = usePlayer()
  const navigate = useNavigate()

  const [mode, setMode] = useState(null) // null | 'create' | 'join'
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!playerName) {
    return <Navigate to="/" replace />
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      let code = generateRoomCode()
      let attempts = 0

      // Retry on the rare unique-code collision.
      while (attempts < 5) {
        const { data: room, error: insertError } = await supabase
          .from('rooms')
          .insert({ code, game_id: gameId, status: 'waiting' })
          .select()
          .single()

        if (!insertError) {
          navigate(`/room/${room.code}`, { state: { isCreator: true } })
          return
        }
        if (insertError.code !== '23505') throw insertError
        code = generateRoomCode()
        attempts += 1
      }
      throw new Error('Could not generate a unique room code, try again.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const code = joinCode.trim().toUpperCase()
      const { data: room, error: lookupError } = await supabase
        .from('rooms')
        .select('code')
        .eq('code', code)
        .eq('status', 'waiting')
        .maybeSingle()

      if (lookupError) throw lookupError
      if (!room) throw new Error('Room not found or already started.')

      navigate(`/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex items-center gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
        <Link
          to="/games"
          className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
        >
          ← Back
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        {!mode && (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={handleCreate}
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Creating...' : 'Create Game'}
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Join Game
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="w-full max-w-xs space-y-4">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={4}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={busy || joinCode.length !== 4}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Joining...' : 'Join'}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}
