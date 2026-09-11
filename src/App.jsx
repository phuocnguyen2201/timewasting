import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PlayerProvider } from './context/PlayerContext'
import GameDetail from './pages/GameDetail'
import GameList from './pages/GameList'
import GameRoom from './pages/GameRoom'
import Landing from './pages/Landing'

export default function App() {
  return (
    <PlayerProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/games" element={<GameList />} />
          <Route path="/games/:gameId" element={<GameDetail />} />
          <Route path="/room/:code" element={<GameRoom />} />
        </Routes>
      </BrowserRouter>
    </PlayerProvider>
  )
}
