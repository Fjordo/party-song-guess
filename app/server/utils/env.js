/**
 * Read a numeric setting from the environment.
 *
 * The usual `Number(process.env.X) || fallback` shorthand silently discards a
 * deliberately configured `0` — which matters here, since 0 is a meaningful
 * value for several catalog knobs (no delay between calls, no boot delay,
 * measured difficulty from the first play).
 *
 * @param {string} name - Environment variable name
 * @param {number} fallback - Value to use when unset or not a number
 * @returns {number}
 */
function numberFromEnv(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return fallback;

    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

module.exports = { numberFromEnv };
