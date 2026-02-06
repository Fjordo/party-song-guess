import React from 'react';

export default function Lobby({ room, players, startGame, isOwner }) {
    return (
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-lg text-center">
            <h2 className="text-2xl mb-2">Room ID: <span className="font-mono text-purple-400 font-bold">{room.id}</span></h2>
            <p className="text-gray-400 mb-6">Waiting for players...</p>

            <div className="grid grid-cols-2 gap-4 mb-8">
                {players.map(p => (
                    <div key={p.id} className="bg-gray-700 p-3 rounded flex items-center justify-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center font-bold">
                            {p.name[0].toUpperCase()}
                        </div>
                        {p.name}
                    </div>
                ))}
            </div>

            {isOwner ? (
                <button
                    onClick={() => startGame()}
                    className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg font-bold text-lg shadow-lg transform hover:scale-105 transition"
                >
                    Avvia Gioco
                </button>
            ) : (
                <p className="animate-pulse text-gray-400">L'host sta per avviare la partita...</p>
            )}
        </div>
    );
}
