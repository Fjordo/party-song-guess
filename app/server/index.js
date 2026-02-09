require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const musicService = require('./services/musicService');
const aiService = require('./services/aiService');
const { checkAnswer } = require('./utils/checkAnswer');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for rapid dev
        methods: ["GET", "POST"]
    }
});


const { createGameRoom, updateGameRoomStatus, endGame } = require('./services/supabaseClient');

const PORT = process.env.PORT || 3000;

// Store rooms in memory for speed
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', async ({ playerName, userId }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();

        // Default number of rounds; can be overridden when starting the game
        let rounds = 10;

        rooms[roomId] = {
            id: roomId,
            hostId: userId, // Store host ID for DB
            players: [{ id: socket.id, name: playerName, score: 0, userId }], // Store userId for DB
            state: 'LOBBY', // LOBBY, PLAYING, ENDED
            currentRound: 0,
            totalRounds: rounds,
            currentSong: null,
            scores: {}
        };
        socket.join(roomId);

        // SAVE TO DB
        if (userId) {
            await createGameRoom({
                id: roomId,
                hostId: userId,
                totalRounds: rounds,
                genres: ['pop'], // Default, will update later if needed or just track initial
                decade: null,
                language: null,
                difficulty: 'easy'
            });
        }

        socket.emit('room_created', rooms[roomId]);
        console.log(`Room ${roomId} created by ${playerName} (${userId})`);
    });

    socket.on('join_room', ({ roomId, playerName, userId }) => {
        if (rooms[roomId] && rooms[roomId].state === 'LOBBY') {
            rooms[roomId].players.push({ id: socket.id, name: playerName, score: 0, userId }); // Store userId
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

        // 1. Initial room setup
        let requestedRounds = parseInt(rounds, 10) || 10;
        if (requestedRounds > 50) requestedRounds = 50;

        room.state = 'LOADING';
        io.to(roomId).emit('game_loading', { message: 'Generating playlist...' });

        try {
            // 2. Input normalization
            let activeGenres = Array.isArray(genres) && genres.length ? genres : [genre || 'pop'];

            console.log(`Room ${roomId} Generating AI playlist: ${language}, ${decade}, ${difficulty}, ${requestedRounds} songs`);

            // 3. Call Gemini (Step 1: get song titles) with 20s timeout
            const AI_TIMEOUT = 20000;
            const aiRecommendations = await Promise.race([
                aiService.getSongListFromAI({
                    genres: activeGenres,
                    decade,
                    language,
                    difficulty,
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

            // Shuffle the final array
            const shuffledSongs = validSongs.sort(() => Math.random() - 0.5);

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

            // UPDATE DB STATUS
            if (room.hostId) {
                updateGameRoomStatus(roomId, 'PLAYING', { started_at: new Date().toISOString(), total_rounds: requestedRounds, genres: activeGenres, decade: decade, language: language, difficulty: difficulty });
            }

            console.log(`[Room ${roomId}] Partita iniziata con ${room.totalRounds} canzoni.`);

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
                code: isTimeout ? 'AI_TIMEOUT' : 'GENERATION_FAILED',
                message: e.message
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

                // Pause to let players see the winner and song info
                setTimeout(() => {
                    if (room.currentRound < room.totalRounds) {
                        startRound(roomId);
                    } else {
                        endGameInternal(roomId);
                    }
                }, 5000);
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
        endGameInternal(roomId);
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

function endGameInternal(roomId) {
    if (rooms[roomId]) {
        const room = rooms[roomId];
        room.state = 'ENDED';
        io.to(roomId).emit('game_over', room.players); // Pass players explicitely

        // SAVE TO DB (Async, don't block)
        if (room.hostId) {
            endGame(roomId, room.players).catch(err =>
                console.error("Failed to save game stats:", err)
            );
        }
    }
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
