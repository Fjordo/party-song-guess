const daily = require('../../services/catalogDaily');
const repo = require('../../services/catalogRepo');
const { GENRES } = require('../../utils/catalogTags');

const song = id => ({ provider: 'test', providerRef: String(id), title: `Song ${id}`, artist: `Artist ${id}`,
    previewUrl: `https://example.test/${id}`, genres: ['rock'], decades: [], languages: [], aiDifficulty: 'easy', origin: 'test' });
let deps;
let now;
beforeEach(() => {
    repo.open({ path: ':memory:', seedPath: null });
    now = Date.parse('2026-09-08T05:00:00Z');
    deps = { repo, now: () => now, sleep: jest.fn().mockResolvedValue(),
        ai: { getSongListFromAI: jest.fn().mockResolvedValue([{ artist: 'Artist', title: 'Title' }]),
            isQuotaError: error => error.status === 429 },
        music: { searchAndGetPreviewMany: jest.fn().mockResolvedValue([song(1)]) } };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { repo.close(); jest.restoreAllMocks(); });
const stock = (except = []) => {
    repo.upsertSongs(GENRES.filter(g => !except.includes(g)).map((genre, i) => ({ ...song(i + 100), genres: [genre] })));
};

test('fills only deficient genres and immediately stops when every target is met', async () => {
    stock(['rock']);
    const result = await daily.run({ target: 1, maxCalls: 20, deps });
    expect(result.outcome).toBe('complete');
    expect(result.calls).toBe(1);
    expect(result.genres.every(row => row.count >= 1)).toBe(true);
    expect(deps.ai.getSongListFromAI).toHaveBeenCalledWith(expect.objectContaining({ genres: ['rock'], count: 1 }));
    const again = await daily.run({ target: 1, deps });
    expect(again.outcome).toBe('complete');
    expect(again.calls).toBe(0);
});
test('bounds calls, rotates across deficient genres and passes exclusions', async () => {
    repo.upsertSongs([{ ...song(10), genres: GENRES }]);
    const result = await daily.run({ target: 200, maxCalls: 12, deps });
    expect(result.calls).toBe(12);
    const requests = deps.ai.getSongListFromAI.mock.calls.map(([request]) => request);
    expect(new Set(requests.slice(0, 11).map(r => r.genres[0])).size).toBe(11);
    expect(requests.every(request => request.exclude.some(s => s.title === 'Song 10'))).toBe(true);
    expect(deps.sleep).toHaveBeenCalledTimes(11);
});
test('quota stops the run, preserves inserted songs and resumes on the next day', async () => {
    deps.ai.getSongListFromAI.mockResolvedValueOnce([{ artist: 'A', title: 'T' }])
        .mockRejectedValueOnce(Object.assign(new Error('quota'), { status: 429 }));
    const first = await daily.run({ maxCalls: 20, deps });
    expect(first.outcome).toBe('quota');
    expect(first.calls).toBe(2);
    expect(repo.stats().total).toBe(1);
    expect((await daily.run({ deps })).outcome).toBe('already-ran');
    now += 86400000;
    expect((await daily.run({ maxCalls: 1, deps })).calls).toBe(1);
});
test('duplicate recommendations do not inflate counts or loop forever', async () => {
    stock(['rock']);
    repo.upsertSongs([song(1)]);
    const result = await daily.run({ target: 2, maxCalls: 3, deps });
    expect(result.outcome).toBe('budget');
    expect(result.calls).toBe(3);
    expect(repo.songsForGenre('rock')).toHaveLength(1);
});
test('daily lock prevents overlapping runs and releases on completion', async () => {
    let resolve;
    deps.ai.getSongListFromAI.mockImplementation(() => new Promise(r => { resolve = r; }));
    const running = daily.run({ maxCalls: 1, deps });
    expect((await daily.run({ deps })).outcome).toBe('busy');
    resolve([]);
    await running;
    expect(repo.getMeta('genre_topup_lease')).toBeNull();
});
test('expired leases are reclaimable and old owners cannot remove a new lease', () => {
    expect(repo.claimLease('test', 'old', now, 100)).toBe(true);
    expect(repo.claimLease('test', 'other', now, 100)).toBe(false);
    expect(repo.claimLease('test', 'new', now + 101, 100)).toBe(true);
    repo.releaseLease('test', 'old');
    expect(JSON.parse(repo.getMeta('test')).owner).toBe('new');
});
test('network errors fail visibly and release the lock', async () => {
    deps.ai.getSongListFromAI.mockRejectedValue(new Error('Network down'));
    expect((await daily.run({ deps })).outcome).toBe('error');
    expect(repo.getMeta('genre_topup_lease')).toBeNull();
});
test('time limit stops further calls', async () => {
    deps.music.searchAndGetPreviewMany.mockImplementation(async () => { now += daily.MAX_DURATION_MS; return []; });
    expect((await daily.run({ deps })).outcome).toBe('time-limit');
    expect(deps.ai.getSongListFromAI).toHaveBeenCalledTimes(1);
});
test('rejects invalid limits before making API calls', async () => {
    await expect(daily.run({ target: 0, deps })).rejects.toThrow('target');
    await expect(daily.run({ maxCalls: NaN, deps })).rejects.toThrow('maxCalls');
    expect(deps.ai.getSongListFromAI).not.toHaveBeenCalled();
});
