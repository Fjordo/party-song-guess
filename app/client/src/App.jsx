import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

const socket = io(`http://${window.location.hostname}:3000`);

function App() {
  const [gameState, setGameState] = useState('LANDING'); // LANDING, LOBBY, PLAYING, ENDED
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [totalRounds, setTotalRounds] = useState(10);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    socket.on('room_created', (roomData) => {
      setRoom(roomData);
      setGameState('LOBBY');
      setPlayers(roomData.players);
    });

    socket.on('room_joined', (roomData) => {
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
      setPlayers(finalPlayers); // Final scores
    });

    socket.on('error', (msg) => {
      setErrorMessage(msg || 'Si è verificato un errore.');
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('player_joined');
      socket.off('game_started');
      socket.off('update_scores');
      socket.off('game_over');
      socket.off('error');
    };
  }, []);

  const createRoom = () => {
    if (!playerName) {
      setErrorMessage('Inserisci il tuo nome per creare una stanza.');
      return;
    }
    setErrorMessage('');
    socket.emit('create_room', { playerName, totalRounds });
  };

  const joinRoom = (roomId) => {
    if (!playerName) {
      setErrorMessage('Inserisci il tuo nome per unirti a una stanza.');
      return;
    }
    if (!roomId) {
      setErrorMessage('Inserisci un ID stanza valido.');
      return;
    }
    setErrorMessage('');
    socket.emit('join_room', { roomId, playerName });
  };

  const startGame = (genre) => {
    if (room) {
      socket.emit('start_game', { roomId: room.id, genre: genre || 'pop' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-start sm:justify-center p-4">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 sm:mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
        Party Song Guess
      </h1>

      {errorMessage && (
        <div className="w-full max-w-md mb-4">
          <div className="flex items-start gap-3 bg-red-900/80 border border-red-500 text-red-100 px-4 py-3 rounded-lg shadow-lg">
            <div className="mt-0.5 text-lg">⚠️</div>
            <div className="flex-1 text-sm">
              <p className="font-semibold mb-1">Errore</p>
              <p>{errorMessage}</p>
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

      {gameState === 'LANDING' && (
        <div className="bg-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl space-y-4 w-full max-w-md">
          <input
            type="text"
            placeholder="Il tuo nome"
            className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />
          <div className="text-left">
            <label className="block text-sm text-gray-400 mb-1">
              Numero di round
            </label>
            <select
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500"
              value={totalRounds}
              onChange={e => setTotalRounds(parseInt(e.target.value, 10))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </div>
          <div className="flex gap-4">
            <button
              onClick={createRoom}
              className="flex-1 bg-purple-600 hover:bg-purple-700 p-3 rounded font-bold transition"
            >
              Crea Stanza
            </button>
            {/* Separate Input for Join Room ID could be cleaner, but simple prompt here */}
          </div>

          <div className="border-t border-gray-700 pt-4">
            <p className="mb-2 text-sm text-gray-400">Oppure unisciti:</p>
            <FormJoin joinRoom={joinRoom} />
          </div>
        </div>
      )}

      {gameState === 'LOBBY' && (
        <Lobby
          room={room}
          players={players}
          startGame={startGame}
          isOwner={room.players[0].id === socket.id} // Basic check
        />
      )}

      {gameState === 'PLAYING' && (
        <GameRoom socket={socket} room={room} players={players} />
      )}

      {gameState === 'ENDED' && (
        <div className="bg-gray-800 p-8 rounded-xl text-center">
          <h2 className="text-3xl font-bold mb-4">Game Over!</h2>
          <div className="space-y-2">
            {players.sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.id} className="text-xl">
                {i + 1}. {p.name} - {p.score} pts
              </div>
            ))}
          </div>
          <button onClick={() => window.location.reload()} className="mt-6 bg-blue-600 px-6 py-2 rounded">New Game</button>
        </div>
      )}

    </div>
  );
}

function FormJoin({ joinRoom }) {
  const [id, setId] = useState('');
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        placeholder="ID Stanza"
        className="flex-1 p-2 rounded bg-gray-700 w-full"
        value={id}
        onChange={e => setId(e.target.value)}
      />
      <button
        onClick={() => joinRoom(id)}
        className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded w-full sm:w-auto"
      >
        Unisciti
      </button>
    </div>
  )
}

export default App;
