const axios = require('axios');
const { detectLanguage } = require('../utils/languageDetection');
const { yearFromReleaseDate, decadeFromYear, isLikelyReissue } = require('../utils/catalogTags');
const { createLogger } = require('../utils/logger');

const log = createLogger('music');

// This module is the ONLY place that knows the shape of the music provider's
// responses. Everything downstream consumes the normalized record below, so
// swapping provider means rewriting this file and nothing else.
const PROVIDER = 'itunes';
const SEARCH_URL = 'https://itunes.apple.com/search';
const LOOKUP_URL = 'https://itunes.apple.com/lookup';
const REQUEST_TIMEOUT = 5000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Map a raw provider track onto the generic catalog record.
 * A track without playable audio is useless for the game and yields null.
 *
 * @param {object} track - Raw provider payload
 * @returns {object|null}
 */
function normalizeTrack(track) {
    if (!track || !track.previewUrl) return null;

    const year = yearFromReleaseDate(track.releaseDate);

    return {
        provider: PROVIDER,
        providerRef: String(track.trackId),
        title: track.trackName,
        artist: track.artistName,
        album: track.collectionName || null,
        previewUrl: track.previewUrl,
        artworkUrl: track.artworkUrl100 || null,
        releaseDate: track.releaseDate || null,
        year,
        decade: decadeFromYear(year),
        providerGenre: track.primaryGenreName || null,
        isReissue: isLikelyReissue(track.collectionName)
    };
}

// --- Metodo Vecchio (Ricerca Casuale) ---
async function getRandomSongs(genre = 'pop', limit = 10, language = null, difficulty = 'hard') {
    try {
        const response = await axios.get(SEARCH_URL, {
            params: {
                term: genre,
                media: 'music',
                entity: 'song',
                limit: 50
            }
        });

        let results = response.data.results;
        if (!results || results.length === 0) return [];

        if (language) {
            results = results.filter(song => {
                const text = `${song.trackName || ''} ${song.artistName || ''} ${song.collectionName || ''}`;
                return detectLanguage(text) === language;
            });
            if (results.length === 0) {
                results = response.data.results;
            }
        }

        let selected;
        const fisherYates = (arr) => {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        };
        if (difficulty === 'easy') {
            selected = fisherYates(results.slice(0, 100)).slice(0, limit);
        } else {
            selected = fisherYates(results).slice(0, limit);
        }

        return selected.map(song => ({
            title: song.trackName,
            artist: song.artistName,
            previewUrl: song.previewUrl,
            artwork: song.artworkUrl100
        }));
    } catch (error) {
        log.error('error fetching songs:', error.message);
        return [];
    }
}

/**
 * Find one track and its audio preview.
 *
 * @param {string} queryOrArtist - Artist name, or a whole search string
 * @param {string} [title] - Track title, when passed separately
 * @returns {Promise<object|null>} - Normalized record, or null when unusable
 */
async function searchAndGetPreview(queryOrArtist, title = null) {
    try {
        let searchTerm = title ? `${queryOrArtist} ${title}` : queryOrArtist;

        // Strip characters that break the query; keep common accented letters
        searchTerm = searchTerm.replace(/[^a-zA-Z0-9 àèéìòù]/g, " ");

        const response = await axios.get(SEARCH_URL, {
            params: {
                term: searchTerm,
                media: 'music',
                entity: 'song',
                limit: 1
            },
            timeout: REQUEST_TIMEOUT
        });

        if (response.data.results && response.data.results.length > 0) {
            const record = normalizeTrack(response.data.results[0]);
            if (!record) log.debug('no playable preview for "%s"', searchTerm.trim());
            return record;
        }
        log.debug('no result for "%s"', searchTerm.trim());
        return null;
    } catch (error) {
        // One failed lookup must not sink the batch: the caller filters nulls.
        log.debug('lookup failed for "%s": %s', queryOrArtist, error.message);
        return null;
    }
}

/**
 * Resolve many tracks with a bounded worker pool.
 *
 * Replaces an unbounded Promise.all: the catalog builder can enqueue dozens of
 * lookups and must stay polite towards the provider, while a live game wants
 * them as fast as reasonable.
 *
 * @param {Array<{artist: string, title: string}>} pairs
 * @param {{concurrency?: number, minIntervalMs?: number}} [options]
 * @returns {Promise<Array<object|null>>} - Aligned with the input order
 */
async function searchAndGetPreviewMany(pairs, options = {}) {
    const { concurrency = 4, minIntervalMs = 0 } = options;
    const results = new Array(pairs.length).fill(null);

    let cursor = 0;
    let nextSlot = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor++;
            if (index >= pairs.length) return;

            if (minIntervalMs > 0) {
                const now = Date.now();
                const startAt = Math.max(now, nextSlot);
                nextSlot = startAt + minIntervalMs;
                if (startAt > now) await sleep(startAt - now);
            }

            const pair = pairs[index];
            results[index] = await searchAndGetPreview(pair.artist, pair.title);
        }
    };

    const poolSize = Math.max(1, Math.min(concurrency, pairs.length));
    const startedAt = Date.now();
    await Promise.all(Array.from({ length: poolSize }, worker));

    log.debug('resolved %d/%d track(s) in %dms (concurrency=%d spacing=%dms)',
        results.filter(Boolean).length, pairs.length, Date.now() - startedAt,
        poolSize, minIntervalMs);

    return results;
}

/**
 * Check whether a stored preview URL still plays.
 *
 * Three-valued on purpose: a transient network blip must not be mistaken for a
 * dead track, or a bad afternoon would evict a chunk of the catalog.
 *
 * @param {string} previewUrl
 * @returns {Promise<boolean|null>} - true alive, false definitely gone, null unknown
 */
async function isPreviewAlive(previewUrl) {
    try {
        await axios.head(previewUrl, { timeout: REQUEST_TIMEOUT });
        return true;
    } catch (error) {
        const status = error.response && error.response.status;
        if (status && status >= 400 && status < 500) return false;
        return null;
    }
}

/**
 * Re-resolve a track by its provider id. Preview URLs rotate over time while
 * the id stays stable, so this is how a stale entry gets repaired instead of
 * being deleted.
 *
 * @param {string} providerRef
 * @returns {Promise<object|null>}
 */
async function lookupByRef(providerRef) {
    try {
        const response = await axios.get(LOOKUP_URL, {
            params: { id: providerRef },
            timeout: REQUEST_TIMEOUT
        });

        const results = response.data && response.data.results;
        if (!results || results.length === 0) return null;

        return normalizeTrack(results[0]);
    } catch (error) {
        return null;
    }
}

module.exports = {
    getRandomSongs,
    searchAndGetPreview,
    searchAndGetPreviewMany,
    isPreviewAlive,
    lookupByRef,
    normalizeTrack,
    PROVIDER
};
