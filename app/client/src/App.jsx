import React, { useState, useEffect } from 'react';
import { t } from './i18n';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

const socket = io(`http://${window.location.hostname}:3000`);

// Stile per la scrollbar personalizzata (inserito direttamente qui per comodità)
const scrollbarStyle = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #4b5563;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }
`;

function App() {
  const [gameState, setGameState] = useState('LANDING'); // LANDING, LOBBY, PLAYING, ENDED
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [totalRounds, setTotalRounds] = useState(10);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedGenres, setSelectedGenres] = useState(['pop']);
  const [selectedDecade, setSelectedDecade] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');

  useEffect(() => {
    socket.on('room_created', (roomData) => {
      setErrorMessage(t(''));
      setRoom(roomData);
      setGameState('LOBBY');
      setPlayers(roomData.players);
    });

    socket.on('room_joined', (roomData) => {
      setErrorMessage(t(''));
      setRoom(roomData);
      setGameState('LOBBY');
      setPlayers(roomData.players);
    });

    socket.on('player_joined', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    socket.on('game_started', () => {
      setGameState('PLAYING');
    });

    socket.on('update_scores', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    socket.on('game_over', (finalPlayers) => {
      setGameState('ENDED');
      setPlayers(finalPlayers);
    });

    socket.on('connect_error', () => {
      setErrorMessage(t('errors.serverUnavailable'));
    });

    socket.on('disconnect', () => {
      setGameState('LANDING');
      setRoom(null);
      setPlayers([]);
      setErrorMessage(t('errors.disconnected'));
    });

    socket.on('error', (payload) => {
      const code = typeof payload === 'string' ? payload : payload?.code;
      if (code === 'ROOM_NOT_FOUND_OR_STARTED') {
        setErrorMessage(t('errors.roomNotFound'));
      } else if (code === 'AI_TIMEOUT') {
        setErrorMessage(t('errors.aiTimeout'));
      } else if (code === 'GENERATION_FAILED') {
        setErrorMessage(t('errors.generationFailed'));
      } else {
        setErrorMessage(t('errors.generic'));
      }
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('player_joined');
      socket.off('game_started');
      socket.off('update_scores');
      socket.off('game_over');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('error');
    };
  }, []);

  const createRoom = () => {
    if (!playerName) {
      setErrorMessage(t('errors.missingNameCreate'));
      return;
    }
    setErrorMessage('');
    socket.emit('create_room', { playerName });
  };

  const joinRoom = (roomId) => {
    if (!playerName) {
      setErrorMessage(t('errors.missingNameJoin'));
      return;
    }
    if (!roomId) {
      setErrorMessage(t('errors.missingRoomId'));
      return;
    }
    setErrorMessage('');
    socket.emit('join_room', { roomId, playerName });
  };

  const startGame = () => {
    if (room) {
      setErrorMessage('');
      socket.emit('start_game', {
        roomId: room.id,
        genres: selectedGenres,
        decade: selectedDecade || null,
        rounds: totalRounds,
        language: selectedLanguage || null,
        difficulty: selectedDifficulty || 'easy'
      });
    }
  };

  const toggleGenre = (genreKey) => {
    setSelectedGenres((prev) =>
      prev.includes(genreKey)
        ? prev.filter((g) => g !== genreKey)
        : [...prev, genreKey]
    );
  };

  // ... (tutti gli import e la logica rimangono uguali)

  // AGGIUNGIAMO min-h-0 alla lista e max-h-[xx] al contenitore
  return (
    // 1. BLOCCO PRINCIPALE: h-screen fissa l'app alla finestra, overflow-hidden evita scroll doppi
    <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden">
      <style>{scrollbarStyle}</style>

      {/* 2. AREA DI SCROLL GENERALE: Se il contenuto sfora (es. tastiera mobile), qui si scrolla */}
      <div className="flex-1 overflow-y-auto p-4 w-full custom-scrollbar">
        <div className="flex flex-col items-center justify-start min-h-full py-4">

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 flex-shrink-0">
            {t('appTitle')}
          </h1>

          {errorMessage && (
            <div className="w-full max-w-md mb-4 flex-shrink-0">
              <div className="flex items-start gap-3 bg-red-900/80 border border-red-500 text-red-100 px-4 py-3 rounded-lg shadow-lg">
                <div className="mt-0.5 text-lg">⚠️</div>
                <div className="flex-1 text-sm max-h-32 overflow-y-auto custom-scrollbar">
                  <p className="font-semibold mb-1">{t('errors.title')}</p>
                  <p className="break-words">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="ml-2 text-red-200 hover:text-white text-sm font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* WRAPPER CENTRALE */}
          <div className="w-full flex flex-col items-center justify-center flex-1">

            {gameState === 'LANDING' && (
              <div className="bg-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl space-y-4 w-full max-w-md">
                <input
                  type="text"
                  placeholder={t('landing.namePlaceholder')}
                  className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                />
                <div className="flex gap-4">
                  <button
                    onClick={createRoom}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 p-3 rounded font-bold transition"
                  >
                    {t('landing.createRoom')}
                  </button>
                </div>

                <div className="border-t border-gray-700 pt-4">
                  <p className="mb-2 text-sm text-gray-400">{t('landing.joinLabel')}</p>
                  <FormJoin joinRoom={joinRoom} />
                </div>
              </div>
            )}

            {gameState === 'LOBBY' && (
              <Lobby
                room={room}
                players={players}
                startGame={startGame}
                isOwner={room.players[0].id === socket.id}
                totalRounds={totalRounds}
                setTotalRounds={setTotalRounds}
                selectedGenres={selectedGenres}
                toggleGenre={toggleGenre}
                selectedDecade={selectedDecade}
                setSelectedDecade={setSelectedDecade}
                selectedLanguage={selectedLanguage}
                setSelectedLanguage={setSelectedLanguage}
                selectedDifficulty={selectedDifficulty}
                setSelectedDifficulty={setSelectedDifficulty}
                errorMessage={errorMessage}
              />
            )}

            {gameState === 'PLAYING' && (
              <GameRoom socket={socket} room={room} players={players} />
            )}

            {gameState === 'ENDED' && (
              /* 3. GAME OVER FIX: Altezza massima fissa (80% viewport) e flex column */
              <div className="bg-gray-800 p-6 rounded-xl text-center w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
                <h2 className="text-3xl font-bold mb-4 text-purple-400 flex-shrink-0">{t('game.gameOver')}</h2>

                {/* TRUCCO: 'flex-1' prende lo spazio disponibile
                    'min-h-0' permette al flex item di rimpicciolirsi sotto il suo contenuto minimo (fondamentale per lo scroll)
                    'overflow-y-auto' abilita la barra
                */}
                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-2 space-y-2 mb-4">
                  {players.sort((a, b) => b.score - a.score).map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded ${i === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-gray-700'
                        }`}
                    >
                      <span className="font-bold flex items-center gap-2 truncate">
                        {i === 0 && '👑'} {i + 1}. {p.name}
                      </span>
                      <span className="font-mono bg-gray-900 px-2 py-1 rounded text-purple-300 ml-2 whitespace-nowrap">
                        {p.score} pts
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition transform hover:scale-105 flex-shrink-0"
                >
                  {t('game.newGame')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ... Resto del codice (FormJoin, export)


function FormJoin({ joinRoom }) {
  const [id, setId] = useState('');
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        placeholder={t('landing.joinPlaceholder')}
        className="flex-1 p-2 rounded bg-gray-700 w-full"
        value={id}
        onChange={e => setId(e.target.value)}
      />
      <button
        onClick={() => joinRoom(id)}
        className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded w-full sm:w-auto"
      >
        {t('landing.joinButton')}
      </button>
    </div>
  )
}

export default App;