const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Execute the real socket handlers and game loop with deterministic timers and catalog.
function harness() {
    const events = [];
    let connect;
    const io = { on: (_event, fn) => { connect = fn; }, to: roomId => ({
        emit: (event, data) => events.push({ roomId, event, data: structuredClone(data) })
    }) };
    const songs = [1, 2, 3].map(id => ({ id, title: `Song ${id}`, artist: 'Artist', previewUrl: `/${id}` }));
    const repo = { open: jest.fn(), close: jest.fn(), stats: () => ({ byGenre: [] }),
        isPersistent: () => false, query: jest.fn(() => ({ songs, relaxedTo: 'exact' })),
        recordPlay: jest.fn(), recordGuess: jest.fn() };
    const builder = { runFallback: jest.fn() };
    const logger = { debug() {}, info() {}, warn() {}, error() {}, isDebug: () => false };
    const dependencies = {
        dotenv: { config() {} }, express: () => ({ use() {}, get() {} }),
        http: { createServer: () => ({ listen() {} }) },
        'socket.io': { Server: function () { return io; } },
        cors: () => {}, helmet: () => {},
        './services/catalogRepo': repo, './services/catalogBuilder': builder,
        './services/catalogScheduler': {},
        './utils/logger': { createLogger: () => logger, currentLevel: () => 'info' }
    };
    const serverDir = path.resolve(__dirname, '../..');
    const context = vm.createContext({
        require: name => dependencies[name] || require(name.startsWith('.') ? path.join(serverDir, name) : name),
        process: { env: { GEMINI_API_KEY: 'test', NODE_ENV: 'test' }, on() {} },
        console, setTimeout, clearTimeout, Date
    });
    vm.runInContext(fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8'), context);
    function client(id) {
        const handlers = {};
        const socket = { id, on: (event, fn) => { handlers[event] = fn; },
            emit: (event, data) => events.push({ clientId: id, event, data: structuredClone(data) }),
            join: jest.fn(), leave: jest.fn() };
        connect(socket);
        return { ...socket, send: (event, data) => handlers[event](data) };
    }
    const alice = client('alice');
    alice.send('create_room', { playerName: 'Alice' });
    const roomId = events.find(e => e.event === 'room_created').data.id;
    return { alice, client, roomId, events, repo, builder,
        start: (rounds = 3) => alice.send('start_game', { roomId, genres: ['rock'], rounds }),
        room: () => vm.runInContext(`rooms['${roomId}']`, context) };
}

describe('Skip song independently', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    test('reveals without points, ignores duplicate/stale skips, and ends the last round', async () => {
        const h = harness();
        await h.start();
        jest.advanceTimersByTime(4000);
        const skip = () => h.alice.send('skip_song', { roomId: h.roomId, roundNumber: 1 });
        skip(); skip();
        expect(h.events.filter(e => e.event === 'round_skipped')).toHaveLength(1);
        expect(h.room().players[0].score).toBe(0);
        expect(h.repo.recordGuess).not.toHaveBeenCalled();
        jest.advanceTimersByTime(8000);
        skip();
        expect(h.room().currentRound).toBe(2);
        expect(h.room().roundActive).toBe(true);
        h.alice.send('skip_song', { roomId: h.roomId, roundNumber: 2 });
        jest.advanceTimersByTime(8000);
        h.alice.send('skip_song', { roomId: h.roomId, roundNumber: 3 });
        jest.advanceTimersByTime(35000);
        expect(h.events.filter(e => e.event === 'game_over')).toHaveLength(1);
        expect(h.events.filter(e => e.event === 'round_timeout')).toHaveLength(0);
    });
    test('rejects outsiders, multiplayer skips and countdown skips', async () => {
        const h = harness();
        const bob = h.client('bob');
        await h.start();
        h.alice.send('skip_song', { roomId: h.roomId, roundNumber: 0 });
        jest.advanceTimersByTime(4000);
        bob.send('skip_song', { roomId: h.roomId, roundNumber: 1 });
        expect(h.room().roundActive).toBe(true);
        h.room().players.push({ id: 'bob', score: 0 });
        h.alice.send('skip_song', { roomId: h.roomId, roundNumber: 1 });
        expect(h.events.some(e => e.event === 'round_skipped')).toBe(false);
    });
});

describe('Leave game independently', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    test.each([0, 1000, 4000])('last player can leave at %dms without subsequent rounds', async elapsed => {
        const h = harness();
        await h.start();
        jest.advanceTimersByTime(elapsed);
        h.alice.send('leave_game', { roomId: h.roomId });
        const count = h.events.length;
        jest.advanceTimersByTime(60000);
        expect(h.room()).toBeUndefined();
        expect(h.events).toHaveLength(count);
        expect(h.alice.leave).toHaveBeenCalledWith(h.roomId);
        expect(h.events.at(-1).event).toBe('game_left');
        h.alice.send('create_room', { playerName: 'Alice' });
        expect(h.events.at(-1).event).toBe('room_created');
    });
    test('host leaves, remaining player continues and departed guesses have no effect', async () => {
        const h = harness();
        const bob = h.client('bob');
        bob.send('join_room', { roomId: h.roomId, playerName: 'Bob' });
        await h.start();
        jest.advanceTimersByTime(4000);
        h.alice.send('leave_game', { roomId: h.roomId });
        h.alice.send('submit_guess', { roomId: h.roomId, guess: 'Song 1' });
        expect(h.room().roundActive).toBe(true);
        expect(h.room().players.map(p => p.id)).toEqual(['bob']);
        bob.send('submit_guess', { roomId: h.roomId, guess: 'Song 1' });
        expect(h.room().players[0].score).toBe(1);
        jest.advanceTimersByTime(8000);
        expect(h.room().currentRound).toBe(2);
    });
    test('leaving during live discovery cannot resurrect an empty room', async () => {
        const h = harness();
        h.repo.query.mockReturnValue({ songs: [] });
        let resolve;
        h.builder.runFallback.mockImplementation(() => new Promise(r => { resolve = r; }));
        const starting = h.start();
        h.alice.send('leave_game', { roomId: h.roomId });
        resolve();
        await starting;
        jest.advanceTimersByTime(60000);
        expect(h.room()).toBeUndefined();
        expect(h.events.some(e => e.event === 'game_started')).toBe(false);
    });
});
