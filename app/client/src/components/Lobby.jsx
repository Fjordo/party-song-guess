import React, { useState } from 'react';
import { t } from '../i18n';
import ShareRoomButton from './ShareRoomButton';

const GENRES = ['pop', 'rock', 'hiphop', 'rap', 'trap', 'dance', 'jazz', 'metal', 'indie', 'electronic', 'rnb'];

export default function Lobby({
    room,
    players,
    startGame,
    isOwner,
    totalRounds,
    setTotalRounds,
    selectedGenres,
    toggleGenre,
    selectedDecade,
    setSelectedDecade,
    selectedLanguage,
    setSelectedLanguage,
    selectedDifficulty,
    setSelectedDifficulty,
    errorMessage
}) {
    const [isLoadingInternal, setIsLoadingInternal] = useState(false);
    const isLoading = isLoadingInternal && !errorMessage;

    const handleStartGame = async () => {
        setIsLoadingInternal(true);
        try {
            await startGame({
                rounds: totalRounds,
                genres: selectedGenres,
                decade: selectedDecade,
                language: selectedLanguage,
                difficulty: selectedDifficulty
            });
        } catch (error) {
            console.error('Start game error:', error);
            setIsLoadingInternal(false);
        }
    };

    return (
        <div className="surface-card lobby-card">
            <header className="lobby-header">
                <div className="room-code-block">
                    <div>
                    <p className="eyebrow">ROOM CODE</p>
                    <h1>{room.id}</h1>
                    </div>
                    <ShareRoomButton roomId={room.id} />
                </div>
                <span className="waiting-badge"><i />{t('lobby.waiting')}</span>
            </header>

            <section className="players-section" aria-label={t('game.scoreboard')}>
                <div className="players-heading">
                    <h2>{t('game.scoreboard')}</h2>
                    <span>{players.length}</span>
                </div>
                <div className="player-chips">
                    {players.map(player => (
                        <div key={player.id} className="player-chip">
                            <span className="player-avatar">{player.name[0].toUpperCase()}</span>
                            <span>{player.name}</span>
                        </div>
                    ))}
                </div>
            </section>

            {isOwner && (
                <section className="settings-panel">
                    <div className="settings-grid">
                        <label className="select-field">
                            <span>{t('landing.roundsLabel')}</span>
                            <select value={totalRounds} onChange={event => setTotalRounds(parseInt(event.target.value, 10))} disabled={isLoading}>
                                <option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={20}>20</option>
                            </select>
                        </label>
                        <label className="select-field">
                            <span>{t('landing.difficultyLabel')}</span>
                            <select value={selectedDifficulty} onChange={event => setSelectedDifficulty(event.target.value)} disabled={isLoading}>
                                <option value="easy">{t('landing.difficulty_easy')}</option>
                                <option value="hard">{t('landing.difficulty_hard')}</option>
                            </select>
                        </label>
                        <label className="select-field">
                            <span>{t('landing.decadesLabel')}</span>
                            <select value={selectedDecade} onChange={event => setSelectedDecade(event.target.value)} disabled={isLoading}>
                                <option value="">{t('landing.anyDecade')}</option>
                                {['50s', '60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'].map(decade => (
                                    <option key={decade} value={decade}>{t(`landing.decade_${decade}`)}</option>
                                ))}
                            </select>
                        </label>
                        <label className="select-field">
                            <span>{t('landing.languageLabel')}</span>
                            <select value={selectedLanguage} onChange={event => setSelectedLanguage(event.target.value)} disabled={isLoading}>
                                <option value="">{t('landing.language_any')}</option>
                                <option value="it">{t('landing.language_it')}</option>
                                <option value="en">{t('landing.language_en')}</option>
                                <option value="es">{t('landing.language_es')}</option>
                            </select>
                        </label>
                    </div>

                    <fieldset className="genre-fieldset" disabled={isLoading}>
                        <legend>{t('landing.genresLabel')}</legend>
                        <div className="genre-grid">
                            {GENRES.map(genre => (
                                <button
                                    key={genre}
                                    type="button"
                                    aria-pressed={selectedGenres.includes(genre)}
                                    onClick={() => toggleGenre(genre)}
                                    className={selectedGenres.includes(genre) ? 'is-selected' : ''}
                                >
                                    {t(`landing.genre_${genre}`)}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                </section>
            )}

            {isOwner ? (
                <button onClick={handleStartGame} disabled={isLoading} className="primary-button lobby-start">
                    {isLoading ? <><span className="status-spinner" />{t('lobby.generating')}</> : <>{t('lobby.startGame')}<span aria-hidden="true">→</span></>}
                </button>
            ) : (
                <p className="host-waiting">{t('lobby.hostStarting')}</p>
            )}
        </div>
    );
}
