import { Link } from 'react-router-dom'

export default function GameCard({ game }) {
  return (
    <Link
      to={`/games/${game.id}`}
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="aspect-square w-full bg-gray-100 dark:bg-gray-800">
        {game.thumbnail && (
          <img
            src={game.thumbnail}
            alt={game.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate font-semibold text-gray-900 dark:text-gray-100">
          {game.name}
        </h3>
        {game.category && (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {game.category}
          </p>
        )}
      </div>
    </Link>
  )
}
