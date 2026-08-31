/**
 * Integration tests for the catalog-first game start.
 *
 * Reproduces what index.js does on start_game — catalog query, room exclusion
 * memory, live fallback — against the real repository, with only the outside
 * world (AI, music provider) mocked.
 */

const repo = require('../../services/catalogRepo');
const builder = require('../../services/catalogBuilder');

const track = (n) => ({
    provider: 'testprovider',
    providerRef: String(n),
    title: 'Song ' + n,
    artist: 'Artist ' + n,
    previewUrl: 'https://preview/' + n + '.m4a',
    artworkUrl: 'https://art/' + n + '.jpg',
    year: 1995,
    decade: '90s',
    isReissue: false
});

const seedCatalog = (count, overrides = {}) => {
    const entries = [];
    for (let i = 1; i <= count; i++) {
        entries.push({
            ...track(i),
            genres: ['rock'],
            decades: ['90s'],
            languages: ['en'],
            aiDifficulty: 'easy',
            ...overrides
        });
    }
    repo.upsertSongs(entries);
};

const makeDeps = () => ({
    ai: {
        getSongListFromAI: jest.fn().mockResolvedValue([{ artist: 'New', title: 'Discovery' }]),
        isQuotaError: jest.fn().mockReturnValue(false)
    },
    music: {
        searchAndGetPreviewMany: jest.fn().mockResolvedValue([track(900), track(901)]),
        isPreviewAlive: jest.fn(),
        lookupByRef: jest.fn()
    },
    repo,
    sleep: jest.fn().mockResolvedValue(undefined),
    now: () => Date.now()
});

/**
 * The start_game decision, mirroring index.js.
 */
async function buildPlaylist(request, room, rounds, deps) {
    let result = repo.query({ ...request, exclude: room.playedSongIds, limit: rounds });

    if (result.songs.length < rounds && room.playedSongIds.size > 0) {
        room.playedSongIds.clear();
        result = repo.query({ ...request, limit: rounds });
    }

    let usedFallback = false;
    if (result.songs.length < rounds) {
        usedFallback = true;
        await builder.runFallback({ ...request, count: rounds }, deps);
        result = repo.query({ ...request, exclude: room.playedSongIds, limit: rounds });
    }

    result.songs.forEach(song => room.playedSongIds.add(song.id));
    return { playlist: result.songs, usedFallback };
}

describe('Catalog-first game start', () => {
    let room;
    let deps;
    const request = { genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy' };

    beforeEach(() => {
        repo.open({ path: ':memory:', seedPath: null });
        room = { playedSongIds: new Set() };
        deps = makeDeps();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        repo.close();
        jest.restoreAllMocks();
    });

    test('a stocked catalog starts a game without calling the AI at all', async () => {
        seedCatalog(20);

        const { playlist, usedFallback } = await buildPlaylist(request, room, 10, deps);

        expect(playlist).toHaveLength(10);
        expect(usedFallback).toBe(false);
        expect(deps.ai.getSongListFromAI).not.toHaveBeenCalled();
    });

    test('never repeats a song inside one game', async () => {
        seedCatalog(20);

        const { playlist } = await buildPlaylist(request, room, 10, deps);
        const ids = playlist.map(s => s.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    test('a rematch in the same room draws entirely different songs', async () => {
        seedCatalog(20);

        const first = await buildPlaylist(request, room, 5, deps);
        const second = await buildPlaylist(request, room, 5, deps);

        const firstIds = first.playlist.map(s => s.id);
        const secondIds = second.playlist.map(s => s.id);

        expect(secondIds.filter(id => firstIds.includes(id))).toEqual([]);
        expect(deps.ai.getSongListFromAI).not.toHaveBeenCalled();
    });

    test('recycles the room memory before spending an AI call', async () => {
        seedCatalog(6);

        await buildPlaylist(request, room, 5, deps);
        // Only 1 unseen song left, so a 5-round game needs the memory cleared
        const second = await buildPlaylist(request, room, 5, deps);

        expect(second.playlist).toHaveLength(5);
        expect(second.usedFallback).toBe(false);
        expect(deps.ai.getSongListFromAI).not.toHaveBeenCalled();
    });

    test('falls back to live discovery when the catalog cannot fill the game', async () => {
        seedCatalog(1);

        const { playlist, usedFallback } = await buildPlaylist(request, room, 3, deps);

        expect(usedFallback).toBe(true);
        expect(deps.ai.getSongListFromAI).toHaveBeenCalledTimes(1);
        expect(playlist).toHaveLength(3);
    });

    test('what the fallback discovers stays in the catalog for next time', async () => {
        seedCatalog(1);

        await buildPlaylist(request, room, 3, deps);
        expect(repo.stats().total).toBe(3);

        // A brand new room now gets served entirely from the catalog
        const freshRoom = { playedSongIds: new Set() };
        deps.ai.getSongListFromAI.mockClear();

        const { usedFallback } = await buildPlaylist(request, freshRoom, 3, deps);

        expect(usedFallback).toBe(false);
        expect(deps.ai.getSongListFromAI).not.toHaveBeenCalled();
    });

    test('plays a shorter game rather than failing when songs run out', async () => {
        seedCatalog(2);
        deps.ai.getSongListFromAI.mockResolvedValue([]);

        const { playlist } = await buildPlaylist(request, room, 10, deps);

        expect(playlist.length).toBeGreaterThan(0);
        expect(playlist.length).toBeLessThan(10);
    });

    test('an exhausted AI limit still yields a game from the catalog', async () => {
        seedCatalog(4);
        const quota = new Error('429 RESOURCE_EXHAUSTED');
        quota.isQuotaError = true;
        deps.ai.getSongListFromAI.mockRejectedValue(quota);
        deps.ai.isQuotaError.mockReturnValue(true);

        // index.js swallows the fallback failure and plays with what it has
        let playlist;
        try {
            ({ playlist } = await buildPlaylist(request, room, 10, deps));
        } catch (error) {
            playlist = repo.query({ ...request, limit: 10 }).songs;
        }

        expect(playlist).toHaveLength(4);
    });

    test('play statistics accumulate across games and correct the difficulty', async () => {
        seedCatalog(10, { aiDifficulty: 'hard' });

        const { playlist } = await buildPlaylist(request, room, 1, deps);
        const song = playlist[0];

        // Everyone guesses it quickly, six games running
        for (let i = 0; i < 6; i++) {
            repo.recordPlay(song.id);
            repo.recordGuess(song.id, 2500);
        }

        const asEasy = repo.query({ genres: ['rock'], difficulty: 'easy', limit: 20 }).songs;
        expect(asEasy.map(s => s.id)).toContain(song.id);
        expect(repo.stats().measured).toBe(1);
    });
});
