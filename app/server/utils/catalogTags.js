/**
 * Catalog tagging vocabulary and pure helpers.
 *
 * Single source of truth for the game setting whitelists: they used to be
 * duplicated inline in index.js and must stay in sync with the client
 * (app/client/src/components/Lobby.jsx) or options become unselectable.
 */

// Validation whitelists — '' means "any" and is accepted by the start_game payload.
const ALLOWED_GENRES = new Set(['pop', 'rock', 'hiphop', 'rap', 'trap', 'dance', 'jazz', 'metal', 'indie', 'electronic', 'rnb']);
const ALLOWED_DECADES = new Set(['50s', '60s', '70s', '80s', '90s', '2000s', '2010s', '2020s', '']);
const ALLOWED_LANGUAGES = new Set(['it', 'en', 'es', '']);
const ALLOWED_DIFFICULTIES = new Set(['easy', 'hard']);

// Enumerable values (no "any" placeholder) used to build the bucket space.
const GENRES = [...ALLOWED_GENRES];
const DECADES = ['50s', '60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
const LANGUAGES = ['it', 'en', 'es'];
const DIFFICULTIES = [...ALLOWED_DIFFICULTIES];

// Album/collection names that mean the release date is not the song's original date.
const REISSUE_PATTERN = /remaster|greatest hits|the best|best of|anthology|deluxe|collection|live at|\bhits\b/i;

/**
 * Extract the release year from a provider date string.
 *
 * Deliberately regex-based rather than `new Date()`: parsing
 * '1969-01-01T00:00:00Z' as a Date and reading getFullYear() yields 1968 in
 * negative UTC offsets, which would make results machine-dependent.
 *
 * @param {string} releaseDate - Raw date string, ISO-like
 * @returns {number|null} - Four digit year, or null if unparsable
 */
function yearFromReleaseDate(releaseDate) {
    if (typeof releaseDate !== 'string') return null;
    const match = /^(\d{4})/.exec(releaseDate.trim());
    return match ? Number(match[1]) : null;
}

/**
 * Map a year onto one of the allowed decade tags.
 * Years before 1950 are out of the game's vocabulary; years past 2029 clamp to '2020s'.
 *
 * @param {number|null} year
 * @returns {string|null} - A value from DECADES, or null
 */
function decadeFromYear(year) {
    if (!Number.isFinite(year) || year < 1950) return null;
    if (year < 2000) return `${Math.floor((year - 1900) / 10) * 10}s`;
    if (year >= 2020) return '2020s';
    return year < 2010 ? '2000s' : '2010s';
}

/**
 * Whether an album name suggests a reissue, so its release date should not be
 * trusted as the song's original year.
 *
 * @param {string|null} album
 * @returns {boolean}
 */
function isLikelyReissue(album) {
    return typeof album === 'string' && REISSUE_PATTERN.test(album);
}

/**
 * Normalize a title or artist for identity comparison: strips accents,
 * parenthesised qualifiers ("(Remastered 2009)"), "feat." suffixes and punctuation.
 *
 * @param {string} value
 * @returns {string}
 */
function slug(value) {
    if (typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\bfeat\.?\b.*$/g, '')
        // Apostrophes join the word rather than split it, so "Let's" and "Lets"
        // are one song. Everything else becomes a separator.
        .replace(/['‘’´`]/g, '')
        // Unicode-aware: \w is ASCII-only, which would erase Korean, Japanese,
        // Cyrillic, Greek... titles entirely and collapse every song by the same
        // artist onto one dedupe key.
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Identity key for a song across providers and editions. Two different provider
 * ids (original pressing vs. remaster) collapse onto the same key.
 *
 * Returns null when the title carries no letters or digits at all (a title made
 * only of symbols). Callers must fall back to the provider id in that case:
 * an empty title part would merge every such song by the same artist into one.
 *
 * @param {string} artist
 * @param {string} title
 * @returns {string|null}
 */
function dedupeKey(artist, title) {
    const titleSlug = slug(title);
    if (!titleSlug) return null;
    return `${slug(artist)}|${titleSlug}`;
}

/**
 * Serialize a catalog bucket to a stable string key.
 * Null/empty segments are kept as empty strings so the shape is fixed.
 *
 * @param {{genre: string, decade: ?string, difficulty: string, language: ?string}} bucket
 * @returns {string} - e.g. 'rock|90s|easy|en'
 */
function bucketKey({ genre, decade, difficulty, language }) {
    return [genre || '', decade || '', difficulty || '', language || ''].join('|');
}

/**
 * Inverse of bucketKey. Empty segments come back as null.
 *
 * @param {string} key
 * @returns {{genre: ?string, decade: ?string, difficulty: ?string, language: ?string}}
 */
function parseBucketKey(key) {
    const [genre, decade, difficulty, language] = String(key).split('|');
    return {
        genre: genre || null,
        decade: decade || null,
        difficulty: difficulty || null,
        language: language || null
    };
}

/**
 * Fisher-Yates shuffle returning a new array.
 *
 * @param {Array} array
 * @returns {Array}
 */
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

module.exports = {
    ALLOWED_GENRES,
    ALLOWED_DECADES,
    ALLOWED_LANGUAGES,
    ALLOWED_DIFFICULTIES,
    GENRES,
    DECADES,
    LANGUAGES,
    DIFFICULTIES,
    yearFromReleaseDate,
    decadeFromYear,
    isLikelyReissue,
    slug,
    dedupeKey,
    bucketKey,
    parseBucketKey,
    shuffle
};
