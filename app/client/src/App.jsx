import React, { useState, useEffect } from 'react';
import { t } from './i18n';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import HelpButton from './components/HelpButton';
import PwaInstallButton from './components/PwaInstallButton';

let savedSession = null;
try { savedSession = JSON.parse(sessionStorage.getItem('party-song-session')); } catch { /* Storage may be unavailable. */ }
function saveSession(session) {
  savedSession = session;
  try {
    if (session) sessionStorage.setItem('party-song-session', JSON.stringify(session));
    else sessionStorage.removeItem('party-song-session');
  } catch { /* In-memory recovery still works when storage is blocked. */ }
}
const receiveRound = round => ({ ...round, deadline: Date.now() + (round?.remainingMs || 0) });

// Socket configuration: VITE_SERVER_URL takes precedence (production/fly.io)
// Falls back to individual VITE_SOCKET_* vars for local development
const SOCKET_HOST =
  import.meta.env.VITE_SOCKET_HOST || "localhost";
const SOCKET_PORT = import.meta.env.VITE_SOCKET_PORT || '3000';
const SOCKET_PROTOCOL =
  import.meta.env.VITE_SOCKET_PROTOCOL ||
  (window.location.protocol === 'https:' ? 'https' : 'http');

const socket = io(
  import.meta.env.VITE_SERVER_URL || `${SOCKET_PROTOCOL}://${SOCKET_HOST}:${SOCKET_PORT}`,
  { autoConnect: false }
);

// Stile per la scrollbar personalizzata (inserito direttamente qui per comodità)
function App() {
  const [gameState, setGameState] = useState(savedSession ? 'RECONNECTING' : 'LANDING'); // LANDING, LOBBY, PLAYING, ENDED
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState(savedSession?.playerName || '');
  const [round, setRound] = useState(null);
  const [totalRounds, setTotalRounds] = useState(10);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedGenres, setSelectedGenres] = useState(['pop']);
  const [selectedDecade, setSelectedDecade] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  // The server scales to zero, so the first connection of the day has to wake
  // the machine. That takes a couple of seconds and is normal, not an error.
  const [connectionState, setConnectionState] = useState('connecting');

  useEffect(() => {
    const applySettings = settings => {
      if (!settings) return;
      setSelectedGenres(settings.genres);
      setSelectedDecade(settings.decade || '');
      setSelectedLanguage(settings.language || '');
      setSelectedDifficulty(settings.difficulty);
      setTotalRounds(settings.rounds);
    };
    const applyRoom = roomData => {
      setErrorMessage('');
      setRoom(roomData);
      setPlayers(roomData.players);
      setGameState(roomData.state);
      setRound(receiveRound(roomData.round));
      applySettings(roomData.settings);
    };
    socket.on('session_created', session => {
      saveSession(session);
      setPlayerName(session.playerName);
    });
    socket.on('room_created', applyRoom);
    socket.on('room_joined', applyRoom);
    socket.on('room_resumed', applyRoom);
    socket.on('game_started', applyRoom);
    socket.on('round_state', data => setRound(receiveRound(data)));
    socket.on('game_loading', ({ settings }) => {
      setGameState('LOADING');
      setErrorMessage('');
      applySettings(settings);
    });
    socket.on('player_joined', setPlayers);
    socket.on('game_left', () => {
      saveSession(null);
      setGameState('LANDING');
      setRoom(null);
      setPlayers([]);
      setRound(null);
      setErrorMessage('');
    });
    socket.on('resume_failed', () => {
      saveSession(null);
      setGameState('LANDING');
      setRoom(null);
      setPlayers([]);
      setErrorMessage(t('errors.sessionExpired'));
    });
    const closeSession = message => {
      saveSession(null);
      setGameState('LANDING');
      setRoom(null);
      setPlayers([]);
      setErrorMessage(t(message));
    };
    socket.on('session_replaced', () => closeSession('errors.sessionReplaced'));
    socket.on('room_expired', () => closeSession('errors.sessionExpired'));

    socket.on('update_scores', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    socket.on('game_over', (finalPlayers) => {
      setGameState('ENDED');
      setPlayers(finalPlayers);
    });

    socket.on('connect', () => {
      setConnectionState('online');
      if (savedSession) {
        setGameState('RECONNECTING');
        socket.emit('resume_room', savedSession);
      }
      setErrorMessage((current) =>
        current === t('errors.serverUnavailable') ? '' : current
      );
    });

    // Waking the server is the normal first-visit path, so a failed attempt is
    // only worth reporting once socket.io has retried for a while. It reconnects
    // on its own, so the connection establishes as soon as the machine is up.
    const WAKE_GRACE_MS = 15000;
    const firstAttemptAt = Date.now();
    socket.on('connect_error', () => {
      if (Date.now() - firstAttemptAt < WAKE_GRACE_MS) {
        setConnectionState('connecting');
        return;
      }
      setConnectionState('offline');
      setErrorMessage(t('errors.serverUnavailable'));
    });

    socket.on('disconnect', () => {
      setConnectionState('connecting');
      setGameState(savedSession ? 'RECONNECTING' : 'LANDING');
      setErrorMessage('');
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

    const resync = () => {
      if (document.visibilityState === 'visible' && socket.connected && savedSession) {
        socket.emit('get_room_state', { roomId: savedSession.roomId });
      }
    };
    document.addEventListener('visibilitychange', resync);
    socket.connect();
    return () => {
      document.removeEventListener('visibilitychange', resync);
      socket.off('session_created');
      socket.off('room_resumed');
      socket.off('resume_failed');
      socket.off('session_replaced');
      socket.off('room_expired');
      socket.off('round_state');
      socket.off('game_loading');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('player_joined');
      socket.off('game_left');
      socket.off('game_started');
      socket.off('update_scores');
      socket.off('game_over');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('error');
    };
  }, []);

  const createRoom = () => {
    if (!socket.connected) return;
    if (!playerName) {
      setErrorMessage(t('errors.missingNameCreate'));
      return;
    }
    setErrorMessage('');
    socket.emit('create_room', { playerName });
  };

  const joinRoom = (roomId) => {
    if (!socket.connected) return;
    if (!playerName) {
      setErrorMessage(t('errors.missingNameJoin'));
      return;
    }
    if (!roomId || !/^[A-Fa-f0-9]{6}$/.test(roomId)) {
      setErrorMessage(t('errors.missingRoomId'));
      return;
    }
    setErrorMessage('');
    socket.emit('join_room', { roomId: roomId.toUpperCase(), playerName });
  };

  const startGame = () => {
    if (room && socket.connected) {
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand" aria-label={t('appTitle')}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M8 17V6l11-2v11" />
              <path d="M8 10l11-2" />
              <circle cx="5" cy="17" r="3" />
              <circle cx="16" cy="15" r="3" />
            </svg>
          </span>
          <span className="brand-name">{t('appTitle')}</span>
        </div>
        <div className="header-actions">
          <PwaInstallButton />
          <HelpButton socket={socket} />
        </div>
      </header>

      <div className="app-main custom-scrollbar">
        <div className="app-content">

          {connectionState === 'connecting' && (
            <div className="status-banner" role="status">
              <span className="status-spinner" aria-hidden="true" />
              <p>{t(savedSession ? 'connection.reconnecting' : 'connection.waking')}</p>
            </div>
          )}

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

          <div className="content-stage">

            {gameState === 'LANDING' && (
              <div className="surface-card landing-card">
                <div className="landing-heading">
                  <p className="eyebrow">PLAY · GUESS · WIN</p>
                  <h1>{t('appTitle')}</h1>
                  <div className="sound-wave" aria-hidden="true">
                    {[22, 44, 30, 62, 38, 72, 46, 28, 54, 34].map((height, index) => (
                      <span key={index} style={{ height }} />
                    ))}
                  </div>
                </div>
                <label className="field-label" htmlFor="player-name">{t('landing.namePlaceholder')}</label>
                <input
                  id="player-name"
                  type="text"
                  placeholder={t('landing.namePlaceholder')}
                  className="text-input"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  autoComplete="nickname"
                />
                <button onClick={createRoom} className="primary-button">
                  {t('landing.createRoom')} <span aria-hidden="true">→</span>
                </button>

                <div className="section-divider"><span>{t('landing.joinLabel')}</span></div>
                <div>
                  <FormJoin joinRoom={joinRoom} />
                </div>
              </div>
            )}

            {gameState === 'RECONNECTING' && (
              <div role="status" className="surface-card state-card"><span className="status-spinner" />{t('connection.reconnecting')}</div>
            )}
            {gameState === 'LOADING' && (
              <div role="status" className="surface-card state-card"><span className="status-spinner" />{t('lobby.generating')}</div>
            )}
            {gameState === 'LOBBY' && (
              <Lobby
                room={room}
                players={players}
                startGame={startGame}
                isOwner={players.find(player => player.connected)?.id === socket.id}
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
              <GameRoom key={`${room.gameId}:${round?.roundNumber}`} socket={socket} room={room} players={players} round={round} />
            )}

            {(room || savedSession) && gameState !== 'LANDING' && (
              <button
                type="button"
                onClick={() => {
                  if (socket.connected && gameState !== 'RECONNECTING') {
                    socket.emit('leave_game', { roomId: room.id });
                  } else if (!socket.connected) {
                    saveSession(null);
                    setRoom(null);
                    setPlayers([]);
                    setGameState('LANDING');
                  }
                }}
                className="leave-button"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m10 17 5-5-5-5" />
                  <path d="M15 12H3" />
                  <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
                </svg>
                <span>{t('game.leaveGame')}</span>
              </button>
            )}

            {gameState === 'ENDED' && (
              <div className="surface-card end-card">
                <p className="eyebrow">FINAL SCORE</p>
                <h2>{t('game.gameOver')}</h2>

                {/* TRUCCO: 'flex-1' prende lo spazio disponibile
                    'min-h-0' permette al flex item di rimpicciolirsi sotto il suo contenuto minimo (fondamentale per lo scroll)
                    'overflow-y-auto' abilita la barra
                */}
                <div className="ranking-list custom-scrollbar">
                  {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                    <div
                      key={p.id}
                      className={`ranking-item ${i === 0 ? 'is-winner' : ''}`}
                    >
                      <span className="font-bold flex items-center gap-2 truncate">
                        {i === 0 && '👑'} {i + 1}. {p.name}
                      </span>
                      <span className="ranking-score">
                        {p.score} pts
                      </span>
                    </div>
                  ))}
                </div>

                {players.find(player => player.connected)?.id === socket.id ? <button
                  onClick={() => { if (socket.connected) socket.emit('rematch', { roomId: room.id }); }}
                  className="primary-button"
                >
                  {t('game.rematch')}
                </button> : <p className="text-gray-400">{t('game.waitingRematch')}</p>}
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
    <div className="join-row">
      <input
        type="text"
        placeholder={t('landing.joinPlaceholder')}
        className="text-input room-input"
        value={id}
        onChange={e => setId(e.target.value.toUpperCase())}
        maxLength={6}
        autoComplete="off"
        aria-label={t('landing.joinPlaceholder')}
      />
      <button
        onClick={() => joinRoom(id)}
        className="secondary-button"
      >
        {t('landing.joinButton')}
      </button>
    </div>
  )
}

export default App;
