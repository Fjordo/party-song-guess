require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const musicService = require('./services/musicService');
const aiService = require('./services/aiService');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for rapid dev
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store rooms in memory for speed
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', ({ playerName, totalRounds }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();

        // Default number of rounds; can be overridden when starting the game
        let rounds = 10;

        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: playerName, score: 0 }],
            state: 'LOBBY', // LOBBY, PLAYING, ENDED
            currentRound: 0,
            totalRounds: rounds,
            currentSong: null,
            scores: {}
        };
        socket.join(roomId);
        socket.emit('room_created', rooms[roomId]);
        console.log(`Room ${roomId} created by ${playerName}`);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        if (rooms[roomId] && rooms[roomId].state === 'LOBBY') {
            rooms[roomId].players.push({ id: socket.id, name: playerName, score: 0 });
            socket.join(roomId);
            io.to(roomId).emit('player_joined', rooms[roomId].players);
            socket.emit('room_joined', rooms[roomId]);
            console.log(`${playerName} joined room ${roomId}`);
        } else {
            socket.emit('error', { code: 'ROOM_NOT_FOUND_OR_STARTED' });
        }
    });

    socket.on('start_game', async ({ roomId, genre, genres, decade, rounds, language, difficulty }) => {
        const room = rooms[roomId];
        if (!room || room.players.length === 0) return;

        // 1. Setup Iniziale della Stanza
        let requestedRounds = parseInt(rounds, 10) || 10;
        if (requestedRounds > 50) requestedRounds = 50;

        room.state = 'LOADING'; // Stato intermedio utile per mostrare uno spinner nel frontend
        io.to(roomId).emit('game_loading', { message: "L'AI sta curando la tua playlist..." });

        try {
            // 2. Normalizzazione Input
            let activeGenres = Array.isArray(genres) && genres.length ? genres : [genre || 'pop'];
            
            console.log(`[Room ${roomId}] Generazione playlist AI: ${language}, ${decade}, ${difficulty}`);

            // 3. Chiamata a Gemini (Step 1: Ottenere i titoli)
            const aiRecommendations = await aiService.getSongListFromAI({
                genres: activeGenres,
                decade,
                language,
                difficulty,
                count: requestedRounds
            });

            if (!aiRecommendations || aiRecommendations.length === 0) {
                throw new Error("L'AI non ha restituito risultati validi.");
            }

            // 4. Chiamata ad Apple Music (Step 2: Ottenere l'audio)
            // OTTIMIZZAZIONE PRO: Usiamo Promise.all per fare tutte le richieste HTTP insieme
            const searchPromises = aiRecommendations.map(song => 
                musicService.searchAndGetPreview(song.artist, song.title)
            );

            const results = await Promise.all(searchPromises);

            // 5. Filtraggio
            // Rimuoviamo i null (canzoni non trovate o senza preview)
            const validSongs = results.filter(song => song !== null);

            // Mischiamo l'array finale per sicurezza (Fisher-Yates shuffle opzionale)
            const shuffledSongs = validSongs.sort(() => Math.random() - 0.5);

            // Tagliamo l'array al numero di round richiesti (se ne abbiamo trovate di più)
            const finalPlaylist = shuffledSongs.slice(0, requestedRounds);

            if (finalPlaylist.length === 0) {
                throw new Error("Nessuna canzone trovata su Apple Music compatibile con la lista AI.");
            }

            // 6. Aggiornamento Stato Stanza
            room.songs = finalPlaylist;
            room.totalRounds = finalPlaylist.length; // Aggiorniamo se ne abbiamo trovate meno del previsto
            room.currentRound = 0;
            room.state = 'PLAYING';

            console.log(`[Room ${roomId}] Partita iniziata con ${room.totalRounds} canzoni.`);

            // 7. Start Game
            io.to(roomId).emit('game_started', { totalRounds: room.totalRounds });
            
            // Piccolo delay per dare tempo al frontend di fare la transizione
            setTimeout(() => startRound(roomId), 1000);

        } catch (e) {
            console.error(`[Room ${roomId}] Errore Start Game:`, e.message);
            // Ripristina lo stato a LOBBY in modo che possano riprovare
            room.state = 'LOBBY';
            io.to(roomId).emit('error', { 
                code: 'GENERATION_FAILED', 
                message: "Impossibile generare la partita. Prova criteri meno restrittivi." 
            });
        }
    });


    socket.on('submit_guess', ({ roomId, guess }) => {
        const room = rooms[roomId];
        if (!room || !room.roundActive || room.state !== 'PLAYING') return;

        if (checkAnswer(guess, room.currentSong.title)) {
            room.roundActive = false;
            // Award point
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.score += 1;
                io.to(roomId).emit('update_scores', room.players);
                io.to(roomId).emit('round_winner', { player: player.name, song: room.currentSong });

                // Short pause just to let the winner message appear,
                // then immediately go to next song / end game.
                setTimeout(() => {
                    if (room.currentRound < room.totalRounds) {
                        startRound(roomId);
                    } else {
                        endGame(roomId);
                    }
                }, 1000);
            }
        } else {
            socket.emit('wrong_guess');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Cleanup if room empty?
    });
});

function startRound(roomId) {
    const room = rooms[roomId];
    if (room.currentRound >= room.totalRounds) {
        endGame(roomId);
        return;
    }

    // Emit countdown signal
    io.to(roomId).emit('start_countdown', { duration: 3 });

    setTimeout(() => {
        const song = room.songs[room.currentRound];
        room.currentSong = song;
        room.roundActive = true;
        room.currentRound++;

        io.to(roomId).emit('new_round', {
            roundNumber: room.currentRound,
            previewUrl: song.previewUrl
        });

        // Timeout if no one guesses in 30s
        setTimeout(() => {
            if (room.roundActive && room.currentSong === song) {
                room.roundActive = false;
                io.to(roomId).emit('round_timeout', { song: song });
                setTimeout(() => {
                    startRound(roomId);
                }, 5000);
            }
        }, 30000);
    }, 3000);

}

function endGame(roomId) {
    if (rooms[roomId]) {
        rooms[roomId].state = 'ENDED';
        io.to(roomId).emit('game_over', rooms[roomId].players);
    }
}

function checkAnswer(guess, actual) {
    if (!guess || !actual) return false;

    // Normalize strings: lowercase, remove punctuation, collapse spaces
    const clean = (str) =>
        str
            .toLowerCase()
            .replace(/\(.*?\)/g, '') // remove parentheses e.g. (Remix)
            .replace(/\bfeat\.?\b.*$/g, '') // drop "feat." and following
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const g = clean(guess);
    const a = clean(actual);

    if (!g || !a) return false;

    // Exact or substring match after normalization
    if (g === a) return true;
    if (g.includes(a) || a.includes(g)) return true;

    // Word-overlap heuristic: at least half of actual's words must appear in guess
    const aWords = Array.from(new Set(a.split(' ')));
    const gWords = new Set(g.split(' '));
    const common = aWords.filter((w) => gWords.has(w));
    if (aWords.length > 0 && common.length / aWords.length >= 0.6) {
        return true;
    }

    // Levenshtein distance similarity for small typos
    const similarity = (s1, s2) => {
        const len1 = s1.length;
        const len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0;

        const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
        for (let i = 0; i <= len1; i++) dp[i][0] = i;
        for (let j = 0; j <= len2; j++) dp[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1, // deletion
                    dp[i][j - 1] + 1, // insertion
                    dp[i - 1][j - 1] + cost // substitution
                );
            }
        }

        const dist = dp[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1 - dist / maxLen;
    };

    // Accept answers with reasonably high similarity (allows for typos)
    return similarity(g, a) >= 0.7;
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
