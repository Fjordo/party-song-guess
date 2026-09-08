const harness = require('../fixtures/serverHarness');
const sessionFor = (h, clientId = 'alice') => h.events.find(e => e.clientId === clientId && e.event === 'session_created').data;
const resumed = (h, id) => h.events.filter(e => e.clientId === id && e.event === 'room_resumed').at(-1)?.data;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('Reconnect and server round clock', () => {
    test('recovers name, score, active preview and remaining time without leaking answers', async () => {
        const h = harness();
        await h.start();
        jest.advanceTimersByTime(4000);
        h.alice.send('submit_guess', { roomId: h.roomId, guess: 'Song 1' });
        jest.advanceTimersByTime(8000);
        h.alice.send('disconnect', 'transport close');
        jest.advanceTimersByTime(7000);
        const a = h.client('alice-new');
        a.send('resume_room', sessionFor(h));
        const state = resumed(h, a.id);
        expect(state.players).toEqual([{ id: a.id, name: 'Alice', score: 1, connected: true }]);
        expect(state.round).toMatchObject({ phase: 'PLAYING', roundNumber: 2, remainingMs: 23000, elapsedMs: 7000 });
        expect(state.round.previewUrl).toBe('/2');
        expect(JSON.stringify(state)).not.toMatch(/Song 2|Song 3|token|playedSongIds|roundTimer/);
        expect(h.repo.recordPlay).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(23000);
        expect(h.room().phase).toBe('ROUND_OVER');
    });
    test.each([0, 2000, 35000, 54000])('restores the actual phase at %dms', async elapsed => {
        const h = harness();
        await h.start();
        h.alice.send('disconnect', 'transport close');
        jest.advanceTimersByTime(elapsed);
        const a = h.client('returning');
        a.send('resume_room', sessionFor(h));
        const state = resumed(h, a.id);
        expect(state.state).toBe(h.room().state);
        expect(state.round.phase).toBe(h.room().phase || 'WAITING');
        if (state.round.phase !== 'PLAYING') expect(state.round.previewUrl).toBeUndefined();
        if (state.round.phase === 'ROUND_OVER') expect(state.round.result.song.title).toBeTruthy();
    });
    test('recovers the lobby and cancels pending seat expiration', () => {
        const h = harness();
        h.alice.send('disconnect', 'transport close');
        jest.advanceTimersByTime(59000);
        const a = h.client('returning');
        a.send('resume_room', sessionFor(h));
        jest.advanceTimersByTime(2000);
        expect(h.room().players[0].id).toBe(a.id);
        expect(resumed(h, a.id).state).toBe('LOBBY');
    });
    test('recovers the final scoreboard within the grace period', async () => {
        const h = harness();
        await h.start();
        jest.advanceTimersByTime(115000);
        expect(h.room().state).toBe('ENDED');
        h.alice.send('disconnect', 'transport close');
        jest.advanceTimersByTime(59000);
        const a = h.client('returning');
        a.send('resume_room', sessionFor(h));
        expect(resumed(h, a.id).state).toBe('ENDED');
        expect(resumed(h, a.id).players[0].name).toBe('Alice');
    });
    test('expires the last disconnected player after one minute', () => {
        const h = harness();
        h.alice.send('disconnect', 'transport close');
        jest.advanceTimersByTime(60000);
        expect(h.room()).toBeUndefined();
        const a = h.client('late');
        a.send('resume_room', sessionFor(h));
        expect(h.events.at(-1).event).toBe('resume_failed');
    });
    test('invalid tokens cannot claim seats and explicit leave invalidates the token', () => {
        const h = harness();
        const a = h.client('outsider');
        a.send('resume_room', { roomId: h.roomId, token: 'invalid' });
        expect(h.events.at(-1).event).toBe('resume_failed');
        h.alice.send('leave_game', { roomId: h.roomId });
        a.send('resume_room', sessionFor(h));
        expect(h.events.at(-1).event).toBe('resume_failed');
    });
    test('a refresh transfers an active seat and old transport cannot disrupt it', async () => {
        const h = harness();
        await h.start();
        jest.advanceTimersByTime(4000);
        const a = h.client('refreshed');
        a.send('resume_room', sessionFor(h));
        expect(h.alice.leave).toHaveBeenCalledWith(h.roomId);
        h.alice.send('submit_guess', { roomId: h.roomId, guess: 'Song 1' });
        h.alice.send('disconnect', 'transport close');
        expect(h.room().roundActive).toBe(true);
        expect(h.room().players).toHaveLength(1);
        expect(h.room().players[0].connected).toBe(true);
        a.send('submit_guess', { roomId: h.roomId, guess: 'Song 1' });
        expect(h.room().players[0].score).toBe(1);
    });
    test('resync provides time left without restarting the round or recording another play', async () => {
        const h = harness();
        await h.start();
        jest.advanceTimersByTime(14000);
        h.alice.send('get_room_state', { roomId: h.roomId });
        expect(resumed(h, 'alice').round.remainingMs).toBe(20000);
        expect(h.repo.recordPlay).toHaveBeenCalledTimes(1);
    });
});

describe('Rematch', () => {
    const finish = async h => {
        await h.start();
        jest.advanceTimersByTime(4000);
        for (let round = 1; round <= 3; round++) {
            h.alice.send('submit_guess', { roomId: h.roomId, guess: `Song ${round}` });
            jest.advanceTimersByTime(round === 3 ? 5000 : 8000);
        }
        expect(h.room().state).toBe('ENDED');
    };
    test('preserves room, players, settings and song history while resetting scores', async () => {
        const h = harness();
        await finish(h);
        const settings = { ...h.room().settings };
        const previousIds = new Set(h.room().playedSongIds);
        h.repo.query.mockImplementation(request => {
            expect([...request.exclude]).toEqual([...previousIds]);
            return { songs: [4,5,6].map(id => ({ id, title: `Fresh ${id}`, previewUrl: `/${id}` })) };
        });
        await h.alice.send('rematch', { roomId: h.roomId });
        expect(h.room().id).toBe(h.roomId);
        expect(h.room().settings).toEqual(settings);
        expect(h.room().players[0].score).toBe(0);
        expect(h.room().currentRound).toBe(0);
        expect(h.room().gameId).toBe(2);
        jest.advanceTimersByTime(4000);
        expect(h.room().currentSong.id).toBe(4);
        const starts = h.events.filter(e => e.event === 'game_started');
        expect(starts).toHaveLength(2);
        expect(starts[1].data.players[0].score).toBe(0);
    });
    test('only a connected host can start, duplicate and mid-game starts are ignored', async () => {
        const h = harness();
        const b = h.client('bob');
        b.send('join_room', { roomId: h.roomId, playerName: 'Bob' });
        await finish(h);
        await b.send('rematch', { roomId: h.roomId });
        expect(h.room().state).toBe('ENDED');
        await h.alice.send('rematch', { roomId: h.roomId });
        await h.alice.send('rematch', { roomId: h.roomId });
        await h.start();
        expect(h.events.filter(e => e.event === 'game_started')).toHaveLength(2);
    });
    test('a connected player can host a rematch while the former host reconnects', async () => {
        const h = harness();
        const b = h.client('bob');
        b.send('join_room', { roomId: h.roomId, playerName: 'Bob' });
        await finish(h);
        h.alice.send('disconnect', 'transport close');
        await b.send('rematch', { roomId: h.roomId });
        expect(h.room().gameId).toBe(2);
        const a = h.client('returned');
        a.send('resume_room', sessionFor(h));
        expect(resumed(h, a.id).players.every(player => player.score === 0)).toBe(true);
    });
    test('failed rematch loading restores the lobby and saved settings', async () => {
        const h = harness();
        await finish(h);
        h.repo.query.mockReturnValue({ songs: [] });
        h.builder.runFallback.mockResolvedValue();
        await h.alice.send('rematch', { roomId: h.roomId });
        expect(h.room().state).toBe('LOBBY');
        expect(h.events.filter(e => e.event === 'room_resumed').at(-1).data.settings.genres).toEqual(['rock']);
    });
});
