import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function savedVolume() {
    try {
        const saved = localStorage.getItem('party-song-volume');
        const value = saved === null ? 0.5 : Number(saved);
        return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
    } catch { return 0.5; }
}

function VolumeIcon({ muted }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 9v6h4l5 4V5L9 9H5Z" />
            {muted ? <path d="m18 9 4 4m0-4-4 4" /> : <path d="M18 8a6 6 0 0 1 0 8" />}
        </svg>
    );
}

function SkipIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 6 8 6-8 6V6Zm9 0 8 6-8 6V6Z" />
        </svg>
    );
}

export default function GameRoom({ socket, room, players, round }) {
    const { t } = useTranslation();
    const [guess, setGuess] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);
    const [volume, setVolume] = useState(savedVolume);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [clock, setClock] = useState(Date.now);
    const audioRef = useRef(null);
    const inputRef = useRef(null);
    const previousVolumeRef = useRef(volume || 0.5);
    const phase = round?.phase || 'WAITING';
    const deadline = round?.deadline || 0;
    const previewUrl = round?.previewUrl;
    const durationMs = round?.durationMs || 30000;
    const secondsLeft = Math.min(
        phase === 'COUNTDOWN' ? 3 : durationMs / 1000,
        Math.max(0, Math.ceil((deadline - clock) / 1000))
    );
    const canGuess = phase === 'PLAYING' && secondsLeft > 0;
    const result = round?.result;
    const timerProgress = Math.max(0, Math.min(1, secondsLeft / (durationMs / 1000)));

    useEffect(() => {
        const timer = setInterval(() => setClock(Date.now()), 100);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const wrongGuess = () => setErrorMessage(t('game.wrongGuess'));
        socket.on('wrong_guess', wrongGuess);
        return () => socket.off('wrong_guess', wrongGuess);
    }, [socket, t]);

    useEffect(() => {
        const audio = audioRef.current;
        audio.volume = volume;
        if (volume > 0) previousVolumeRef.current = volume;
        try { localStorage.setItem('party-song-volume', String(volume)); } catch { /* Optional preference. */ }
    }, [volume]);

    useEffect(() => {
        const audio = audioRef.current;
        let active = true;
        audio.pause();
        if (phase !== 'PLAYING' || !previewUrl) return undefined;

        const startAudio = () => {
            if (!active || Date.now() >= deadline) return;
            audio.currentTime = Math.max(0, (durationMs - (deadline - Date.now())) / 1000);
            audio.play().catch(() => { if (active) setAudioBlocked(true); });
        };
        audio.addEventListener('loadedmetadata', startAudio);
        audio.src = previewUrl;
        audio.load();
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

    const submitGuess = event => {
        event.preventDefault();
        if (!canGuess || !socket.connected || !guess.trim()) return;
        setErrorMessage(null);
        socket.emit('submit_guess', { roomId: room.id, guess });
    };

    const toggleMute = () => setVolume(current => current > 0 ? 0 : previousVolumeRef.current);
    const skipSong = () => {
        if (socket.connected && canGuess) {
            socket.emit('skip_song', { roomId: room.id, roundNumber: round.roundNumber });
        }
    };

    return (
        <div className="game-room">
            <audio ref={audioRef} onPlay={() => setAudioBlocked(false)} onError={() => setAudioBlocked(true)} />

            <header className="game-status">
                <div>
                    <p className="eyebrow">{t('game.round')} {round?.roundNumber || 0} / {room.totalRounds}</p>
                    <h1>{t(phase === 'PLAYING' ? 'game.guessTheSong' : 'game.getReady')}</h1>
                </div>
                {phase === 'PLAYING' && (
                    <div
                        className={`timer-dial ${secondsLeft <= 5 ? 'is-urgent' : ''}`}
                        style={{ '--timer-progress': `${timerProgress * 360}deg` }}
                        role="timer"
                        aria-label={`${t('game.timeRemaining')}: ${secondsLeft}${t('game.secondsShort')}`}
                    >
                        <span>{secondsLeft}</span>
                        <small>{t('game.secondsShort')}</small>
                    </div>
                )}
            </header>

            <progress className="sr-only" aria-label={t('game.timeRemaining')} value={secondsLeft} max={durationMs / 1000} />

            <section className="song-stage" aria-live="polite">
                <div className={`cover-frame ${phase === 'PLAYING' ? 'is-playing' : ''}`}>
                    {phase === 'ROUND_OVER' && result?.song?.artwork ? (
                        <img src={result.song.artwork.replace('100x100', '400x400')} alt={t('game.albumArt')} />
                    ) : (
                        <div className="mystery-track" aria-hidden="true">
                            <span /><span /><span /><span /><span />
                        </div>
                    )}
                </div>

                {phase === 'ROUND_OVER' && result && (
                    <div className="round-result" role="status">
                        <p>{result.winner ? `${result.winner} ${t('game.guessed')}` : t(result.skipped ? 'game.songSkipped' : 'game.timeUp')}</p>
                        <h2>{result.song.title}</h2>
                        <span>{result.song.artist}</span>
                    </div>
                )}
            </section>

            <div className="round-controls" role="group" aria-label={t('game.volume')}>
                <div className="volume-control">
                    <button type="button" onClick={toggleMute} className="control-icon" aria-label={t('game.volume')}>
                        <VolumeIcon muted={volume === 0} />
                    </button>
                    <label htmlFor="game-volume" className="sr-only">{t('game.volume')}</label>
                    <input
                        id="game-volume"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={event => setVolume(Number(event.target.value))}
                        aria-valuetext={`${Math.round(volume * 100)}%`}
                    />
                    <output htmlFor="game-volume">{Math.round(volume * 100)}%</output>
                </div>

                {players.length === 1 && (
                    <button type="button" disabled={!canGuess} onClick={skipSong} className="skip-control">
                        <SkipIcon />
                        <span>{t('game.skipSong')}</span>
                    </button>
                )}
            </div>

            {audioBlocked && canGuess && (
                <button type="button" onClick={resumeAudio} className="audio-resume-button">
                    <VolumeIcon muted={false} /> {t('game.resumeAudio')}
                </button>
            )}

            <form onSubmit={submitGuess} className="guess-composer">
                <input
                    ref={inputRef}
                    type="text"
                    value={guess}
                    onChange={event => setGuess(event.target.value)}
                    placeholder={t('game.inputPlaceholder')}
                    aria-label={t('game.inputPlaceholder')}
                    enterKeyHint="send"
                    autoComplete="off"
                    disabled={!canGuess}
                    className="text-input"
                />
                <button type="submit" disabled={!canGuess} className="submit-button">
                    <span>{t('game.submit')}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6-7-1Z" /></svg>
                </button>
            </form>

            {errorMessage && canGuess && <p role="status" className="guess-error">{errorMessage}</p>}

            <section className="scoreboard" aria-labelledby="scoreboard-title">
                <div className="scoreboard-heading">
                    <h2 id="scoreboard-title">{t('game.scoreboard')}</h2>
                    <span>{players.length}</span>
                </div>
                <div className="score-list">
                    {[...players].sort((a, b) => b.score - a.score).map((player, index) => (
                        <div key={player.id} className="score-player">
                            <span className="score-position">{String(index + 1).padStart(2, '0')}</span>
                            <span className={`presence-dot ${player.connected ? 'is-online' : ''}`} />
                            <span className="score-name">{player.name}</span>
                            {!player.connected && <span className="reconnecting-label">{t('game.reconnectingPlayer')}</span>}
                            <strong>{player.score}</strong>
                        </div>
                    ))}
                </div>
            </section>

            {phase === 'COUNTDOWN' && secondsLeft > 0 && (
                <div className="countdown-overlay" role="status" aria-live="assertive">
                    <p>{t('game.getReady')}</p>
                    <strong>{secondsLeft}</strong>
                </div>
            )}
        </div>
    );
}
