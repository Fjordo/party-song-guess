const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const musicService = require('./services/musicService');

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

    socket.on('start_game', async ({ roomId, genre, genres, decade, rounds }) => {
        const room = rooms[roomId];
        if (room && room.players.length > 0) {
            // Validate / normalize number of rounds chosen by owner
            let totalRounds = parseInt(rounds, 10);
            if (isNaN(totalRounds) || totalRounds <= 0) {
                totalRounds = room.totalRounds || 10;
            }
            if (totalRounds > 50) {
                totalRounds = 50;
            }
            room.totalRounds = totalRounds;
            room.state = 'PLAYING';
            room.currentRound = 0;

            try {
                let activeGenres = Array.isArray(genres) && genres.length ? genres : [];
                if (!activeGenres.length && genre) {
                    activeGenres = [genre];
                }
                if (!activeGenres.length) {
                    activeGenres = ['pop'];
                }

                const termParts = [activeGenres.join(' ')];
                if (decade) {
                    termParts.push(decade);
                }
                const searchTerm = termParts.join(' ');

                const songs = await musicService.getRandomSongs(searchTerm || 'pop', room.totalRounds);
                room.songs = songs;
                io.to(roomId).emit('game_started', { totalRounds: room.totalRounds });
                setTimeout(() => startRound(roomId), 500);
            } catch (e) {
                console.error(e);
            }
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

                setTimeout(() => {
                    if (room.currentRound < room.totalRounds) {
                        startRound(roomId);
                    } else {
                        endGame(roomId);
                    }
                }, 5000); // 5 sec interim
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
    const clean = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    return clean(guess) === clean(actual) || (clean(actual).length > 3 && clean(guess).includes(clean(actual)));
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
