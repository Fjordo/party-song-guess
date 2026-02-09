import React, { useState } from 'react';
import { t } from '../i18n';

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
        // Attiviamo lo spinner
        setIsLoadingInternal(true);
        
        try {
            // Passiamo i dati al padre.
            // Nota: Se startGame restituisce una Promise, l'await aspetterà.
            // Se non restituisce una Promise, lo spinner girerà finché il componente non viene smontato (inizio gioco).
            await startGame({
                rounds: totalRounds,
                genres: selectedGenres,
                decade: selectedDecade,
                language: selectedLanguage,
                difficulty: selectedDifficulty
            });
        } catch (error) {
            // Se c'è un errore immediato, fermiamo lo spinner (opzionale, dipende da come gestisci gli errori nel padre)
            console.error("Errore avvio:", error);
            setIsLoadingInternal(false);
        }
    };

    return (
        <div className="bg-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg text-center">
            <h2 className="text-xl sm:text-2xl mb-2 break-all">
                Room ID: <span className="font-mono text-purple-400 font-bold">{room.id}</span>
            </h2>
            <p className="text-gray-400 mb-6 text-sm sm:text-base">{t('lobby.waiting')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {players.map(p => (
                    <div key={p.id} className="bg-gray-700 p-3 rounded flex items-center justify-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center font-bold">
                            {p.name[0].toUpperCase()}
                        </div>
                        {p.name}
                    </div>
                ))}
            </div>

            {isOwner && (
                <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 mb-4 text-left space-y-4">
                    
                    {/* SELEZIONE ROUNDS */}
                    <div>
                        <label className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.roundsLabel')}
                        </label>
                        <select
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            value={totalRounds}
                            onChange={e => setTotalRounds(parseInt(e.target.value, 10))}
                            disabled={isLoading} // Disabilita input durante il caricamento
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={15}>15</option>
                            <option value={20}>20</option>
                        </select>
                    </div>

                    {/* SELEZIONE GENERI */}
                    <div>
                        <p className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.genresLabel')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {['pop', 'rock', 'hiphop', 'rap', 'trap', 'dance', 'jazz', 'metal', 'indie', 'electronic', 'rnb'].map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => toggleGenre(g)}
                                    className={`px-3 py-1 rounded-full text-xs sm:text-sm border transition ${
                                        selectedGenres.includes(g)
                                            ? 'bg-purple-600 border-purple-400 text-white'
                                            : 'bg-gray-700 border-gray-600 text-gray-200'
                                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {t(`landing.genre_${g}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* SELEZIONE DECENNIO */}
                    <div>
                        <label className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.decadesLabel')}
                        </label>
                        <select
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            value={selectedDecade}
                            onChange={e => setSelectedDecade(e.target.value)}
                            disabled={isLoading}
                        >
                            <option value="">{t('landing.anyDecade')}</option>
                            <option value="50s">{t('landing.decade_50s')}</option>
                            <option value="60s">{t('landing.decade_60s')}</option>
                            <option value="70s">{t('landing.decade_70s')}</option>
                            <option value="80s">{t('landing.decade_80s')}</option>
                            <option value="90s">{t('landing.decade_90s')}</option>
                            <option value="2000s">{t('landing.decade_2000s')}</option>
                            <option value="2010s">{t('landing.decade_2010s')}</option>
                            <option value="2020s">{t('landing.decade_2020s')}</option>
                        </select>
                    </div>

                    {/* SELEZIONE LINGUA */}
                    <div>
                        <label className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.languageLabel')}
                        </label>
                        <select
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            value={selectedLanguage} 
                            onChange={e => setSelectedLanguage(e.target.value)}
                            disabled={isLoading}
                        >
                            <option value="">{t('landing.language_any')}</option>
                            <option value="it">{t('landing.language_it')}</option>
                            <option value="en">{t('landing.language_en')}</option>
                            <option value="es">{t('landing.language_es')}</option>
                        </select>
                    </div>

                    {/* SELEZIONE DIFFICOLTA */}
                    <div>
                        <label className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.difficultyLabel')}
                        </label>
                        <select
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            value={selectedDifficulty}
                            onChange={e => setSelectedDifficulty(e.target.value)}
                            disabled={isLoading}
                        >
                            <option value="easy">{t('landing.difficulty_easy')}</option>
                            <option value="hard">{t('landing.difficulty_hard')}</option>
                        </select>
                    </div>
                </div>
            )}

            {isOwner ? (
                <button
                    onClick={handleStartGame} 
                    disabled={isLoading} // Disabilita il click se sta caricando
                    className={`w-full py-3 rounded-lg font-bold text-lg shadow-lg transform transition flex items-center justify-center 
                        ${isLoading 
                            ? 'bg-gray-600 cursor-not-allowed opacity-75' 
                            : 'bg-green-600 hover:bg-green-700 hover:scale-105'
                        }`}
                >
                    {isLoading ? (
                        <>
                            {/* SVG Spinner di Tailwind */}
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('lobby.generating')}
                        </>
                    ) : (
                        t('lobby.startGame')
                    )}
                </button>
            ) : (
                <p className="animate-pulse text-gray-400">{t('lobby.hostStarting')}</p>
            )}
        </div>
    );
}