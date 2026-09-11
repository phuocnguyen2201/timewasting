import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import GameCard from '../components/GameCard'
import { usePlayer } from '../context/PlayerContext'
import { supabase } from '../lib/supabase'

export default function GameList() {
  const { playerName } = usePlayer()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    let ignore = false

    async function loadGames() {
      setLoading(true)
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('name', { ascending: true })

      if (ignore) return
      if (error) setError(error.message)
      else setGames(data ?? [])
      setLoading(false)
    }

    loadGames()
    return () => {
      ignore = true
    }
  }, [])

  const categories = useMemo(
    () => ['all', ...new Set(games.map((g) => g.category).filter(Boolean))],
    [games]
  )

  const filteredGames = useMemo(
    () =>
      games.filter((game) => {
        const matchesSearch = game.name
          .toLowerCase()
          .includes(search.toLowerCase())
        const matchesCategory =
          category === 'all' || game.category === category
        return matchesSearch && matchesCategory
      }),
    [games, search, category]
  )

  if (!playerName) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8 dark:bg-gray-950">
      <div className="sticky top-0 z-10 space-y-3 border-b border-gray-200 bg-white/90 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search games..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm capitalize transition ${
                category === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading && (
          <p className="py-8 text-center text-gray-400">Loading games...</p>
        )}
        {error && (
          <p className="py-8 text-center text-red-500">
            Couldn't load games: {error}
          </p>
        )}
        {!loading && !error && (
          <div className="grid grid-cols-2 gap-4">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
        {!loading && !error && filteredGames.length === 0 && (
          <p className="py-8 text-center text-gray-400">No games found.</p>
        )}
      </div>
    </div>
  )
}
