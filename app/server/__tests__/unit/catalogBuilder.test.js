/**
 * Unit tests for catalogBuilder - incremental catalog growth and upkeep
 *
 * The AI and the music provider are mocked; the repository is the real
 * in-memory one, so merging and tagging are exercised for real.
 */

const builder = require('../../services/catalogBuilder');
const repo = require('../../services/catalogRepo');
const { setLevel } = require('../../utils/logger');
const { format } = require('util');

const track = (n) => ({
    provider: 'testprovider',
    providerRef: String(n),
    title: 'Title ' + n,
    artist: 'Artist ' + n,
    previewUrl: 'https://preview/' + n + '.m4a',
    artworkUrl: 'https://art/' + n + '.jpg',
    year: 1995,
    decade: '90s',
    isReissue: false
});

const makeDeps = (overrides = {}) => ({
    ai: {
        getSongListFromAI: jest.fn().mockResolvedValue([{ artist: 'A', title: 'T' }]),
        isQuotaError: jest.fn().mockReturnValue(false)
    },
    music: {
        searchAndGetPreviewMany: jest.fn().mockResolvedValue([track(1)]),
        isPreviewAlive: jest.fn().mockResolvedValue(true),
        lookupByRef: jest.fn().mockResolvedValue(null)
    },
    repo,
    sleep: jest.fn().mockResolvedValue(undefined),
    now: () => Date.parse('2026-08-31T12:00:00Z'),
    ...overrides
});

const quotaError = () => {
    const error = new Error('429 RESOURCE_EXHAUSTED');
    error.isQuotaError = true;
    return error;
};

describe('catalogBuilder', () => {
    beforeEach(() => {
        repo.open({ path: ':memory:', seedPath: null });
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        repo.close();
        setLevel('info');
        jest.restoreAllMocks();
    });

    describe('allBucketKeys()', () => {
        test('covers every genre, decade, difficulty and language combination', () => {
            const keys = builder.allBucketKeys();
            // 11 genres x (8 decades + any) x 2 difficulties x (3 languages + any)
            expect(keys).toHaveLength(11 * 9 * 2 * 4);
            expect(new Set(keys).size).toBe(keys.length);
        });
    });

    describe('pickBuckets()', () => {
        test('returns the requested number of distinct buckets', () => {
            const picked = builder.pickBuckets(4, makeDeps());
            expect(picked).toHaveLength(4);
            expect(new Set(picked.map(b => b.key)).size).toBe(4);
        });

        test('spreads a fresh catalog across genres instead of one alphabetical corner', () => {
            const deps = makeDeps();
            const genres = new Set();
            for (let run = 0; run < 4; run++) {
                builder.pickBuckets(4, deps).forEach(b => genres.add(b.genre));
            }
            expect(genres.size).toBeGreaterThan(2);
        });

        test('advances the cursor so successive runs pick different buckets', () => {
            const deps = makeDeps();
            const first = builder.pickBuckets(4, deps).map(b => b.key);
            const second = builder.pickBuckets(4, deps).map(b => b.key);
            expect(second).not.toEqual(first);
            expect(repo.getCursor()).toBe(8);
        });

        test('deprioritises buckets that keep coming back empty', () => {
            const deps = makeDeps();
            const target = builder.pickBuckets(1, deps)[0].key;

            // Three barren runs on that bucket
            for (let i = 0; i < 3; i++) repo.recordBucketRun(target, { found: 5, added: 0 });
            repo.setCursor(0);

            const ranked = builder.pickBuckets(20, deps).map(b => b.key);
            expect(ranked).not.toContain(target);
        });

        test('deprioritises buckets that are already well covered', () => {
            const deps = makeDeps();
            const target = builder.pickBuckets(1, deps)[0].key;

            repo.recordBucketRun(target, { found: 40, added: 40 });
            repo.setCursor(0);

            const ranked = builder.pickBuckets(20, deps).map(b => b.key);
            expect(ranked).not.toContain(target);
        });

        test('parses each key back into its parts', () => {
            const picked = builder.pickBuckets(1, makeDeps())[0];
            expect(picked).toHaveProperty('genre');
            expect(picked).toHaveProperty('difficulty');
            expect(['easy', 'hard']).toContain(picked.difficulty);
        });

        test('works on the real repository and clock when nothing is injected', () => {
            const picked = builder.pickBuckets(2);
            expect(picked).toHaveLength(2);
        });
    });

    describe('debug logging', () => {
        test('the debug trace of bucket selection does not throw and reports scores', () => {
            setLevel('debug');
            const logged = jest.spyOn(console, 'log').mockImplementation(() => {});

            expect(() => builder.pickBuckets(3, makeDeps())).not.toThrow();

            // console applies util.format to the placeholders; the jest mock
            // captures the raw arguments, so reproduce the real output here
            const output = logged.mock.calls.map(call => format(...call)).join('\n');
            expect(output).toContain('picked 3 bucket(s)');
            expect(output).toMatch(/score=\d/);
        });
    });

    describe('defaultSleep()', () => {
        test('resolves after the requested delay', async () => {
            const started = Date.now();
            await builder.defaultSleep(20);
            expect(Date.now() - started).toBeGreaterThanOrEqual(15);
        });
    });

    describe('toEntries()', () => {
        test('tags with the bucket that discovered the song', () => {
            const [entry] = builder.toEntries([track(1)], {
                genre: 'rock', decade: '80s', language: 'en', difficulty: 'hard'
            }, 'builder');

            expect(entry.genres).toEqual(['rock']);
            expect(entry.languages).toEqual(['en']);
            expect(entry.aiDifficulty).toBe('hard');
            expect(entry.origin).toBe('builder');
        });

        test('also trusts the release decade when the album is not a reissue', () => {
            const [entry] = builder.toEntries([track(1)], {
                genre: 'rock', decade: '80s', language: null, difficulty: 'easy'
            }, 'builder');
            // bucket says 80s, the record itself says 90s
            expect(entry.decades.sort()).toEqual(['80s', '90s']);
        });

        test('ignores the release decade of a reissue', () => {
            const reissue = { ...track(1), decade: '2000s', isReissue: true };
            const [entry] = builder.toEntries([reissue], {
                genre: 'rock', decade: '60s', language: null, difficulty: 'easy'
            }, 'builder');

            expect(entry.decades).toEqual(['60s']);
        });

        test('leaves the decade unknown when neither source is trustworthy', () => {
            const undated = { ...track(1), decade: null };
            const [entry] = builder.toEntries([undated], {
                genre: 'rock', decade: null, language: null, difficulty: 'easy'
            }, 'builder');

            expect(entry.decades).toEqual([]);
        });
    });

    describe('runRefresh()', () => {
        test('never makes more calls than allowed', async () => {
            const deps = makeDeps();
            const result = await builder.runRefresh({ maxCalls: 3, deps });

            expect(deps.ai.getSongListFromAI).toHaveBeenCalledTimes(3);
            expect(result.calls).toBe(3);
            expect(result.outcome).toBe('ok');
        });

        test('spaces out the calls but does not delay the first one', async () => {
            const deps = makeDeps();
            await builder.runRefresh({ maxCalls: 3, deps });

            expect(deps.sleep).toHaveBeenCalledTimes(2);
            expect(deps.sleep).toHaveBeenCalledWith(15000);
        });

        test('merges what it finds into the catalog', async () => {
            const deps = makeDeps();
            deps.music.searchAndGetPreviewMany.mockResolvedValue([track(1), track(2), null]);

            const result = await builder.runRefresh({ maxCalls: 1, deps });

            expect(result.added).toBe(2);
            expect(repo.stats().total).toBe(2);
        });

        test('stops at the usage limit and keeps what earlier buckets found', async () => {
            const deps = makeDeps();
            deps.ai.isQuotaError.mockImplementation(err => err.isQuotaError === true);
            deps.ai.getSongListFromAI
                .mockResolvedValueOnce([{ artist: 'A', title: 'T' }])
                .mockRejectedValueOnce(quotaError());

            const result = await builder.runRefresh({ maxCalls: 4, deps });

            expect(result.outcome).toBe('quota');
            expect(result.calls).toBe(2);
            // The third and fourth buckets were never attempted
            expect(deps.ai.getSongListFromAI).toHaveBeenCalledTimes(2);
            // ...and the song from the first bucket is safe
            expect(repo.stats().total).toBe(1);
            expect(repo.getMeta('last_run_outcome')).toBe('quota');
        });

        test('an ordinary failure does not stop the run', async () => {
            const deps = makeDeps();
            deps.ai.getSongListFromAI
                .mockRejectedValueOnce(new Error('network blip'))
                .mockResolvedValue([{ artist: 'A', title: 'T' }]);

            const result = await builder.runRefresh({ maxCalls: 3, deps });

            expect(deps.ai.getSongListFromAI).toHaveBeenCalledTimes(3);
            expect(result.outcome).toBe('ok');
            expect(repo.stats().total).toBe(1);
        });

        test('reports an error outcome when every bucket fails', async () => {
            const deps = makeDeps();
            deps.ai.getSongListFromAI.mockRejectedValue(new Error('down'));

            const result = await builder.runRefresh({ maxCalls: 2, deps });

            expect(result.outcome).toBe('error');
            expect(repo.getMeta('last_run_outcome')).toBe('error');
        });

        test('an empty AI answer counts as a barren bucket, without a lookup', async () => {
            const deps = makeDeps();
            deps.ai.getSongListFromAI.mockResolvedValue([]);

            await builder.runRefresh({ maxCalls: 1, deps });

            expect(deps.music.searchAndGetPreviewMany).not.toHaveBeenCalled();
            expect(repo.getAllBuckets()[0].empty_streak).toBe(1);
        });

        test('records a barren bucket when nothing resolves to a playable track', async () => {
            const deps = makeDeps();
            deps.music.searchAndGetPreviewMany.mockResolvedValue([null, null]);

            await builder.runRefresh({ maxCalls: 1, deps });

            expect(repo.stats().total).toBe(0);
            expect(repo.getAllBuckets()[0].empty_streak).toBe(1);
        });

        test('asks the provider politely, not all at once', async () => {
            const deps = makeDeps();
            await builder.runRefresh({ maxCalls: 1, deps });

            expect(deps.music.searchAndGetPreviewMany).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({ concurrency: 3, minIntervalMs: 200 })
            );
        });
    });

    describe('runRevalidation()', () => {
        beforeEach(() => {
            repo.upsertSongs([{
                ...track(1), genres: ['rock'], decades: ['90s'], languages: ['en'], aiDifficulty: 'easy'
            }]);
        });

        test('marks a working preview as verified', async () => {
            const deps = makeDeps();
            const result = await builder.runRevalidation({ max: 10, deps });

            expect(result.checked).toBe(1);
            expect(result.dead).toBe(0);
            expect(repo.oldestUnverified(1)[0]).toBeDefined();
            expect(repo.stats().total).toBe(1);
        });

        test('repairs a rotated URL instead of evicting the song', async () => {
            const deps = makeDeps();
            deps.music.isPreviewAlive.mockResolvedValue(false);
            deps.music.lookupByRef.mockResolvedValue({ ...track(1), previewUrl: 'https://fresh.m4a' });

            const result = await builder.runRevalidation({ max: 10, deps });

            expect(result.repaired).toBe(1);
            expect(result.dead).toBe(0);
            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].previewUrl).toBe('https://fresh.m4a');
        });

        test('only marks a song dead when it cannot be re-resolved', async () => {
            const deps = makeDeps();
            deps.music.isPreviewAlive.mockResolvedValue(false);
            deps.music.lookupByRef.mockResolvedValue(null);

            const result = await builder.runRevalidation({ max: 10, deps });

            expect(result.dead).toBe(1);
            // One failure is not enough to evict
            expect(repo.stats().total).toBe(1);
        });

        test('evicts only after repeated confirmed failures', async () => {
            const deps = makeDeps();
            deps.music.isPreviewAlive.mockResolvedValue(false);
            deps.music.lookupByRef.mockResolvedValue(null);

            await builder.runRevalidation({ max: 10, deps });
            await builder.runRevalidation({ max: 10, deps });
            expect(repo.stats().total).toBe(1);

            const third = await builder.runRevalidation({ max: 10, deps });
            expect(third.removed).toBe(1);
            expect(repo.stats().total).toBe(0);
        });

        test('a transient network failure yields no verdict at all', async () => {
            const deps = makeDeps();
            deps.music.isPreviewAlive.mockResolvedValue(null);

            const result = await builder.runRevalidation({ max: 10, deps });

            expect(result.dead).toBe(0);
            expect(result.repaired).toBe(0);
            expect(deps.music.lookupByRef).not.toHaveBeenCalled();
            expect(repo.stats().total).toBe(1);
        });
    });

    describe('runFallback()', () => {
        const request = {
            genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', count: 10
        };

        test('merges live discoveries into the catalog', async () => {
            const deps = makeDeps();
            deps.music.searchAndGetPreviewMany.mockResolvedValue([track(1), track(2)]);

            const result = await builder.runFallback(request, deps);

            expect(result.added).toBe(2);
            expect(repo.query({ genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', limit: 5 }).songs)
                .toHaveLength(2);
        });

        test('tags the songs under every requested genre', async () => {
            const deps = makeDeps();
            deps.music.searchAndGetPreviewMany.mockResolvedValue([track(1)]);

            await builder.runFallback({ ...request, genres: ['rock', 'indie'] }, deps);

            expect(repo.stats().total).toBe(1);
            expect(repo.query({ genres: ['indie'], limit: 5 }).songs).toHaveLength(1);
        });

        test('prioritises speed over politeness, since a host is waiting', async () => {
            const deps = makeDeps();
            await builder.runFallback(request, deps);

            expect(deps.music.searchAndGetPreviewMany).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({ concurrency: 5, minIntervalMs: 0 })
            );
        });

        test('copes with the AI returning nothing', async () => {
            const deps = makeDeps();
            deps.ai.getSongListFromAI.mockResolvedValue([]);

            await expect(builder.runFallback(request, deps)).resolves.toEqual({ added: 0, updated: 0 });
            expect(deps.music.searchAndGetPreviewMany).not.toHaveBeenCalled();
        });

        test('copes with nothing resolving to a playable track', async () => {
            const deps = makeDeps();
            deps.music.searchAndGetPreviewMany.mockResolvedValue([null, null]);

            await expect(builder.runFallback(request, deps)).resolves.toEqual({ added: 0, updated: 0 });
        });

        test('propagates a quota error so the caller can fall back to the catalog', async () => {
            const deps = makeDeps();
            deps.ai.getSongListFromAI.mockRejectedValue(quotaError());

            await expect(builder.runFallback(request, deps)).rejects.toMatchObject({ isQuotaError: true });
        });
    });
});
