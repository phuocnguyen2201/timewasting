import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'

export default function Landing() {
  const { playerName, setPlayerName } = usePlayer()
  const [name, setName] = useState(playerName)
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setPlayerName(name)
    navigate('/games')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 px-6 dark:bg-gray-950">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
          🎲 Game Night
        </h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Play together, anywhere.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          maxLength={20}
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </form>
    </div>
  )
}
