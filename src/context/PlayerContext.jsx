import { createContext, useContext, useEffect, useState } from 'react'

const PlayerContext = createContext(null)

const STORAGE_KEY = 'game-night:player-name'

export function PlayerProvider({ children }) {
  const [playerName, setPlayerNameState] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) || ''
  )

  useEffect(() => {
    if (playerName) {
      sessionStorage.setItem(STORAGE_KEY, playerName)
    }
  }, [playerName])

  function setPlayerName(name) {
    setPlayerNameState(name.trim())
  }

  return (
    <PlayerContext.Provider value={{ playerName, setPlayerName }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider')
  return ctx
}
