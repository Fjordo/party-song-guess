/**
 * Minimal levelled logger.
 *
 * The server runs on a 256mb machine that scales to zero, so this stays
 * dependency-free and writes to the console: on Fly that is exactly what
 * `fly logs` shows.
 *
 * Set LOG_LEVEL=debug to see the reasoning behind playlist selection, catalog
 * growth and round transitions. The default is `info`, so debug output costs
 * nothing in production.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

let threshold = resolveLevel(process.env.LOG_LEVEL);

function resolveLevel(name) {
    const key = String(name || '').toLowerCase();
    return LEVELS[key] === undefined ? LEVELS.info : LEVELS[key];
}

/**
 * Change the active level at runtime (used by tests, and handy from a REPL).
 * @param {string} name - error | warn | info | debug
 */
function setLevel(name) {
    threshold = resolveLevel(name);
}

function currentLevel() {
    return Object.keys(LEVELS).find(key => LEVELS[key] === threshold);
}

function write(level, scope, args) {
    if (LEVELS[level] > threshold) return;

    const prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}]`;
    const sink = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);

    // console treats only its FIRST argument as a format string, so the prefix
    // has to be merged into the caller's message — otherwise placeholders like
    // %s and %d would be printed literally.
    if (typeof args[0] === 'string') {
        sink(`${prefix} ${args[0]}`, ...args.slice(1));
    } else {
        sink(prefix, ...args);
    }
}

/**
 * Build a logger bound to a subsystem name.
 *
 * @param {string} scope - Appears in every line, e.g. 'catalog' or 'game'
 */
function createLogger(scope) {
    return {
        error: (...args) => write('error', scope, args),
        warn: (...args) => write('warn', scope, args),
        info: (...args) => write('info', scope, args),
        debug: (...args) => write('debug', scope, args),
        /**
         * Guard for debug output that is expensive to build. Cheap arguments
         * can just be passed to debug() directly.
         */
        isDebug: () => threshold >= LEVELS.debug
    };
}

module.exports = { createLogger, setLevel, currentLevel, LEVELS };
