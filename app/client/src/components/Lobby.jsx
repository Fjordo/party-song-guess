import React from 'react';
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
    setSelectedDecade
}) {
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
                    <div>
                        <label className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.roundsLabel')}
                        </label>
                        <select
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            value={totalRounds}
                            onChange={e => setTotalRounds(parseInt(e.target.value, 10))}
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={15}>15</option>
                            <option value={20}>20</option>
                        </select>
                    </div>

                    <div>
                        <p className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.genresLabel')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {['pop', 'rock', 'hiphop', 'rap', 'trap', 'dance', 'jazz'].map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => toggleGenre(g)}
                                    className={`px-3 py-1 rounded-full text-xs sm:text-sm border transition ${
                                        selectedGenres.includes(g)
                                            ? 'bg-purple-600 border-purple-400 text-white'
                                            : 'bg-gray-700 border-gray-600 text-gray-200'
                                    }`}
                                >
                                    {t(`landing.genre_${g}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs sm:text-sm text-gray-400 mb-1">
                            {t('landing.decadesLabel')}
                        </label>
                        <select
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            value={selectedDecade}
                            onChange={e => setSelectedDecade(e.target.value)}
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
                </div>
            )}

            {isOwner ? (
                <button
                    onClick={() => startGame()}
                    className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg font-bold text-lg shadow-lg transform hover:scale-105 transition"
                >
                    {t('lobby.startGame')}
                </button>
            ) : (
                <p className="animate-pulse text-gray-400">{t('lobby.hostStarting')}</p>
            )}
        </div>
    );
}
