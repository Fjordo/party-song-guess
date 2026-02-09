import React, { useEffect, useState, useRef } from 'react';
import { t } from '../i18n';

export default function GameRoom({ socket, room, players }) {
    const [currentRound, setCurrentRound] = useState(0);
    const [status, setStatus] = useState('Get Ready...'); // Get Ready, Playing, Round Over
    const [guess, setGuess] = useState('');
    const [roundResult, setRoundResult] = useState(null); // { winner: 'Name', song: {...} }
    const [errorMessage, setErrorMessage] = useState(null);
    const audioRef = useRef(new Audio());
    const inputRef = useRef(null);

    const [countdown, setCountdown] = useState(null);

    useEffect(() => {
        socket.on('start_countdown', ({ duration }) => {
            setStatus(t('game.getReady')); // Or specific status
            setCountdown(duration);//test
            let count = duration;
            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    setCountdown(count);
                } else {
                    clearInterval(timer);
                }
            }, 1000);
        });

        socket.on('new_round', ({ roundNumber, previewUrl }) => {
            setCountdown(null);
            setCurrentRound(roundNumber);
            setStatus('PLAYING');
            setRoundResult(null);
            setErrorMessage(null);
            setGuess('');

            // Focus input and place cursor at end
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            }, 100);

            // Play Audio
            audioRef.current.src = previewUrl;
            audioRef.current.volume = 0.5;
            audioRef.current.play().catch(e => console.error("Autoplay prevent?", e));
        });

        socket.on('round_winner', ({ player, song }) => {
            // Show quick winner message but immediately move to next song (handled server-side)
            setStatus('ROUND_OVER');
            setRoundResult({ winner: player, song });
            audioRef.current.pause();
        });

        socket.on('round_timeout', ({ song }) => {
            setStatus('ROUND_OVER');
            setRoundResult({ winner: null, song }); // No winner
            audioRef.current.pause();//test
        });

        socket.on('wrong_guess', () => {
            setErrorMessage(t('game.wrongGuess'));
        });

        // Clean up listeners
        return () => {
            socket.off('start_countdown');
            socket.off('new_round');
            socket.off('round_winner');
            socket.off('round_timeout');
            socket.off('wrong_guess');
            audioRef.current.pause();
        };
    }, [socket]);

    const submitGuess = (e) => {
        e.preventDefault();
        if (guess.trim()) {
            setErrorMessage(null);
            socket.emit('submit_guess', { roomId: room.id, guess });
            // Optionally clear guess or give feedback "Submitted"
        }
    };

    return (
        <div className="w-full max-w-2xl flex flex-col items-center px-2 sm:px-4">

            <div className="w-full flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between items-center mb-4 sm:mb-6 px-2 sm:px-4 text-center sm:text-left">
                <div className="bg-gray-800 px-4 py-2 rounded-full font-mono">
                    Round {currentRound} / {room?.totalRounds || 10}
                </div>
                <div className="text-lg sm:text-xl font-bold animate-pulse text-purple-400">
                    {status === 'PLAYING' ? t('game.guessTheSong') : status}
                </div>
            </div>

            {/* Visualizer / Album Art placeholder */}
            <div className="w-36 h-36 sm:w-64 sm:h-64 bg-gray-800 rounded-xl mb-6 sm:mb-8 flex items-center justify-center shadow-lg border-4 border-gray-700 relative overflow-hidden">
                {status === 'ROUND_OVER' && roundResult?.song?.artwork ? (
                    <img src={roundResult.song.artwork.replace('100x100', '400x400')} alt="Album Art" className="w-full h-full object-cover" />
                ) : (
                    <div className="text-6xl">❓</div>
                )}
            </div>

            {status === 'ROUND_OVER' && roundResult && (
                <div className="mb-6 text-center animate-bounce px-2">
                    <h3 className="text-lg sm:text-xl text-green-400 font-bold">
                        {roundResult.winner
                            ? `${roundResult.winner} ${t('game.guessed')}`
                            : t('game.timeUp')}
                    </h3>
                    <p className="text-base sm:text-lg break-words">
                        {roundResult.song.title} - <span className="text-gray-400">{roundResult.song.artist}</span>
                    </p>
                </div>
            )}

            <form onSubmit={submitGuess} className="w-full flex flex-col sm:flex-row gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    onFocus={e => {
                        const val = e.target.value;
                        e.target.value = '';
                        e.target.value = val;
                    }}
                    placeholder={t('game.inputPlaceholder')}
                    disabled={status !== 'PLAYING'}
                    className="flex-1 p-3 sm:p-4 rounded-lg bg-gray-800 border-2 border-gray-700 focus:border-purple-500 focus:outline-none text-base sm:text-lg"
                    autoFocus
                />
                <button
                    type="submit"
                    disabled={status !== 'PLAYING'}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-bold transition text-base sm:text-lg"
                >
                    INVIA
                </button>
            </form>

            {errorMessage && (
                <div className="mt-3 w-full text-red-400 text-sm font-semibold text-center">
                    {errorMessage}
                </div>
            )}

            <div className="mt-8 w-full">
                <h4 className="text-gray-400 mb-2 font-bold uppercase text-sm tracking-wider">Scoreboard</h4>
                <div className="flex flex-wrap gap-4">
                    {players.sort((a, b) => b.score - a.score).map(p => (
                        <div key={p.id} className="bg-gray-800 px-3 py-1 rounded flex items-center gap-2 border border-gray-700">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="font-bold">{p.name}</span>
                            <span className="text-purple-400 font-mono">{p.score}</span>
                        </div>
                    ))}
                </div>
            </div>

            {countdown !== null && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
                    <div className="text-9xl font-bold text-white animate-ping">
                        {countdown}
                    </div>
                </div>
            )}

        </div>
    );
}
