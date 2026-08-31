const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { computeEffectiveDifficulty } = require('../utils/difficultyStats');
const { dedupeKey, shuffle } = require('../utils/catalogTags');
const { createLogger } = require('../utils/logger');

const log = createLogger('catalog');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');
const DEFAULT_SEED_PATH = path.join(__dirname, '..', 'db', 'catalog.seed.json');

let db = null;
let persistent = false;

const nowIso = () => new Date().toISOString();

/**
 * Map a database row onto the shape the rest of the server uses.
 */
function mapSong(row) {
    return {
        id: row.id,
        provider: row.provider,
        providerRef: row.provider_ref,
        dedupeKey: row.dedupe_key,
        title: row.title,
        artist: row.artist,
        album: row.album,
        previewUrl: row.preview_url,
        artworkUrl: row.artwork_url,
        year: row.year,
        decade: row.decade,
        aiDifficulty: row.ai_difficulty,
        effDifficulty: row.eff_difficulty,
        playCount: row.play_count,
        guessCount: row.guess_count
    };
}

/**
 * Open (and lazily create) the catalog database.
 *
 * A missing or read-only volume must never take the game down, so any storage
 * failure degrades to an in-memory catalog instead of throwing.
 *
 * @param {{path?: string, seedPath?: string|null}} [options]
 */
function open(options = {}) {
    if (db) {
        log.debug('open() called again, keeping the existing connection');
        return;
    }

    const dbPath = options.path || process.env.CATALOG_DB_PATH
        || path.join(__dirname, '..', '.data', 'catalog.db');
    const seedPath = options.seedPath === undefined ? DEFAULT_SEED_PATH : options.seedPath;

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

    // Everything that touches the file has to be inside the guard: opening a
    // database is lazy, so a truncated or corrupt file only blows up on the
    // first pragma or statement. Letting that escape would crash-loop the
    // machine on boot instead of degrading.
    try {
        if (dbPath !== ':memory:') {
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        }
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.exec(schema);
        persistent = dbPath !== ':memory:';
    } catch (error) {
        log.error('storage unavailable, running in memory:', error.message);
        if (db) {
            try { db.close(); } catch (closeError) { /* already unusable */ }
        }
        db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        db.exec(schema);
        persistent = false;
    }

    log.debug('opened %s (persistent=%s)', dbPath, persistent);

    if (seedPath) seedIfEmpty(seedPath);
}

/**
 * Bootstrap an empty catalog from the seed shipped in the repository, so a
 * fresh deploy (or a wiped volume) can still start a game immediately.
 */
function seedIfEmpty(seedPath) {
    if (stats().total > 0) return 0;

    let entries;
    try {
        entries = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    } catch (error) {
        // No seed, or an unreadable one, simply means we start from nothing.
        return 0;
    }

    if (!Array.isArray(entries) || entries.length === 0) return 0;

    const { added } = upsertSongs(entries.map(entry => ({ ...entry, origin: 'seed' })));
    log.info('seeded with %d songs from %s', added, seedPath);
    return added;
}

function close() {
    if (!db) return;
    db.close();
    db = null;
    persistent = false;
}

function isPersistent() {
    return persistent;
}

/**
 * Insert or merge songs.
 *
 * Identity is checked on both axes: the provider id, and the artist/title slug.
 * The latter matters because a provider hands out different ids for the
 * original pressing and the remaster of the same song.
 *
 * Tags accumulate as a union, since the same song is legitimately discovered by
 * several buckets. ai_difficulty is NOT overwritten once set: it records what
 * the AI claimed at discovery, and eff_difficulty is what corrects it later.
 *
 * @param {Array<object>} entries - Normalized records plus genres/decades/languages/aiDifficulty/origin
 * @returns {{added: number, updated: number}}
 */
function upsertSongs(entries) {
    const findByKey = db.prepare('SELECT id FROM songs WHERE dedupe_key = ?');
    const findByRef = db.prepare('SELECT id FROM songs WHERE provider = ? AND provider_ref = ?');

    const insertSong = db.prepare([
        'INSERT INTO songs (',
        '  provider, provider_ref, dedupe_key, title, artist, album,',
        '  preview_url, artwork_url, release_date, year, decade,',
        '  provider_genre, is_reissue, ai_difficulty, origin, added_at',
        ') VALUES (',
        '  @provider, @providerRef, @dedupeKey, @title, @artist, @album,',
        '  @previewUrl, @artworkUrl, @releaseDate, @year, @decade,',
        '  @providerGenre, @isReissue, @aiDifficulty, @origin, @addedAt',
        ') RETURNING id'
    ].join('\n'));

    const refreshSong = db.prepare([
        'UPDATE songs SET',
        '  preview_url   = @previewUrl,',
        '  artwork_url   = COALESCE(@artworkUrl, artwork_url),',
        '  album         = COALESCE(album, @album),',
        '  year          = COALESCE(year, @year),',
        '  decade        = COALESCE(decade, @decade),',
        '  release_date  = COALESCE(release_date, @releaseDate),',
        '  ai_difficulty = COALESCE(ai_difficulty, @aiDifficulty),',
        '  dead_checks   = 0',
        'WHERE id = @id'
    ].join('\n'));

    const insertTag = db.prepare(
        'INSERT OR IGNORE INTO song_tags (song_id, kind, value) VALUES (?, ?, ?)'
    );

    const run = db.transaction((list) => {
        let added = 0;
        let updated = 0;

        for (const entry of list) {
            if (!entry || !entry.title || !entry.artist || !entry.previewUrl) continue;

            const provider = entry.provider || 'unknown';
            const providerRef = String(entry.providerRef);
            // A title with no letters or digits has no usable slug; falling back
            // to the provider id keeps it unique instead of merging it with
            // every other such song by the same artist.
            const key = dedupeKey(entry.artist, entry.title) || `${provider}:${providerRef}`;

            const params = {
                provider,
                providerRef,
                dedupeKey: key,
                title: entry.title,
                artist: entry.artist,
                album: entry.album || null,
                previewUrl: entry.previewUrl,
                artworkUrl: entry.artworkUrl || null,
                releaseDate: entry.releaseDate || null,
                year: entry.year || null,
                decade: entry.decade || null,
                providerGenre: entry.providerGenre || null,
                isReissue: entry.isReissue ? 1 : 0,
                aiDifficulty: entry.aiDifficulty || null,
                origin: entry.origin || 'builder',
                addedAt: nowIso()
            };

            const existing = findByKey.get(key)
                || findByRef.get(params.provider, params.providerRef);

            let songId;
            if (existing) {
                refreshSong.run({ ...params, id: existing.id });
                songId = existing.id;
                updated++;
            } else {
                songId = insertSong.get(params).id;
                added++;
            }

            for (const value of entry.genres || []) insertTag.run(songId, 'genre', value);
            for (const value of entry.decades || []) insertTag.run(songId, 'decade', value);
            for (const value of entry.languages || []) insertTag.run(songId, 'language', value);
        }

        return { added, updated };
    });

    const result = run(entries);

    // Counts only: logging one line per song made a seeding run bury everything
    // else under dozens of lines.
    log.debug('upsert of %d entr(ies): %d added, %d merged, %d skipped',
        entries.length, result.added, result.updated,
        entries.length - result.added - result.updated);

    return result;
}

/**
 * Fetch candidate songs, ordered by how little they have been played so the
 * catalog rotates instead of replaying favourites.
 */
function selectCandidates({ genres, decade, language, difficulty, exclude, poolSize }) {
    const where = [];
    const params = [];

    if (genres && genres.length > 0) {
        const slots = genres.map(() => '?').join(', ');
        where.push("EXISTS (SELECT 1 FROM song_tags t WHERE t.song_id = s.id AND t.kind = 'genre' AND t.value IN (" + slots + '))');
        params.push(...genres);
    }
    if (decade) {
        where.push("EXISTS (SELECT 1 FROM song_tags t WHERE t.song_id = s.id AND t.kind = 'decade' AND t.value = ?)");
        params.push(decade);
    }
    if (language) {
        where.push("EXISTS (SELECT 1 FROM song_tags t WHERE t.song_id = s.id AND t.kind = 'language' AND t.value = ?)");
        params.push(language);
    }
    if (difficulty) {
        where.push('COALESCE(s.eff_difficulty, s.ai_difficulty) = ?');
        params.push(difficulty);
    }

    const excluded = exclude ? [...exclude] : [];
    if (excluded.length > 0) {
        where.push('s.id NOT IN (' + excluded.map(() => '?').join(', ') + ')');
        params.push(...excluded);
    }

    const sql = [
        'SELECT s.* FROM songs s',
        where.length ? 'WHERE ' + where.join(' AND ') : '',
        'ORDER BY s.play_count ASC, (s.last_played_at IS NULL) DESC, s.last_played_at ASC',
        'LIMIT ?'
    ].join('\n');

    params.push(poolSize);

    return db.prepare(sql).all(...params);
}

/**
 * Pick songs for a game, relaxing the filters step by step until there are
 * enough. The weakest tag (difficulty) is dropped first.
 *
 * @returns {{songs: Array<object>, relaxedTo: string, poolSize: number}}
 */
function query({ genres = [], decade = null, language = null, difficulty = null, exclude = null, limit = 10 }) {
    const levels = [
        { name: 'exact', decade, language, difficulty },
        { name: 'no-difficulty', decade, language, difficulty: null },
        { name: 'no-language', decade, language: null, difficulty: null },
        { name: 'genre-only', decade: null, language: null, difficulty: null }
    ];

    let best = { songs: [], relaxedTo: 'exact', poolSize: 0 };

    log.debug('query genres=[%s] decade=%s language=%s difficulty=%s limit=%d excluded=%d',
        genres.join(','), decade || 'any', language || 'any', difficulty || 'any',
        limit, exclude ? exclude.size || exclude.length || 0 : 0);

    for (const level of levels) {
        const rows = selectCandidates({
            genres,
            decade: level.decade,
            language: level.language,
            difficulty: level.difficulty,
            exclude,
            // Over-fetch so there is something to shuffle within the freshest slice
            poolSize: Math.max(limit * 4, limit)
        });

        const songs = shuffle(rows.map(mapSong)).slice(0, limit);

        log.debug('  level=%s candidates=%d picked=%d', level.name, rows.length, songs.length);

        if (songs.length > best.songs.length) {
            best = { songs, relaxedTo: level.name, poolSize: rows.length };
        }
        if (songs.length >= limit) break;
    }

    if (log.isDebug()) {
        log.debug('query resolved at level=%s with %d song(s): %s',
            best.relaxedTo, best.songs.length,
            best.songs.map(s => `${s.artist} - ${s.title} (plays=${s.playCount})`).join(' | ') || 'none');
    }

    return best;
}

/** Recompute the measured difficulty after a statistics change. */
function refreshDifficulty(songId) {
    const row = db.prepare(
        'SELECT play_count, guess_count, total_guess_ms FROM songs WHERE id = ?'
    ).get(songId);
    if (!row) return;

    const effective = computeEffectiveDifficulty({
        playCount: row.play_count,
        guessCount: row.guess_count,
        totalGuessMs: row.total_guess_ms
    });

    const previous = db.prepare('SELECT eff_difficulty FROM songs WHERE id = ?').get(songId).eff_difficulty;
    db.prepare('UPDATE songs SET eff_difficulty = ? WHERE id = ?').run(effective, songId);

    if (effective !== previous) {
        log.debug('song=%d measured difficulty %s -> %s (plays=%d guesses=%d)',
            songId, previous || 'unset', effective || 'unset', row.play_count, row.guess_count);
    }
}

// Statistics are written from game timers, which can still fire while the
// server is shutting down. Losing one play count is fine; throwing is not.
function recordPlay(songId) {
    if (!db) return;
    db.prepare(
        'UPDATE songs SET play_count = play_count + 1, last_played_at = ? WHERE id = ?'
    ).run(nowIso(), songId);
    refreshDifficulty(songId);
    log.debug('play recorded for song=%d', songId);
}

function recordGuess(songId, elapsedMs) {
    if (!db) return;
    const safeMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.round(elapsedMs) : 0;
    db.prepare(
        'UPDATE songs SET guess_count = guess_count + 1, total_guess_ms = total_guess_ms + ? WHERE id = ?'
    ).run(safeMs, songId);
    refreshDifficulty(songId);
    log.debug('guess recorded for song=%d in %dms', songId, safeMs);
}

function markVerified(songId) {
    db.prepare(
        'UPDATE songs SET last_verified_at = ?, dead_checks = 0 WHERE id = ?'
    ).run(nowIso(), songId);
}

function repairPreview(songId, previewUrl) {
    db.prepare(
        'UPDATE songs SET preview_url = ?, last_verified_at = ?, dead_checks = 0 WHERE id = ?'
    ).run(previewUrl, nowIso(), songId);
}

function markDead(songId) {
    db.prepare(
        'UPDATE songs SET dead_checks = dead_checks + 1, last_verified_at = ? WHERE id = ?'
    ).run(nowIso(), songId);
}

/** Remove songs that failed verification too many times. */
function deleteDead(threshold) {
    const removed = db.prepare('DELETE FROM songs WHERE dead_checks >= ?').run(threshold).changes;
    if (removed > 0) log.debug('evicted %d song(s) with %d+ failed checks', removed, threshold);
    return removed;
}

/** Songs whose preview has gone unchecked the longest. */
function oldestUnverified(count) {
    return db.prepare([
        'SELECT id, provider_ref AS providerRef, preview_url AS previewUrl',
        'FROM songs',
        'ORDER BY (last_verified_at IS NULL) DESC, last_verified_at ASC',
        'LIMIT ?'
    ].join('\n')).all(count);
}

function getAllBuckets() {
    return db.prepare('SELECT * FROM buckets').all();
}

function recordBucketRun(key, options = {}) {
    const found = options.found || 0;
    const added = options.added || 0;

    db.prepare([
        'INSERT INTO buckets (key, last_run_at, runs, found, added, empty_streak)',
        'VALUES (@key, @now, 1, @found, @added, @streak)',
        'ON CONFLICT(key) DO UPDATE SET',
        '  last_run_at  = @now,',
        '  runs         = runs + 1,',
        '  found        = found + @found,',
        '  added        = added + @added,',
        '  empty_streak = CASE WHEN @added > 0 THEN 0 ELSE empty_streak + 1 END'
    ].join('\n')).run({ key, now: nowIso(), found, added, streak: added > 0 ? 0 : 1 });
}

function getMeta(key) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setMeta(key, value) {
    db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
}

function getCursor() {
    return Number(getMeta('bucket_cursor')) || 0;
}

function setCursor(value) {
    setMeta('bucket_cursor', value);
}

function recordRunOutcome(outcome) {
    setMeta('last_run_at', nowIso());
    setMeta('last_run_outcome', outcome);
}

function stats() {
    const byTag = (kind) => db.prepare(
        'SELECT value, COUNT(*) AS n FROM song_tags WHERE kind = ? GROUP BY value ORDER BY n DESC'
    ).all(kind);

    return {
        total: db.prepare('SELECT COUNT(*) AS n FROM songs').get().n,
        persistent,
        byGenre: byTag('genre'),
        byDecade: byTag('decade'),
        played: db.prepare('SELECT COUNT(*) AS n FROM songs WHERE play_count > 0').get().n,
        measured: db.prepare('SELECT COUNT(*) AS n FROM songs WHERE eff_difficulty IS NOT NULL').get().n
    };
}

module.exports = {
    open,
    close,
    isPersistent,
    upsertSongs,
    query,
    recordPlay,
    recordGuess,
    markVerified,
    repairPreview,
    markDead,
    deleteDead,
    oldestUnverified,
    getAllBuckets,
    recordBucketRun,
    getMeta,
    setMeta,
    getCursor,
    setCursor,
    recordRunOutcome,
    stats
};
