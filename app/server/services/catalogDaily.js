const crypto = require('crypto');
const repo = require('./catalogRepo');
const builder = require('./catalogBuilder');
const ai = require('./aiService');
const music = require('./musicService');
const { GENRES, DECADES, bucketKey } = require('../utils/catalogTags');
const { createLogger } = require('../utils/logger');

const log = createLogger('daily-catalog');
const LOCK_KEY = 'genre_topup_lease';
const MAX_DURATION_MS = 10 * 60 * 1000;

function progress(repository, target) {
    const counts = new Map(repository.stats().byGenre.map(({ value, n }) => [value, n]));
    return GENRES.map(genre => ({ genre, count: counts.get(genre) || 0,
        missing: Math.max(0, target - (counts.get(genre) || 0)) }));
}

async function run(options = {}) {
    const target = options.target ?? 200;
    const maxCalls = options.maxCalls ?? 20;
    if (!Number.isInteger(target) || target < 1 || target > 10000) throw new Error('target must be an integer between 1 and 10000');
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100) throw new Error('maxCalls must be an integer between 1 and 100');
    const deps = { repo, ai, music, sleep: builder.defaultSleep, now: Date.now, ...options.deps };
    // Unlike the game, a maintenance job must never silently write into memory.
    if (!deps.repo.isPersistent() && !options.deps) throw new Error('Persistent catalog storage is required');
    const owner = crypto.randomUUID();
    const startedAt = deps.now();
    const day = new Date(startedAt).toISOString().slice(0, 10);
    if (!deps.repo.claimLease(LOCK_KEY, owner, startedAt, 30 * 60 * 1000)) {
        return { outcome: 'busy', calls: 0, added: 0, genres: progress(deps.repo, target) };
    }
    try {
        let genres = progress(deps.repo, target);
        if (genres.every(row => row.missing === 0)) {
            return { outcome: 'complete', calls: 0, added: 0, genres };
        }
        if (!options.force && deps.repo.getMeta('genre_topup_day') === day) {
            return { outcome: 'already-ran', calls: 0, added: 0, genres };
        }
        deps.repo.setMeta('genre_topup_day', day);
        deps.repo.setMeta('genre_topup_outcome', 'running');
        let calls = 0;
        let added = 0;
        let outcome = 'budget';
        const attempts = new Map();
        const cursor = Number(deps.repo.getMeta('genre_topup_cursor')) || 0;
        while (calls < maxCalls) {
            genres = progress(deps.repo, target);
            if (genres.every(row => row.missing === 0)) { outcome = 'complete'; break; }
            if (deps.now() - startedAt >= MAX_DURATION_MS) { outcome = 'time-limit'; break; }
            // Give every deficient genre a turn before retrying one, prioritizing the emptiest.
            const candidates = genres.filter(row => row.missing > 0).sort((a, b) =>
                (attempts.get(a.genre) || 0) - (attempts.get(b.genre) || 0) ||
                a.count - b.count ||
                ((GENRES.indexOf(a.genre) - cursor + GENRES.length) % GENRES.length) -
                ((GENRES.indexOf(b.genre) - cursor + GENRES.length) % GENRES.length));
            const chosen = candidates[0];
            const historyKey = `genre_topup_attempts_${chosen.genre}`;
            const attempt = Number(deps.repo.getMeta(historyKey)) || 0;
            // Broad requests first, then rotate decades to escape repeated recommendations.
            const decade = attempt % (DECADES.length + 1) === 0 ? null : DECADES[(attempt % (DECADES.length + 1)) - 1];
            const bucket = { genre: chosen.genre, decade, language: null,
                difficulty: Math.floor(attempt / (DECADES.length + 1)) % 2 ? 'hard' : 'easy' };
            bucket.key = bucketKey(bucket);
            if (calls > 0) await deps.sleep(builder.CONFIG.minIntervalMs);
            if (deps.now() - startedAt >= MAX_DURATION_MS) { outcome = 'time-limit'; break; }
            calls++;
            attempts.set(chosen.genre, (attempts.get(chosen.genre) || 0) + 1);
            deps.repo.setMeta(historyKey, attempt + 1);
            deps.repo.setMeta('genre_topup_cursor', (GENRES.indexOf(chosen.genre) + 1) % GENRES.length);
            log.info('%s: %d/%d songs, request %d/%d', chosen.genre, chosen.count, target, calls, maxCalls);
            try {
                const result = await builder.fillBucket(bucket, deps, {
                    count: Math.min(builder.CONFIG.songsPerCall, chosen.missing),
                    exclude: deps.repo.songsForGenre(chosen.genre)
                });
                added += result.added;
            } catch (error) {
                outcome = deps.ai.isQuotaError(error) ? 'quota' : 'error';
                log.warn('stopping daily growth (%s): %s', outcome, error.message);
                break;
            }
        }
        genres = progress(deps.repo, target);
        if (genres.every(row => row.missing === 0)) outcome = 'complete';
        const result = { outcome, target, calls, added, genres };
        deps.repo.setMeta('genre_topup_outcome', outcome);
        deps.repo.setMeta('genre_topup_result', JSON.stringify(result));
        log.info('daily growth finished: outcome=%s calls=%d added=%d', outcome, calls, added);
        return result;
    } finally {
        deps.repo.releaseLease(LOCK_KEY, owner);
    }
}

module.exports = { run, progress, MAX_DURATION_MS };
