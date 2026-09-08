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
const catalogRepo = require('./services/catalogRepo');
const catalogBuilder = require('./services/catalogBuilder');
const catalogScheduler = require('./services/catalogScheduler');
const { checkAnswer } = require('./utils/checkAnswer');
const {
    ALLOWED_GENRES,
    ALLOWED_DECADES,
    ALLOWED_LANGUAGES,
    ALLOWED_DIFFICULTIES
} = require('./utils/catalogTags');
const { createLogger, currentLevel } = require('./utils/logger');

const log = createLogger('game');

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

app.get('/health', (_req, res) => res.sendStatus(200));

// Store rooms in memory for speed
const rooms = {};
const sessions = new Map();
const RECONNECT_GRACE_MS = 60000;
const ROUND_DURATION_MS = 30000;

function hostId(room) {
    return room.players.find(player => player.connected)?.id;
}

function roundSnapshot(room) {
    return {
        phase: room.phase || 'WAITING',
        roundNumber: room.currentRound,
        remainingMs: Math.max(0, (room.phaseEndsAt || 0) - Date.now()),
        durationMs: ROUND_DURATION_MS,
        ...(room.roundActive ? { previewUrl: room.currentSong.previewUrl,
            elapsedMs: Date.now() - room.roundStartedAt } : {}),
        ...(room.phase === 'ROUND_OVER' ? { result: room.roundResult } : {})
    };
}

function publicRoom(room) {
    return { id: room.id, players: room.players, state: room.state,
        totalRounds: room.totalRounds, settings: room.settings, gameId: room.gameId,
        round: roundSnapshot(room) };
}

function publishRound(room) {
    io.to(room.id).emit('round_state', roundSnapshot(room));
}

function registerSession(socket, room, player) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { roomId: room.id, player, socket });
    socket.data.sessionToken = token;
    socket.emit('session_created', { roomId: room.id, token, playerName: player.name });
}

function deleteRoom(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    clearTimeout(room.cleanupTimer);
    clearTimeout(room.roundTimer);
    for (const [token, session] of sessions) {
        if (session.roomId !== roomId) continue;
        clearTimeout(session.timer);
        sessions.delete(token);
    }
    delete rooms[roomId];
}

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

/**
 * Project a catalog song onto the payload the client expects.
 * Keeps internal fields (ids, play counters) off the wire.
 */
function publicSong(song) {
    return {
        title: song.title,
        artist: song.artist,
        artwork: song.artworkUrl,
        previewUrl: song.previewUrl
    };
}

// Input validation helpers
function validatePlayerName(name) {
    return typeof name === 'string' && name.length >= 1 && name.length <= 50;
}

function validateRoomId(roomId) {
    return typeof roomId === 'string' && /^[A-F0-9]{6}$/.test(roomId);
}

function removePlayer(socket, roomId) {
    const room = rooms[roomId];
    if (!room || !room.players.some(p => p.id === socket.id)) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    const session = sessions.get(socket.data.sessionToken);
    if (session?.roomId === roomId) {
        clearTimeout(session.timer);
        sessions.delete(socket.data.sessionToken);
        socket.data.sessionToken = null;
    }
    socket.leave(roomId);
    if (room.players.length === 0) {
        deleteRoom(roomId);
        log.info('room %s deleted (empty)', roomId);
    } else {
        io.to(roomId).emit('player_joined', room.players);
    }
}

io.on('connection', (socket) => {
    socket.data ||= {};
    log.debug('socket connected: %s (transport=%s)',
        socket.id, socket.conn && socket.conn.transport && socket.conn.transport.name);

    socket.on('get_catalog_stats', (reply) => {
        if (typeof reply !== 'function') return;
        if (!checkRateLimit(socket.id)) {
            reply({ error: 'RATE_LIMIT_EXCEEDED' });
            return;
        }
        try {
            const { total, byGenre } = catalogRepo.stats();
            const counts = new Map(byGenre.map(({ value, n }) => [value, n]));
            reply({
                total,
                byGenre: [...ALLOWED_GENRES].map(genre => ({ genre, count: counts.get(genre) || 0 }))
            });
        } catch (error) {
            log.error('catalog statistics unavailable: %s', error.message);
            reply({ error: 'CATALOG_UNAVAILABLE' });
        }
    });

    socket.on('resume_room', ({ roomId, token } = {}) => {
        if (!checkRateLimit(socket.id)) return;
        const session = typeof token === 'string' ? sessions.get(token) : null;
        const room = validateRoomId(roomId) ? rooms[roomId] : null;
        if (!session || !room || session.roomId !== roomId ||
            (socket.data.sessionToken && socket.data.sessionToken !== token)) {
            socket.emit('resume_failed');
            return;
        }
        clearTimeout(session.timer);
        // A refreshed tab can reconnect before the old transport times out.
        // Possession of the private token transfers the seat, never duplicates it.
        if (session.socket !== socket) {
            session.socket.leave(roomId);
            session.socket.data.sessionToken = null;
            session.socket.emit('session_replaced');
            session.socket = socket;
        }
        session.player.id = socket.id;
        session.player.connected = true;
        socket.data.sessionToken = token;
        socket.join(roomId);
        socket.emit('room_resumed', publicRoom(room));
        io.to(roomId).emit('player_joined', room.players);
    });

    socket.on('get_room_state', ({ roomId } = {}) => {
        const room = validateRoomId(roomId) ? rooms[roomId] : null;
        if (!room || !room.players.some(p => p.id === socket.id && p.connected)) return;
        if (!checkRateLimit(socket.id)) return;
        socket.emit('room_resumed', publicRoom(room));
    });

    socket.on('create_room', ({ playerName }) => {
        if (sessions.has(socket.data.sessionToken)) return;
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
            players: [{ id: socket.id, name: safeName, score: 0, connected: true }],
            state: 'LOBBY', // LOBBY, PLAYING, ENDED
            currentRound: 0,
            totalRounds: rounds,
            currentSong: null,
            scores: {},
            // Songs already handed to this room, so a rematch draws fresh ones
            playedSongIds: new Set(),
            // Bumped on every start_game; timers from an older game check it and
            // bail, so a finished game cannot interfere with the next one
            gameId: 0
        };
        socket.join(roomId);
        registerSession(socket, rooms[roomId], rooms[roomId].players[0]);
        socket.emit('room_created', publicRoom(rooms[roomId]));
        log.info('room %s created by %s', roomId, safeName);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        if (sessions.has(socket.data.sessionToken)) return;
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
            const player = { id: socket.id, name: safeName, score: 0, connected: true };
            rooms[roomId].players.push(player);
            registerSession(socket, rooms[roomId], player);
            socket.join(roomId);
            io.to(roomId).emit('player_joined', rooms[roomId].players);
            socket.emit('room_joined', publicRoom(rooms[roomId]));
            log.info('room %s: %s joined (%d players)', roomId, safeName, rooms[roomId].players.length);
        } else {
            socket.emit('error', { code: 'ROOM_NOT_FOUND_OR_STARTED' });
        }
    });

    const startGame = async ({ roomId, genres, decade, rounds, language, difficulty } = {}) => {
        if (!checkRateLimit(socket.id)) {
            socket.emit('error', { code: 'RATE_LIMIT_EXCEEDED' });
            return;
        }
        if (!validateRoomId(roomId)) {
            socket.emit('error', { code: 'INVALID_INPUT' });
            return;
        }

        const room = rooms[roomId];
        if (!room || !['LOBBY', 'ENDED'].includes(room.state)) return;

        // Only room creator (first player) can start the game
        if (hostId(room) !== socket.id) {
            socket.emit('error', { code: 'UNAUTHORIZED' });
            return;
        }

        // 1. Initial room setup — clamp rounds between 1 and 50
        let requestedRounds = Math.max(1, Math.min(50, parseInt(rounds, 10) || 10));

        // Whitelist validation to prevent prompt injection into AI service
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

        room.settings = { genres: safeGenres, decade: safeDecade, rounds: requestedRounds,
            language: safeLanguage, difficulty: safeDifficulty };
        clearTimeout(room.cleanupTimer);
        room.state = 'LOADING';
        room.roundActive = false;
        room.phase = 'WAITING';
        log.debug('room %s start_game: genres=[%s] decade=%s language=%s difficulty=%s rounds=%d alreadyPlayed=%d',
            roomId, safeGenres.join(','), safeDecade || 'any', safeLanguage || 'any',
            safeDifficulty, requestedRounds, room.playedSongIds.size);
        io.to(roomId).emit('game_loading', { settings: room.settings });

        try {
            const request = {
                genres: safeGenres,
                decade: safeDecade,
                language: safeLanguage,
                difficulty: safeDifficulty
            };

            // 1. Fast path: read from the catalog. No external call, no wait.
            let result = catalogRepo.query({
                ...request,
                exclude: room.playedSongIds,
                limit: requestedRounds
            });

            // 2. This room has worked through its pool. Recycling it is free,
            //    unlike asking the AI, so try that before spending a call.
            if (result.songs.length < requestedRounds && room.playedSongIds.size > 0) {
                log.debug('room %s exhausted its pool (%d/%d), recycling its history',
                    roomId, result.songs.length, requestedRounds);
                room.playedSongIds.clear();
                result = catalogRepo.query({ ...request, limit: requestedRounds });
            }

            // 3. Genuinely not enough songs for these settings: discover live,
            //    and keep whatever we find so the next game does not pay again.
            let liveFailure = null;
            if (result.songs.length < requestedRounds) {
                log.info('room %s catalog short (%d/%d, relaxedTo=%s), asking the AI',
                    roomId, result.songs.length, requestedRounds, result.relaxedTo);

                const AI_TIMEOUT = 20000;
                try {
                    await Promise.race([
                        catalogBuilder.runFallback({ ...request, count: requestedRounds }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('AI timeout: no response in time.')), AI_TIMEOUT)
                        )
                    ]);
                    result = catalogRepo.query({
                        ...request,
                        exclude: room.playedSongIds,
                        limit: requestedRounds
                    });
                } catch (error) {
                    // A shorter game beats no game: only give up if we have nothing.
                    liveFailure = error;
                    log.error('room %s live discovery failed:', roomId, error.message);
                }
            }

            // The last player may have left while live discovery was pending.
            if (rooms[roomId] !== room) return;
            const playlist = result.songs;

            if (playlist.length === 0) {
                room.state = 'LOBBY';
                io.to(roomId).emit('room_resumed', publicRoom(room));
                const isTimeout = liveFailure && liveFailure.message.startsWith('AI timeout');
                log.warn('room %s could not build a playlist (timeout=%s)', roomId, Boolean(isTimeout));
                io.to(roomId).emit('error', {
                    code: isTimeout ? 'AI_TIMEOUT' : 'GENERATION_FAILED'
                    // Error details logged server-side only, not sent to client
                });
                return;
            }

            // Remember them now, not as they play: an abandoned game should not
            // hand the same songs back on a rematch.
            playlist.forEach(song => room.playedSongIds.add(song.id));

            room.songs = playlist;
            room.totalRounds = playlist.length;
            room.currentRound = 0;
            room.players.forEach(player => { player.score = 0; });
            room.roundResult = null;
            room.phaseEndsAt = 0;
            room.state = 'PLAYING';
            // Invalidate any timer still pending from the previous game
            room.gameId = (room.gameId || 0) + 1;
            const gameId = room.gameId;
            // The room is alive again: cancel the abandonment cleanup
            clearTimeout(room.cleanupTimer);
            room.cleanupTimer = null;

            log.info('room %s started: %d songs, relaxedTo=%s, game #%d',
                roomId, room.totalRounds, result.relaxedTo, gameId);
            if (log.isDebug()) {
                playlist.forEach((song, i) =>
                    log.debug('  round %d: %s - %s [id=%d %s/%s]',
                        i + 1, song.artist, song.title, song.id,
                        song.decade || '?', song.effDifficulty || song.aiDifficulty || '?'));
            }

            io.to(roomId).emit('game_started', publicRoom(room));

            // Short delay to let the frontend transition
            setTimeout(() => startRound(roomId, gameId), 1000);

        } catch (e) {
            if (rooms[roomId] !== room) return;
            log.error('room %s start_game failed:', roomId, e.message);
            // Reset to LOBBY so players can retry
            room.state = 'LOBBY';
            io.to(roomId).emit('room_resumed', publicRoom(room));
            io.to(roomId).emit('error', { code: 'GENERATION_FAILED' });
        }
    };
    socket.on('start_game', startGame);
    socket.on('rematch', ({ roomId } = {}) => {
        const room = validateRoomId(roomId) ? rooms[roomId] : null;
        if (!room || room.state !== 'ENDED') return;
        return startGame({ roomId, ...room.settings });
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
        if (!room.players.some(p => p.id === socket.id && p.connected)) return;

        if (checkAnswer(guess, room.currentSong.title)) {
            room.roundActive = false;
            clearTimeout(room.roundTimer);
            // Award point
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.score += 1;

                // How fast a song gets guessed is the only real difficulty
                // signal we have; the AI's label is never verified.
                const elapsed = Date.now() - room.roundStartedAt;
                log.debug('room %s round %d won by %s in %dms',
                    roomId, room.currentRound, player.name, elapsed);
                catalogRepo.recordGuess(room.currentSong.id, elapsed);

                io.to(roomId).emit('update_scores', room.players);
                room.phase = 'ROUND_OVER';
                room.roundResult = { winner: player.name, song: publicSong(room.currentSong) };
                room.phaseEndsAt = Date.now() + 5000;
                publishRound(room);
                io.to(roomId).emit('round_winner', { player: player.name, song: publicSong(room.currentSong) });

                // Pause to let players see the winner and song info
                const gameId = room.gameId;
                setTimeout(() => {
                    if (!rooms[roomId] || room.gameId !== gameId) return;
                    if (room.currentRound < room.totalRounds) {
                        startRound(roomId, gameId);
                    } else {
                        endGame(roomId, gameId);
                    }
                }, 5000);
            }
        } else {
            log.debug('room %s wrong guess from %s: "%s"', roomId, socket.id, guess);
            socket.emit('wrong_guess');
        }
    });

    socket.on('skip_song', ({ roomId, roundNumber } = {}) => {
        if (!validateRoomId(roomId)) return;
        const room = rooms[roomId];
        if (!room || room.state !== 'PLAYING' || !room.roundActive ||
            room.players.length !== 1 || room.players[0].id !== socket.id || !room.players[0].connected ||
            room.currentRound !== roundNumber) return;

        room.roundActive = false;
        clearTimeout(room.roundTimer);
        room.phase = 'ROUND_OVER';
        room.roundResult = { winner: null, song: publicSong(room.currentSong), skipped: true };
        room.phaseEndsAt = Date.now() + 5000;
        publishRound(room);
        io.to(roomId).emit('round_skipped', { song: publicSong(room.currentSong) });
        const gameId = room.gameId;
        setTimeout(() => startRound(roomId, gameId), 5000);
    });

    socket.on('leave_game', ({ roomId } = {}) => {
        if (!validateRoomId(roomId)) return;
        removePlayer(socket, roomId);
        socket.emit('game_left', { roomId });
    });

    socket.on('disconnect', (reason) => {
        log.debug('socket disconnected: %s (%s)', socket.id, reason);
        // Clean up rate limit data
        delete rateLimits[socket.id];
        // Explicit leave removes the player immediately; network loss preserves the seat.
        const session = sessions.get(socket.data.sessionToken);
        if (!session || session.player.id !== socket.id) return;
        session.player.connected = false;
        const room = rooms[session.roomId];
        if (!room) return;
        io.to(room.id).emit('player_joined', room.players);
        session.timer = setTimeout(() => removePlayer(socket, room.id), RECONNECT_GRACE_MS);
    });
});

/**
 * Run one round.
 *
 * `gameId` guards every timer: a game that has already finished must not be
 * able to advance, or end, the game that replaced it. Without this a rematch
 * gets torn down by the previous game's pending timers — which only became
 * reachable once starting a game stopped taking seconds.
 */
function startRound(roomId, gameId) {
    const room = rooms[roomId];
    if (!room || room.gameId !== gameId || room.state !== 'PLAYING') return;
    if (room.currentRound >= room.totalRounds) {
        endGame(roomId, gameId);
        return;
    }

    room.phase = 'COUNTDOWN';
    room.roundActive = false;
    room.phaseEndsAt = Date.now() + 3000;
    publishRound(room);
    // Emit countdown signal
    io.to(roomId).emit('start_countdown', { duration: 3 });

    setTimeout(() => {
        if (!rooms[roomId] || room.gameId !== gameId) return;

        const song = room.songs[room.currentRound];
        room.currentSong = song;
        room.roundActive = true;
        room.roundStartedAt = Date.now();
        room.phase = 'PLAYING';
        room.phaseEndsAt = room.roundStartedAt + ROUND_DURATION_MS;
        room.currentRound++;

        catalogRepo.recordPlay(song.id);

        log.debug('room %s round %d/%d: %s - %s [id=%d]',
            roomId, room.currentRound, room.totalRounds, song.artist, song.title, song.id);

        publishRound(room);
        io.to(roomId).emit('new_round', {
            roundNumber: room.currentRound,
            previewUrl: song.previewUrl,
            remainingMs: ROUND_DURATION_MS
        });

        // Timeout if no one guesses in 30s
        room.roundTimer = setTimeout(() => {
            if (!rooms[roomId] || room.gameId !== gameId) return;
            if (room.roundActive && room.currentSong === song) {
                room.roundActive = false;
                log.debug('room %s round %d timed out, nobody guessed "%s"',
                    roomId, room.currentRound, song.title);
                room.phase = 'ROUND_OVER';
                room.roundResult = { winner: null, song: publicSong(song) };
                room.phaseEndsAt = Date.now() + 5000;
                publishRound(room);
                io.to(roomId).emit('round_timeout', { song: publicSong(song) });
                setTimeout(() => {
                    startRound(roomId, gameId);
                }, 5000);
            }
        }, ROUND_DURATION_MS);
    }, 3000);
}

function endGame(roomId, gameId) {
    const room = rooms[roomId];
    if (!room || (gameId !== undefined && room.gameId !== gameId)) return;

    room.state = 'ENDED';
    room.roundActive = false;
    room.phase = 'ENDED';
    io.to(roomId).emit('game_over', room.players);

    // Reclaim the room if it is simply abandoned. The timer is cancelled when a
    // rematch starts: otherwise a long session would have its room deleted
    // mid-round, and every guard would then silently do nothing, freezing the
    // clients on the current round with no game_over and no error.
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => {
        io.to(roomId).emit('room_expired');
        deleteRoom(roomId);
        log.info('room %s cleaned up after being abandoned', roomId);
    }, 30 * 60 * 1000);
}

// checkAnswer function moved to utils/checkAnswer.js for better testability

catalogRepo.open();
const catalogStats = catalogRepo.stats();
log.info('catalog ready: %d songs (persistent=%s, played=%d, measured=%d)',
    catalogStats.total, catalogRepo.isPersistent(), catalogStats.played, catalogStats.measured);
log.debug('catalog by genre: %s',
    catalogStats.byGenre.map(g => g.value + '=' + g.n).join(' ') || 'empty');

// The machine is meant to sleep when nobody plays, so there is no periodic
// timer: every wake-up grows the catalog a little instead.
if (process.env.NODE_ENV !== 'test' && process.env.CATALOG_REFRESH_ENABLED !== 'false') {
    catalogScheduler.start();
}

// Fly stops the machine on every idle period and every deploy, so a clean
// shutdown is the normal path here, not an edge case: the WAL must be
// checkpointed or the last statistics are lost.
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('%s received, shutting down', signal);

    catalogScheduler.stop();

    // Close the database LAST. Round timers and in-flight guesses keep writing
    // statistics for as long as sockets are open, and writing to a closed
    // database throws — which would turn a clean stop into a crash.
    const finish = () => {
        catalogRepo.close();
        process.exit(0);
    };

    // io.close() disconnects every client and closes the HTTP server it was
    // attached to, so it replaces server.close() rather than preceding it.
    io.close(finish);
    // Do not wait forever on lingering websockets
    setTimeout(finish, 5000).unref();
}

// Last-resort checkpoint: whatever path the process leaves by, the WAL gets
// consolidated. close() is synchronous and idempotent, so this is safe here.
process.on('exit', () => catalogRepo.close());

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
    log.info('server listening on port %s (log level: %s)', PORT, currentLevel());
});
