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

module.exports = harness;
