import React, { useEffect, useState, useRef } from 'react';
import { t } from '../i18n';

function savedVolume() {
    try {
        const saved = localStorage.getItem('party-song-volume');
        const value = saved === null ? 0.5 : Number(saved);
        return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
    } catch { return 0.5; }
}

export default function GameRoom({ socket, room, players, round }) {
    const [guess, setGuess] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);
    const [volume, setVolume] = useState(savedVolume);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [clock, setClock] = useState(Date.now);
    const audioRef = useRef(null);
    const inputRef = useRef(null);
    const phase = round?.phase || 'WAITING';
    const deadline = round?.deadline || 0;
    const previewUrl = round?.previewUrl;
    const durationMs = round?.durationMs || 30000;
    const secondsLeft = Math.min(phase === 'COUNTDOWN' ? 3 : durationMs / 1000,
        Math.max(0, Math.ceil((deadline - clock) / 1000)));
    const canGuess = phase === 'PLAYING' && secondsLeft > 0;
    const result = round?.result;

    useEffect(() => {
        // Recompute from the deadline so background tabs do not accumulate drift.
        const timer = setInterval(() => setClock(Date.now()), 100);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const wrongGuess = () => setErrorMessage(t('game.wrongGuess'));
        socket.on('wrong_guess', wrongGuess);
        return () => socket.off('wrong_guess', wrongGuess);
    }, [socket]);

    useEffect(() => {
        const audio = audioRef.current;
        audio.volume = volume;
        try { localStorage.setItem('party-song-volume', String(volume)); } catch { /* Optional preference. */ }
    }, [volume]);

    useEffect(() => {
        const audio = audioRef.current;
        let active = true;
        audio.pause();
        if (phase !== 'PLAYING' || !previewUrl) return undefined;
        // Seek after metadata arrives, including time spent fetching the preview.
        const startAudio = () => {
            if (!active || Date.now() >= deadline) return;
            audio.currentTime = Math.max(0, (durationMs - (deadline - Date.now())) / 1000);
            audio.play().catch(() => { if (active) setAudioBlocked(true); });
        };
        audio.addEventListener('loadedmetadata', startAudio);
        audio.src = previewUrl;
        audio.load();
        // On touch devices, let the player open the keyboard when ready.
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            inputRef.current?.focus({ preventScroll: true });
        }
        return () => {
            active = false;
            audio.removeEventListener('loadedmetadata', startAudio);
            audio.pause();
        };
    }, [phase, previewUrl, deadline, durationMs]);

    const resumeAudio = () => {
        if (!canGuess) return;
        const audio = audioRef.current;
        audio.currentTime = Math.max(0, (durationMs - (deadline - Date.now())) / 1000);
        audio.play().catch(() => setAudioBlocked(true));
    };

    const submitGuess = e => {
        e.preventDefault();
        if (!canGuess || !socket.connected || !guess.trim()) return;
        setErrorMessage(null);
        socket.emit('submit_guess', { roomId: room.id, guess });
    };

    return (
        <div className="w-full min-w-0 max-w-2xl flex flex-col items-center sm:px-4">
            <audio ref={audioRef} onPlay={() => setAudioBlocked(false)} onError={() => setAudioBlocked(true)} />
            <div className="w-full flex flex-wrap gap-2 justify-between items-center mb-3 sm:mb-4">
                <div className="bg-gray-800 px-4 py-2 rounded-full font-mono">
                    {t('game.round')} {round?.roundNumber || 0} / {room.totalRounds}
                </div>
                <div className="font-bold text-sm sm:text-base text-purple-400 text-center">
                    {t(phase === 'PLAYING' ? 'game.guessTheSong' : 'game.getReady')}
                </div>
            </div>

            {phase === 'PLAYING' && (
                <div className="w-full mb-4">
                    <p role="timer" aria-label={t('game.timeRemaining')} className={`text-right font-mono mb-1 ${secondsLeft <= 5 ? 'text-red-300' : 'text-purple-200'}`}>
                        {t('game.timeRemaining')}: {secondsLeft}s
                    </p>
                    <progress aria-label={t('game.timeRemaining')} value={secondsLeft} max={durationMs / 1000} className="w-full h-2 accent-purple-400" />
                </div>
            )}

            <div className="w-28 h-28 sm:w-56 sm:h-56 shrink-0 bg-gray-800 rounded-xl mb-3 sm:mb-5 flex items-center justify-center shadow-lg border-4 border-gray-700 overflow-hidden">
                {phase === 'ROUND_OVER' && result?.song?.artwork ? (
                    <img src={result.song.artwork.replace('100x100', '400x400')} alt={t('game.albumArt')} className="w-full h-full object-cover" />
                ) : <div className="text-6xl">❓</div>}
            </div>

            <div className="w-full flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-5">
                <label htmlFor="game-volume" className="text-sm text-gray-300">{t('game.volume')}</label>
                <input id="game-volume" type="range" min="0" max="1" step="0.01" value={volume}
                    onChange={e => setVolume(Number(e.target.value))} className="min-w-0 flex-1 sm:flex-none sm:w-44 h-12 accent-purple-400"
                    aria-valuetext={`${Math.round(volume * 100)}%`} />
                <output htmlFor="game-volume" className="font-mono text-sm w-12">{Math.round(volume * 100)}%</output>
                {audioBlocked && canGuess && (
                    <button type="button" onClick={resumeAudio} className="w-full sm:w-auto min-h-12 px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 touch-manipulation">
                        {t('game.resumeAudio')}
                    </button>
                )}
            </div>

            {phase === 'ROUND_OVER' && result && (
                <div className="mb-5 text-center px-2" role="status">
                    <h3 className="text-lg text-green-400 font-bold">
                        {result.winner ? `${result.winner} ${t('game.guessed')}` : t(result.skipped ? 'game.songSkipped' : 'game.timeUp')}
                    </h3>
                    <p className="break-words">{result.song.title} - <span className="text-gray-400">{result.song.artist}</span></p>
                </div>
            )}

            <form onSubmit={submitGuess} className="w-full flex gap-2">
                <input ref={inputRef} type="text" value={guess} onChange={e => setGuess(e.target.value)}
                    placeholder={t('game.inputPlaceholder')} aria-label={t('game.inputPlaceholder')}
                    enterKeyHint="send" autoComplete="off" disabled={!canGuess}
                    className="min-w-0 min-h-12 flex-1 p-3 rounded-lg bg-gray-800 border-2 border-gray-700 focus:border-purple-500 focus:outline-none text-base" />
                <button type="submit" disabled={!canGuess}
                    className="shrink-0 min-h-12 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-3 sm:px-6 py-3 rounded-lg font-bold touch-manipulation">
                    {t('game.submit')}
                </button>
            </form>
            {players.length === 1 && (
                <button type="button" disabled={!canGuess} onClick={() => {
                    if (socket.connected) socket.emit('skip_song', { roomId: room.id, roundNumber: round.roundNumber });
                }} className="mt-3 w-full sm:w-auto min-h-12 px-6 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed font-semibold touch-manipulation">
                    {t('game.skipSong')}
                </button>
            )}
            {errorMessage && canGuess && <p role="status" className="mt-3 text-red-400 text-sm">{errorMessage}</p>}

            <div className="mt-6 w-full">
                <h4 className="text-gray-400 mb-2 font-bold uppercase text-sm tracking-wider">{t('game.scoreboard')}</h4>
                <div className="flex flex-wrap gap-3">
                    {[...players].sort((a, b) => b.score - a.score).map(p => (
                        <div key={p.id} className="w-full sm:w-auto min-w-0 max-w-full bg-gray-800 px-3 py-2 rounded flex flex-wrap items-center gap-2 border border-gray-700">
                            <span className={`w-2 h-2 shrink-0 rounded-full ${p.connected ? 'bg-green-400' : 'bg-yellow-400'}`} />
                            <span className="min-w-0 flex-1 font-bold break-all">{p.name}</span>
                            {!p.connected && <span className="text-xs text-yellow-300">{t('game.reconnectingPlayer')}</span>}
                            <span className="text-purple-400 font-mono">{p.score}</span>
                        </div>
                    ))}
                </div>
            </div>
            {phase === 'COUNTDOWN' && secondsLeft > 0 && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
                    <div className="text-9xl font-bold text-white motion-safe:animate-pulse">{secondsLeft}</div>
                </div>
            )}
        </div>
    );
}
