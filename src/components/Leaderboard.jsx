export default function Leaderboard({ players }) {
  const ranked = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Leaderboard ({players.length})
      </h2>
      <ol className="space-y-1">
        {ranked.map((player, index) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900"
          >
            <span className="flex items-center gap-2">
              <span className="w-5 text-gray-400">{index + 1}</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {player.name}
              </span>
            </span>
            <span className="font-mono text-gray-700 dark:text-gray-300">
              {player.score}
            </span>
          </li>
        ))}
        {ranked.length === 0 && (
          <li className="py-2 text-center text-sm text-gray-400">
            No players yet
          </li>
        )}
      </ol>
    </div>
  )
}
