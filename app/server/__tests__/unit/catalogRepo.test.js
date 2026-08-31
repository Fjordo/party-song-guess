/**
 * Unit tests for catalogRepo - persistent song catalog
 *
 * Runs against a real in-memory SQLite database rather than a mocked
 * filesystem: it is faster than faking fs and actually exercises the SQL,
 * which is where most of the behaviour lives.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = require('../../services/catalogRepo');
const { setLevel } = require('../../utils/logger');
const { format } = require('util');

const song = (overrides = {}) => ({
    provider: 'testprovider',
    providerRef: '1',
    title: 'Wonderwall',
    artist: 'Oasis',
    previewUrl: 'https://preview/1.m4a',
    artworkUrl: 'https://art/1.jpg',
    year: 1995,
    decade: '90s',
    genres: ['rock'],
    decades: ['90s'],
    languages: ['en'],
    aiDifficulty: 'easy',
    ...overrides
});

const openMemory = () => repo.open({ path: ':memory:', seedPath: null });

describe('catalogRepo', () => {
    afterEach(() => {
        repo.close();
        setLevel('info');
        jest.restoreAllMocks();
    });

    describe('open() and close()', () => {
        test('opens an in-memory catalog that is not persistent', () => {
            openMemory();
            expect(repo.isPersistent()).toBe(false);
            expect(repo.stats().total).toBe(0);
        });

        test('opening twice is a no-op', () => {
            openMemory();
            repo.upsertSongs([song()]);
            repo.open({ path: ':memory:', seedPath: null });
            expect(repo.stats().total).toBe(1);
        });

        test('closing twice is safe', () => {
            openMemory();
            repo.close();
            expect(() => repo.close()).not.toThrow();
        });

        test('creates the directory and reports a file-backed catalog as persistent', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'));
            const dbPath = path.join(dir, 'nested', 'catalog.db');

            repo.open({ path: dbPath, seedPath: null });

            expect(repo.isPersistent()).toBe(true);
            expect(fs.existsSync(dbPath)).toBe(true);

            repo.close();
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('degrades to memory when the database file is corrupt', () => {
            // The realistic case: the machine was killed mid-write. Opening is
            // lazy, so this only surfaces on the first pragma/statement — it
            // must not escape open() and crash-loop the server on boot.
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-corrupt-'));
            const dbPath = path.join(dir, 'catalog.db');

            const valid = new (require('better-sqlite3'))(dbPath);
            valid.exec('CREATE TABLE filler (a TEXT)');
            for (let i = 0; i < 200; i++) valid.prepare('INSERT INTO filler VALUES (?)').run('x'.repeat(200));
            valid.close();

            const bytes = fs.readFileSync(dbPath);
            fs.writeFileSync(dbPath, bytes.subarray(0, Math.floor(bytes.length / 2)));

            jest.spyOn(console, 'error').mockImplementation(() => {});

            expect(() => repo.open({ path: dbPath, seedPath: null })).not.toThrow();
            expect(repo.isPersistent()).toBe(false);
            // The game still works, just without persistence
            expect(repo.upsertSongs([song()])).toEqual({ added: 1, updated: 0 });

            repo.close();
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('degrades to memory when the volume is unavailable', () => {
            // A read-only or missing volume must never take the game down
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                const error = new Error('EACCES: permission denied');
                throw error;
            });
            jest.spyOn(console, 'error').mockImplementation(() => {});

            repo.open({ path: '/nowhere/catalog.db', seedPath: null });

            expect(repo.isPersistent()).toBe(false);
            expect(() => repo.upsertSongs([song()])).not.toThrow();
            expect(repo.stats().total).toBe(1);
        });
    });

    describe('seeding', () => {
        const withSeed = (contents) => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-seed-'));
            const seedPath = path.join(dir, 'seed.json');
            fs.writeFileSync(seedPath, contents);
            return { dir, seedPath };
        };

        test('bootstraps an empty catalog from the seed file', () => {
            jest.spyOn(console, 'log').mockImplementation(() => {});
            const { dir, seedPath } = withSeed(JSON.stringify([song(), song({ providerRef: '2', title: 'Song 2', artist: 'Blur' })]));

            repo.open({ path: ':memory:', seedPath });

            expect(repo.stats().total).toBe(2);
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('tolerates a missing seed file', () => {
            expect(() => repo.open({ path: ':memory:', seedPath: '/does/not/exist.json' })).not.toThrow();
            expect(repo.stats().total).toBe(0);
        });

        test('tolerates a corrupt seed file', () => {
            const { dir, seedPath } = withSeed('{ not json');
            expect(() => repo.open({ path: ':memory:', seedPath })).not.toThrow();
            expect(repo.stats().total).toBe(0);
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('tolerates an empty seed file', () => {
            const { dir, seedPath } = withSeed('[]');
            repo.open({ path: ':memory:', seedPath });
            expect(repo.stats().total).toBe(0);
            fs.rmSync(dir, { recursive: true, force: true });
        });
    });

    describe('upsertSongs()', () => {
        beforeEach(openMemory);

        test('inserts a new song', () => {
            expect(repo.upsertSongs([song()])).toEqual({ added: 1, updated: 0 });
            expect(repo.stats().total).toBe(1);
        });

        test('merges a different edition of the same song onto one record', () => {
            repo.upsertSongs([song()]);

            // Same song, different provider id (a remaster), different tags
            const result = repo.upsertSongs([song({
                providerRef: '999',
                title: 'Wonderwall (Remastered 2009)',
                genres: ['indie'],
                aiDifficulty: 'hard'
            })]);

            expect(result).toEqual({ added: 0, updated: 1 });
            expect(repo.stats().total).toBe(1);
        });

        test('merges on the provider id even when the title changed', () => {
            repo.upsertSongs([song()]);
            const result = repo.upsertSongs([song({ title: 'Totally Different Title' })]);
            expect(result).toEqual({ added: 0, updated: 1 });
        });

        test('accumulates tags as a union across discoveries', () => {
            repo.upsertSongs([song({ genres: ['rock'], languages: ['en'] })]);
            repo.upsertSongs([song({ providerRef: '999', genres: ['indie'], languages: ['en'] })]);

            const genres = repo.stats().byGenre.map(g => g.value).sort();
            expect(genres).toEqual(['indie', 'rock']);
        });

        test('keeps the difficulty from first discovery instead of overwriting it', () => {
            repo.upsertSongs([song({ aiDifficulty: 'easy' })]);
            repo.upsertSongs([song({ providerRef: '999', aiDifficulty: 'hard' })]);

            const found = repo.query({ genres: ['rock'], limit: 1 });
            expect(found.songs[0].aiDifficulty).toBe('easy');
        });

        test('fills in metadata that was missing on first discovery', () => {
            repo.upsertSongs([song({ year: null, decade: null, album: null })]);
            repo.upsertSongs([song({ year: 1995, decade: '90s', album: 'Morning Glory' })]);

            const found = repo.query({ genres: ['rock'], limit: 1 });
            expect(found.songs[0].year).toBe(1995);
            expect(found.songs[0].album).toBe('Morning Glory');
        });

        test('refreshes the preview URL, which rotates over time', () => {
            repo.upsertSongs([song({ previewUrl: 'https://old.m4a' })]);
            repo.upsertSongs([song({ previewUrl: 'https://new.m4a' })]);

            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].previewUrl)
                .toBe('https://new.m4a');
        });

        test('skips unusable entries instead of failing the batch', () => {
            const result = repo.upsertSongs([
                song(),
                null,
                song({ providerRef: '2', title: '', artist: 'X' }),
                song({ providerRef: '3', previewUrl: null, title: 'No Audio', artist: 'X' })
            ]);

            expect(result.added).toBe(1);
            expect(repo.stats().total).toBe(1);
        });

        test('keeps non-Latin titles apart instead of merging them', () => {
            const result = repo.upsertSongs([
                song({ providerRef: 'k1', artist: 'BTS', title: '작은 것들을 위한 시' }),
                song({ providerRef: 'k2', artist: 'BTS', title: '피 땀 눈물' })
            ]);

            expect(result).toEqual({ added: 2, updated: 0 });
            expect(repo.stats().total).toBe(2);
        });

        test('falls back to the provider id when the title has no usable slug', () => {
            const result = repo.upsertSongs([
                song({ providerRef: 's1', artist: 'Artist', title: '!!!' }),
                song({ providerRef: 's2', artist: 'Artist', title: '???' })
            ]);

            expect(result).toEqual({ added: 2, updated: 0 });
        });

        test('handles an empty batch', () => {
            expect(repo.upsertSongs([])).toEqual({ added: 0, updated: 0 });
        });
    });

    describe('query() relaxation cascade', () => {
        beforeEach(() => {
            openMemory();
            repo.upsertSongs([
                song({ providerRef: 'a', title: 'A', artist: 'A', genres: ['rock'], decades: ['90s'], languages: ['en'], aiDifficulty: 'easy' }),
                song({ providerRef: 'b', title: 'B', artist: 'B', genres: ['rock'], decades: ['90s'], languages: ['en'], aiDifficulty: 'hard' }),
                song({ providerRef: 'c', title: 'C', artist: 'C', genres: ['rock'], decades: ['90s'], languages: ['it'], aiDifficulty: 'hard' }),
                song({ providerRef: 'd', title: 'D', artist: 'D', genres: ['rock'], decades: ['70s'], languages: ['it'], aiDifficulty: 'hard' }),
                song({ providerRef: 'e', title: 'E', artist: 'E', genres: ['jazz'], decades: ['50s'], languages: ['en'], aiDifficulty: 'easy' })
            ]);
        });

        test('uses the exact filters when they are satisfiable', () => {
            const result = repo.query({ genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', limit: 1 });
            expect(result.relaxedTo).toBe('exact');
            expect(result.songs[0].title).toBe('A');
        });

        test('drops difficulty first', () => {
            // 2 songs are rock/90s/en, but only 1 is easy
            const result = repo.query({ genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', limit: 2 });
            expect(result.relaxedTo).toBe('no-difficulty');
            expect(result.songs.map(s => s.title).sort()).toEqual(['A', 'B']);
        });

        test('drops language next', () => {
            const result = repo.query({ genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', limit: 3 });
            expect(result.relaxedTo).toBe('no-language');
            expect(result.songs.map(s => s.title).sort()).toEqual(['A', 'B', 'C']);
        });

        test('drops the decade last, keeping the genre', () => {
            const result = repo.query({ genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', limit: 4 });
            expect(result.relaxedTo).toBe('genre-only');
            expect(result.songs.map(s => s.title).sort()).toEqual(['A', 'B', 'C', 'D']);
        });

        test('never crosses the genre boundary, returning fewer songs instead', () => {
            const result = repo.query({ genres: ['rock'], decade: '90s', language: 'en', difficulty: 'easy', limit: 10 });
            expect(result.songs).toHaveLength(4);
            expect(result.songs.map(s => s.title)).not.toContain('E');
        });

        test('honours the exclusion set so a rematch draws fresh songs', () => {
            const first = repo.query({ genres: ['rock'], limit: 2 });
            const excluded = new Set(first.songs.map(s => s.id));

            const second = repo.query({ genres: ['rock'], limit: 2, exclude: excluded });

            expect(second.songs).toHaveLength(2);
            for (const s of second.songs) {
                expect(excluded.has(s.id)).toBe(false);
            }
        });

        test('accepts several genres at once', () => {
            const result = repo.query({ genres: ['rock', 'jazz'], limit: 10 });
            expect(result.songs).toHaveLength(5);
        });

        test('returns nothing for a genre with no songs', () => {
            const result = repo.query({ genres: ['metal'], limit: 5 });
            expect(result.songs).toEqual([]);
            expect(result.poolSize).toBe(0);
        });

        test('measured difficulty overrides the AI claim in filtering', () => {
            // 'B' was tagged hard by the AI; make everyone guess it fast and often
            const b = repo.query({ genres: ['rock'], limit: 10 }).songs.find(s => s.title === 'B');
            for (let i = 0; i < 6; i++) {
                repo.recordPlay(b.id);
                repo.recordGuess(b.id, 2000);
            }

            const easy = repo.query({ genres: ['rock'], difficulty: 'easy', limit: 10 });
            expect(easy.songs.map(s => s.title)).toContain('B');
        });
    });

    describe('debug logging', () => {
        test('the debug trace of a query does not throw and names the songs', () => {
            setLevel('debug');
            const log = jest.spyOn(console, 'log').mockImplementation(() => {});

            openMemory();
            repo.upsertSongs([song({ providerRef: '1', title: 'A', artist: 'A' })]);

            expect(() => repo.query({ genres: ['rock'], limit: 5 })).not.toThrow();

            const output = log.mock.calls.map(call => call.join(' ')).join('\n');
            expect(output).toContain('resolved at level=');
            expect(output).toContain('A - A');
        });

        test('a query that finds nothing still logs cleanly', () => {
            setLevel('debug');
            jest.spyOn(console, 'log').mockImplementation(() => {});

            openMemory();
            expect(() => repo.query({ genres: ['metal'], limit: 5 })).not.toThrow();
        });
    });

    describe('query() freshness bias', () => {
        test('prefers songs that have been played least', () => {
            openMemory();
            const entries = [];
            for (let i = 0; i < 10; i++) {
                entries.push(song({ providerRef: String(i), title: 'T' + i, artist: 'A' + i }));
            }
            repo.upsertSongs(entries);

            const all = repo.query({ genres: ['rock'], limit: 10 }).songs;
            // Play half of them
            all.slice(0, 5).forEach(s => repo.recordPlay(s.id));

            // With limit 1 the candidate pool is the 4 least played, all unplayed
            const picked = repo.query({ genres: ['rock'], limit: 1 }).songs[0];
            expect(picked.playCount).toBe(0);
        });
    });

    describe('play statistics and measured difficulty', () => {
        let id;

        beforeEach(() => {
            openMemory();
            repo.upsertSongs([song()]);
            id = repo.query({ genres: ['rock'], limit: 1 }).songs[0].id;
        });

        test('recordPlay increments the counter', () => {
            repo.recordPlay(id);
            repo.recordPlay(id);
            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].playCount).toBe(2);
            expect(repo.stats().played).toBe(1);
        });

        test('leaves the measured difficulty unset until there is enough data', () => {
            repo.recordPlay(id);
            repo.recordGuess(id, 3000);
            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].effDifficulty).toBeNull();
            expect(repo.stats().measured).toBe(0);
        });

        test('derives an easy verdict once the song has been played enough', () => {
            for (let i = 0; i < 6; i++) {
                repo.recordPlay(id);
                repo.recordGuess(id, 3000);
            }
            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].effDifficulty).toBe('easy');
            expect(repo.stats().measured).toBe(1);
        });

        test('derives a hard verdict for a song nobody guesses', () => {
            for (let i = 0; i < 6; i++) repo.recordPlay(id);
            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].effDifficulty).toBe('hard');
        });

        test('ignores a nonsensical elapsed time', () => {
            for (let i = 0; i < 6; i++) {
                repo.recordPlay(id);
                repo.recordGuess(id, -5);
            }
            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].guessCount).toBe(6);
        });

        test('statistics on a deleted song do not throw', () => {
            expect(() => repo.recordPlay(999999)).not.toThrow();
        });

        test('a late write after shutdown is dropped, not thrown', () => {
            // Round timers can still fire while the server is closing sockets
            repo.close();
            expect(() => repo.recordPlay(id)).not.toThrow();
            expect(() => repo.recordGuess(id, 1000)).not.toThrow();
        });
    });

    describe('preview verification and eviction', () => {
        let id;

        beforeEach(() => {
            openMemory();
            repo.upsertSongs([song()]);
            id = repo.query({ genres: ['rock'], limit: 1 }).songs[0].id;
        });

        test('oldestUnverified returns never-checked songs first', () => {
            const pending = repo.oldestUnverified(5);
            expect(pending).toHaveLength(1);
            expect(pending[0]).toMatchObject({ id, providerRef: '1' });
        });

        test('markVerified clears the failure counter', () => {
            repo.markDead(id);
            repo.markVerified(id);
            expect(repo.deleteDead(1)).toBe(0);
        });

        test('repairPreview swaps in a fresh URL and clears failures', () => {
            repo.markDead(id);
            repo.repairPreview(id, 'https://fresh.m4a');

            expect(repo.query({ genres: ['rock'], limit: 1 }).songs[0].previewUrl).toBe('https://fresh.m4a');
            expect(repo.deleteDead(1)).toBe(0);
        });

        test('a song is only removed after repeated failures', () => {
            repo.markDead(id);
            repo.markDead(id);
            expect(repo.deleteDead(3)).toBe(0);

            repo.markDead(id);
            expect(repo.deleteDead(3)).toBe(1);
            expect(repo.stats().total).toBe(0);
        });

        test('deleting a song takes its tags with it', () => {
            repo.markDead(id);
            repo.deleteDead(1);
            expect(repo.stats().byGenre).toEqual([]);
        });
    });

    describe('bucket rotation state', () => {
        beforeEach(openMemory);

        test('starts with no buckets recorded', () => {
            expect(repo.getAllBuckets()).toEqual([]);
        });

        test('records a run and accumulates totals', () => {
            repo.recordBucketRun('rock|90s|easy|en', { found: 20, added: 5 });
            repo.recordBucketRun('rock|90s|easy|en', { found: 20, added: 3 });

            const bucket = repo.getAllBuckets()[0];
            expect(bucket).toMatchObject({ key: 'rock|90s|easy|en', runs: 2, found: 40, added: 8 });
        });

        test('counts consecutive barren runs and resets on a find', () => {
            repo.recordBucketRun('jazz|50s|hard|es', { found: 10, added: 0 });
            repo.recordBucketRun('jazz|50s|hard|es', { found: 10, added: 0 });
            expect(repo.getAllBuckets()[0].empty_streak).toBe(2);

            repo.recordBucketRun('jazz|50s|hard|es', { found: 10, added: 4 });
            expect(repo.getAllBuckets()[0].empty_streak).toBe(0);
        });

        test('defaults the counters when none are given', () => {
            repo.recordBucketRun('pop||easy|');
            expect(repo.getAllBuckets()[0]).toMatchObject({ runs: 1, found: 0, added: 0, empty_streak: 1 });
        });
    });

    describe('meta state', () => {
        beforeEach(openMemory);

        test('returns null for an unknown key', () => {
            expect(repo.getMeta('nope')).toBeNull();
        });

        test('stores and overwrites a value', () => {
            repo.setMeta('k', 'one');
            repo.setMeta('k', 'two');
            expect(repo.getMeta('k')).toBe('two');
        });

        test('the bucket cursor defaults to zero and round-trips', () => {
            expect(repo.getCursor()).toBe(0);
            repo.setCursor(42);
            expect(repo.getCursor()).toBe(42);
        });

        test('records the outcome of a refresh run for later inspection', () => {
            repo.recordRunOutcome('quota');
            expect(repo.getMeta('last_run_outcome')).toBe('quota');
            expect(repo.getMeta('last_run_at')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
    });

    describe('stats()', () => {
        test('summarises the catalog', () => {
            openMemory();
            repo.upsertSongs([
                song({ providerRef: '1', title: 'A', artist: 'A', genres: ['rock'], decades: ['90s'] }),
                song({ providerRef: '2', title: 'B', artist: 'B', genres: ['rock'], decades: ['80s'] }),
                song({ providerRef: '3', title: 'C', artist: 'C', genres: ['jazz'], decades: ['50s'] })
            ]);

            const s = repo.stats();
            expect(s.total).toBe(3);
            expect(s.byGenre).toEqual([
                { value: 'rock', n: 2 },
                { value: 'jazz', n: 1 }
            ]);
            expect(s.byDecade).toHaveLength(3);
            expect(s.played).toBe(0);
            expect(s.measured).toBe(0);
        });
    });
});
