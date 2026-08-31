/**
 * Data-driven difficulty, derived from how players actually performed on a song.
 *
 * The difficulty attached at discovery time is only what the AI claimed when it
 * suggested the track — it is never verified. Once a song has been played enough
 * times, the measured guess rate (and, in the ambiguous middle band, how long
 * players took) is a far better signal, and overrides the claim.
 */

const { numberFromEnv } = require('./env');

const DEFAULTS = {
    minPlays: numberFromEnv('DIFFICULTY_MIN_PLAYS', 5),
    easyRate: 0.55,
    hardRate: 0.30,
    msThreshold: numberFromEnv('DIFFICULTY_MS_THRESHOLD', 12000)
};

/**
 * Compute the effective difficulty of a song from its play statistics.
 *
 * @param {{playCount: number, guessCount: number, totalGuessMs: number}} stats
 * @param {object} [options] - Overrides for the thresholds (used by tests)
 * @returns {string|null} - 'easy', 'hard', or null when there is not enough data
 *                          (null means "fall back to the AI-assigned difficulty")
 */
function computeEffectiveDifficulty(stats, options = {}) {
    const { minPlays, easyRate, hardRate, msThreshold } = { ...DEFAULTS, ...options };

    const playCount = Number(stats && stats.playCount) || 0;
    const guessCount = Number(stats && stats.guessCount) || 0;
    const totalGuessMs = Number(stats && stats.totalGuessMs) || 0;

    // Not enough evidence yet: let the AI-assigned tag stand.
    if (playCount < minPlays) return null;

    const guessRate = guessCount / playCount;
    if (guessRate >= easyRate) return 'easy';
    if (guessRate <= hardRate) return 'hard';

    // Ambiguous band: nobody is dominating it, so let response time decide.
    // guessCount cannot be 0 here (that would be rate 0, caught above).
    return (totalGuessMs / guessCount) <= msThreshold ? 'easy' : 'hard';
}

module.exports = { computeEffectiveDifficulty, DEFAULTS };
