require('dotenv').config();

// Validate required environment variables at boot
if (!process.env.GEMINI_API_KEY) {
    console.error('FATAL: GEMINI_API_KEY environment variable is not set');
    process.exit(1);
}

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const musicService = require('./services/musicService');
const aiService = require('./services/aiService');
const { checkAnswer } = require('./utils/checkAnswer');

const app = express();

// Security headers
app.use(helmet());

// Restrict CORS to known origins
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigin,
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store rooms in memory for speed
const rooms = {};

// Rate limiting: max 30 events per socket per minute
const rateLimits = {};
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(socketId) {
    const now = Date.now();
    if (!rateLimits[socketId] || now > rateLimits[socketId].resetTime) {
        rateLimits[socketId] = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    }
    rateLimits[socketId].count++;
    return rateLimits[socketId].count <= RATE_LIMIT_MAX;
}

// Secure random room ID generation
function generateRoomId() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Fisher-Yates shuffle
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Input validation helpers
function validatePlayerName(name) {
    return typeof name === 'string' && name.length >= 1 && name.length <= 50;
}

function validateRoomId(roomId) {
    return typeof roomId === 'string' && /^[A-F0-9]{6}$/.test(roomId);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', ({ playerName }) => {
        if (!checkRateLimit(socket.id)) {
            socket.emit('error', { code: 'RATE_LIMIT_EXCEEDED' });
            return;
        }
        if (!validatePlayerName(playerName)) {
            socket.emit('error', { code: 'INVALID_NAME' });
            return;
        }

        const roomId = generateRoomId();
        const safeName = playerName.trim().slice(0, 50);

        // Default number of rounds; can be overridden when starting the game
        let rounds = 10;

        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: safeName, score: 0 }],
            state: 'LOBBY', // LOBBY, PLAYING, ENDED
            currentRound: 0,
            totalRounds: rounds,
            currentSong: null,
            scores: {}
        };
        socket.join(roomId);
        socket.emit('room_created', rooms[roomId]);
        console.log(`Room ${roomId} created by ${safeName}`);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        if (!checkRateLimit(socket.id)) {
            socket.emit('error', { code: 'RATE_LIMIT_EXCEEDED' });
            return;
        }
        if (!validateRoomId(roomId) || !validatePlayerName(playerName)) {
            socket.emit('error', { code: 'INVALID_INPUT' });
            return;
        }

        const safeName = playerName.trim().slice(0, 50);
        if (rooms[roomId] && rooms[roomId].state === 'LOBBY') {
            rooms[roomId].players.push({ id: socket.id, name: safeName, score: 0 });
            socket.join(roomId);
            io.to(roomId).emit('player_joined', rooms[roomId].players);
            socket.emit('room_joined', rooms[roomId]);
            console.log(`${safeName} joined room ${roomId}`);
        } else {
            socket.emit('error', { code: 'ROOM_NOT_FOUND_OR_STARTED' });
        }
    });

    socket.on('start_game', async ({ roomId, genre, genres, decade, rounds, language, difficulty }) => {
        if (!checkRateLimit(socket.id)) {
            socket.emit('error', { code: 'RATE_LIMIT_EXCEEDED' });
            return;
        }
        if (!validateRoomId(roomId)) {
            socket.emit('error', { code: 'INVALID_INPUT' });
            return;
        }

        const room = rooms[roomId];
        if (!room || room.players.length === 0) return;

        // Only room creator (first player) can start the game
        if (room.players[0].id !== socket.id) {
            socket.emit('error', { code: 'UNAUTHORIZED' });
            return;
        }

        // 1. Initial room setup — clamp rounds between 1 and 50
        let requestedRounds = Math.max(1, Math.min(50, parseInt(rounds, 10) || 10));

        // Whitelist validation to prevent prompt injection into AI service
        const ALLOWED_GENRES = new Set(['pop', 'rock', 'hiphop', 'rap', 'trap', 'dance', 'jazz', 'metal', 'indie', 'electronic', 'rnb']);
        const ALLOWED_DECADES = new Set(['50s', '60s', '70s', '80s', '90s', '2000s', '2010s', '2020s', '']);
        const ALLOWED_LANGUAGES = new Set(['it', 'en', 'es', '']);
        const ALLOWED_DIFFICULTIES = new Set(['easy', 'hard']);

        const safeGenres = Array.isArray(genres)
            ? genres.filter(g => typeof g === 'string' && ALLOWED_GENRES.has(g))
            : [];
        const safeDecade = ALLOWED_DECADES.has(decade ?? '') ? (decade || null) : null;
        const safeLanguage = ALLOWED_LANGUAGES.has(language ?? '') ? (language || null) : null;
        const safeDifficulty = ALLOWED_DIFFICULTIES.has(difficulty) ? difficulty : 'easy';

        if (safeGenres.length === 0) {
            socket.emit('error', { code: 'INVALID_INPUT' });
            return;
        }

        room.state = 'LOADING';
        io.to(roomId).emit('game_loading', { message: 'Generating playlist...' });

        try {
            // 2. Input normalization (use whitelisted safe values)
            const activeGenres = safeGenres.length ? safeGenres : [genre || 'pop'];

            console.log(`Room ${roomId} Generating AI playlist: ${safeLanguage}, ${safeDecade}, ${safeDifficulty}, ${requestedRounds} songs`);

            // 3. Call Gemini (Step 1: get song titles) with 20s timeout
            const AI_TIMEOUT = 20000;
            const aiRecommendations = await Promise.race([
                aiService.getSongListFromAI({
                    genres: activeGenres,
                    decade: safeDecade,
                    language: safeLanguage,
                    difficulty: safeDifficulty,
                    count: requestedRounds
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('AI timeout: no response within 15 seconds.')), AI_TIMEOUT)
                )
            ]);

            if (!aiRecommendations || aiRecommendations.length === 0) {
                throw new Error('AI returned no valid results.');
            }

            // 4. Call Apple Music (Step 2: get audio previews)
            // Run all search requests in parallel
            const searchPromises = aiRecommendations.map(song =>
                musicService.searchAndGetPreview(song.artist, song.title)
            );

            const results = await Promise.all(searchPromises);

            // 5. Filter out songs not found or without preview
            const validSongs = results.filter(song => song !== null);

            // Shuffle the final array using Fisher-Yates
            const shuffledSongs = shuffle(validSongs);

            // Trim to requested number of rounds
            const finalPlaylist = shuffledSongs.slice(0, requestedRounds);

            if (finalPlaylist.length === 0) {
                throw new Error('No songs found on Apple Music matching the AI list.');
            }

            // 6. Update room state
            room.songs = finalPlaylist;
            room.totalRounds = finalPlaylist.length;
            room.currentRound = 0;
            room.state = 'PLAYING';

            console.log(`Room ${roomId} Game started with ${room.totalRounds} songs.`);

            // 7. Start Game
            io.to(roomId).emit('game_started', { totalRounds: room.totalRounds });

            // Short delay to let the frontend transition
            setTimeout(() => startRound(roomId), 1000);

        } catch (e) {
            console.error(`Room ${roomId} Start game error:`, e.message);
            // Reset to LOBBY so players can retry
            room.state = 'LOBBY';
            const isTimeout = e.message.startsWith('AI timeout');
            io.to(roomId).emit('error', {
                code: isTimeout ? 'AI_TIMEOUT' : 'GENERATION_FAILED'
                // Error details logged server-side only, not sent to client
            });
        }
    });


    socket.on('submit_guess', ({ roomId, guess }) => {
        if (!checkRateLimit(socket.id)) {
            socket.emit('error', { code: 'RATE_LIMIT_EXCEEDED' });
            return;
        }
        if (!validateRoomId(roomId) || typeof guess !== 'string' || guess.length > 200) {
            socket.emit('error', { code: 'INVALID_INPUT' });
            return;
        }

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

                // Pause to let players see the winner and song info
                setTimeout(() => {
                    if (room.currentRound < room.totalRounds) {
                        startRound(roomId);
                    } else {
                        endGame(roomId);
                    }
                }, 5000);
            }
        } else {
            socket.emit('wrong_guess');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up rate limit data
        delete rateLimits[socket.id];
        // Remove player from any room they were in
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted (empty after disconnect)`);
                } else {
                    io.to(roomId).emit('player_joined', room.players);
                }
                break;
            }
        }
    });
});

function startRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;
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
        // Schedule room cleanup after 30 minutes
        setTimeout(() => {
            delete rooms[roomId];
            console.log(`Room ${roomId} cleaned up after game end`);
        }, 30 * 60 * 1000);
    }
}

// checkAnswer function moved to utils/checkAnswer.js for better testability

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
