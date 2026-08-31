const aiService = require('./aiService');
const musicService = require('./musicService');
const catalogRepo = require('./catalogRepo');
const { GENRES, DECADES, LANGUAGES, DIFFICULTIES, bucketKey, parseBucketKey } = require('../utils/catalogTags');
const { numberFromEnv } = require('../utils/env');
const { createLogger } = require('../utils/logger');

const log = createLogger('builder');

const CONFIG = {
    maxCalls: numberFromEnv('CATALOG_REFRESH_MAX_CALLS', 4),
    songsPerCall: numberFromEnv('CATALOG_SONGS_PER_CALL', 25),
    // Spacing between AI calls, to avoid self-inflicting a per-minute rate limit
    minIntervalMs: numberFromEnv('GEMINI_MIN_INTERVAL_MS', 15000),
    targetPerBucket: numberFromEnv('CATALOG_TARGET_PER_BUCKET', 25),
    revalidatePerRun: numberFromEnv('CATALOG_REVALIDATE_PER_RUN', 20),
    deadThreshold: numberFromEnv('CATALOG_DEAD_THRESHOLD', 3)
};

// Politeness profiles for the music provider: the builder has nobody waiting,
// a live game has a host staring at a spinner.
const BUILDER_LOOKUP = { concurrency: 3, minIntervalMs: 200 };
const FALLBACK_LOOKUP = { concurrency: 5, minIntervalMs: 0 };

const defaultSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const defaults = {
    ai: aiService,
    music: musicService,
    repo: catalogRepo,
    sleep: defaultSleep,
    now: () => Date.now()
};

/**
 * Every combination the catalog can be filled along. "Any decade" and "any
 * language" are legitimate buckets, hence the null entries.
 */
function allBucketKeys() {
    const keys = [];
    for (const genre of GENRES) {
        for (const decade of [...DECADES, null]) {
            for (const difficulty of DIFFICULTIES) {
                for (const language of [...LANGUAGES, null]) {
                    keys.push(bucketKey({ genre, decade, difficulty, language }));
                }
            }
        }
    }
    return keys;
}

/**
 * Stable FNV-1a hash, used only to break scoring ties.
 *
 * A lexicographic tie-break would be pathological on a fresh catalog, where
 * every bucket scores the same: the first runs would all land on one genre with
 * no decade. Hashing spreads them across the space while staying deterministic,
 * so tests remain reproducible.
 */
function stableHash(key) {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Rank buckets by how much they still need filling, and hand back the next
 * slice to work on.
 *
 * Scoring favours buckets that are empty, then ones untouched for a long time,
 * and backs off exponentially from buckets that keep coming back with nothing —
 * some combinations (Spanish 1950s metal) simply have no songs to find, and
 * without the backoff they would soak up every run forever.
 *
 * @param {number} count - How many buckets to return
 * @param {object} [deps]
 * @returns {Array<object>} - Parsed buckets, in the order they should be filled
 */
function pickBuckets(count, deps = {}) {
    const { repo, now } = { ...defaults, ...deps };

    const stored = new Map(repo.getAllBuckets().map(row => [row.key, row]));
    const nowMs = now();

    const scored = allBucketKeys().map(key => {
        const row = stored.get(key);
        const added = row ? row.added : 0;
        const emptyStreak = row ? row.empty_streak : 0;
        const lastRunAt = row && row.last_run_at ? Date.parse(row.last_run_at) : null;
        const daysSince = lastRunAt === null ? 30 : (nowMs - lastRunAt) / 86400000;

        const score = 2 * Math.max(0, CONFIG.targetPerBucket - added)
            + 1 * Math.min(daysSince, 30)
            - 5 * (emptyStreak * emptyStreak);

        return { key, score, hash: stableHash(key) };
    });

    // Deterministic ordering so the rotation is reproducible in tests
    scored.sort((a, b) => (b.score - a.score) || (a.hash - b.hash) || a.key.localeCompare(b.key));

    // Rotate within the most valuable band rather than always taking the very
    // top, so successive runs spread over different buckets.
    const window = scored.slice(0, Math.max(count * 5, count));
    const cursor = repo.getCursor();

    const picked = [];
    for (let i = 0; i < Math.min(count, window.length); i++) {
        picked.push(window[(cursor + i) % window.length].key);
    }
    repo.setCursor((cursor + picked.length) % Math.max(window.length, 1));

    if (log.isDebug()) {
        const scoreOf = new Map(scored.map(entry => [entry.key, entry.score]));
        log.debug('picked %d bucket(s) from cursor=%d: %s', picked.length, cursor,
            picked.map(key => key + '(score=' + scoreOf.get(key).toFixed(1) + ')').join(' '));
    }

    return picked.map(key => ({ key, ...parseBucketKey(key) }));
}

/**
 * Turn provider records into catalog entries carrying the bucket's tags.
 *
 * The decade of the bucket that found the song is always trusted. The decade
 * derived from the release date is only added when the album does not look
 * like a reissue, because a 1969 track on a 2009 remaster reports 2009.
 */
function toEntries(records, bucket, origin) {
    return records.map(record => {
        const decades = new Set();
        if (bucket.decade) decades.add(bucket.decade);
        if (record.decade && !record.isReissue) decades.add(record.decade);

        return {
            ...record,
            genres: [bucket.genre],
            decades: [...decades],
            languages: bucket.language ? [bucket.language] : [],
            aiDifficulty: bucket.difficulty,
            origin
        };
    });
}

/**
 * Ask the AI for one bucket and merge whatever the provider can resolve.
 * Throws only for AI call failures, which the caller classifies.
 */
async function fillBucket(bucket, deps) {
    const { ai, music, repo } = deps;

    const recommendations = await ai.getSongListFromAI({
        genres: [bucket.genre],
        decade: bucket.decade,
        language: bucket.language,
        difficulty: bucket.difficulty,
        count: CONFIG.songsPerCall
    });

    if (!recommendations || recommendations.length === 0) {
        log.debug('bucket=%s the AI returned nothing', bucket.key);
        repo.recordBucketRun(bucket.key, { found: 0, added: 0 });
        return { found: 0, added: 0 };
    }

    log.debug('bucket=%s the AI suggested %d song(s)', bucket.key, recommendations.length);

    const resolved = await music.searchAndGetPreviewMany(
        recommendations.map(song => ({ artist: song.artist, title: song.title })),
        BUILDER_LOOKUP
    );

    const records = resolved.filter(Boolean);
    const { added, updated } = repo.upsertSongs(toEntries(records, bucket, 'builder'));

    log.debug('bucket=%s resolved %d/%d, added %d, merged %d',
        bucket.key, records.length, resolved.length, added, updated);

    repo.recordBucketRun(bucket.key, { found: records.length, added });
    return { found: records.length, added };
}

/**
 * Grow the catalog by a bounded number of AI calls.
 *
 * There is no local quota bookkeeping on purpose: the API is the authority on
 * its own limits, and a counter of ours would drift from it (the same key is
 * used by local development and scripts). We simply try, and stop on 429.
 *
 * @param {{maxCalls?: number, deps?: object}} [options]
 * @returns {Promise<{calls: number, added: number, outcome: string}>}
 */
async function runRefresh(options = {}) {
    const deps = { ...defaults, ...(options.deps || {}) };
    const maxCalls = options.maxCalls || CONFIG.maxCalls;

    log.debug('refresh starting: maxCalls=%d songsPerCall=%d spacing=%dms',
        maxCalls, CONFIG.songsPerCall, CONFIG.minIntervalMs);

    const buckets = pickBuckets(maxCalls, deps);

    let calls = 0;
    let added = 0;
    let failures = 0;
    let outcome = 'ok';

    for (const bucket of buckets) {
        // Space out the calls; the first one goes immediately.
        if (calls > 0) await deps.sleep(CONFIG.minIntervalMs);
        calls++;

        try {
            const result = await fillBucket(bucket, deps);
            added += result.added;
        } catch (error) {
            if (deps.ai.isQuotaError(error)) {
                // The limit is global: trying the other buckets would only waste
                // boot time. Stop, log, and play with the catalog as it is.
                log.warn('refresh stopped at call %d: AI usage limit reached. Serving the existing catalog.', calls);
                outcome = 'quota';
                break;
            }
            log.error('bucket %s failed:', bucket.key, error.message);
            failures++;
        }
    }

    if (outcome === 'ok' && failures > 0 && failures === calls) outcome = 'error';

    deps.repo.recordRunOutcome(outcome);
    log.info('refresh finished: %d call(s), %d new song(s), outcome=%s', calls, added, outcome);

    return { calls, added, outcome };
}

/**
 * Verify the least recently checked previews, repair the ones whose URL merely
 * rotated, and evict what is genuinely gone.
 *
 * Costs no AI calls at all, so it runs on every wake regardless of the limit.
 *
 * @param {{max?: number, deps?: object}} [options]
 * @returns {Promise<{checked: number, repaired: number, dead: number, removed: number}>}
 */
async function runRevalidation(options = {}) {
    const deps = { ...defaults, ...(options.deps || {}) };
    const max = options.max || CONFIG.revalidatePerRun;

    const candidates = deps.repo.oldestUnverified(max);
    log.debug('revalidating %d least recently checked preview(s)', candidates.length);

    let repaired = 0;
    let dead = 0;

    for (const candidate of candidates) {
        const alive = await deps.music.isPreviewAlive(candidate.previewUrl);

        if (alive === true) {
            deps.repo.markVerified(candidate.id);
            continue;
        }
        if (alive === null) {
            // transient failure: no verdict, so nothing gets evicted
            log.debug('song=%d preview check inconclusive, skipping', candidate.id);
            continue;
        }

        // Preview URLs rotate while the provider id stays stable, so try to
        // repair before considering the song lost.
        const fresh = await deps.music.lookupByRef(candidate.providerRef);
        if (fresh && fresh.previewUrl) {
            log.debug('song=%d preview URL rotated, repaired', candidate.id);
            deps.repo.repairPreview(candidate.id, fresh.previewUrl);
            repaired++;
        } else {
            log.debug('song=%d preview gone and not re-resolvable', candidate.id);
            deps.repo.markDead(candidate.id);
            dead++;
        }
    }

    const removed = deps.repo.deleteDead(CONFIG.deadThreshold);
    if (removed > 0) log.info('removed %d unplayable song(s)', removed);

    log.debug('revalidation done: checked=%d repaired=%d dead=%d removed=%d',
        candidates.length, repaired, dead, removed);

    return { checked: candidates.length, repaired, dead, removed };
}

/**
 * Live discovery for a game the catalog cannot satisfy.
 *
 * Whatever it finds is merged into the catalog, so a niche request pays the
 * latency once and makes the catalog better for everyone afterwards. The caller
 * re-queries the catalog rather than consuming a return value, which keeps song
 * ids and play statistics coming from a single place.
 *
 * @returns {Promise<{added: number, updated: number}>}
 */
async function runFallback({ genres, decade, language, difficulty, count }, deps = {}) {
    const resolvedDeps = { ...defaults, ...deps };
    const { ai, music, repo } = resolvedDeps;

    log.debug('live fallback for genres=[%s] decade=%s language=%s difficulty=%s count=%d',
        genres.join(','), decade || 'any', language || 'any', difficulty, count);

    const recommendations = await ai.getSongListFromAI({
        genres, decade, language, difficulty, count
    });

    if (!recommendations || recommendations.length === 0) {
        log.debug('live fallback: the AI returned nothing');
        return { added: 0, updated: 0 };
    }

    const resolved = await music.searchAndGetPreviewMany(
        recommendations.map(song => ({ artist: song.artist, title: song.title })),
        FALLBACK_LOOKUP
    );

    const records = resolved.filter(Boolean);
    if (records.length === 0) {
        log.debug('live fallback: none of the %d suggestions had a playable preview', resolved.length);
        return { added: 0, updated: 0 };
    }

    // The request may span several genres; tag with each so the songs are
    // findable under any of them next time.
    let totals = { added: 0, updated: 0 };
    for (const genre of genres) {
        const bucket = { genre, decade, language, difficulty };
        const result = repo.upsertSongs(toEntries(records, bucket, 'fallback'));
        totals = { added: totals.added + result.added, updated: totals.updated + result.updated };
    }

    log.info('live fallback added %d song(s) to the catalog (%d merged)', totals.added, totals.updated);

    return totals;
}

module.exports = {
    pickBuckets,
    runRefresh,
    runRevalidation,
    runFallback,
    allBucketKeys,
    toEntries,
    defaultSleep,
    CONFIG
};
