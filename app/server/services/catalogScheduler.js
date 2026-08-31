const catalogBuilder = require('./catalogBuilder');
const { numberFromEnv } = require('../utils/env');
const { createLogger } = require('../utils/logger');

const log = createLogger('scheduler');

// Long enough not to compete with the player whose visit just woke the machine.
const BOOT_DELAY_MS = numberFromEnv('CATALOG_BOOT_DELAY_MS', 20000);

let timer = null;

/**
 * Schedule the one catalog run this process will do.
 *
 * There is deliberately no periodic timer. The server is meant to sleep when
 * nobody is playing, so a weekly interval would almost never fire; instead
 * every wake-up refreshes the catalog a little. What keeps that from running
 * away is not a clock but the AI usage limit itself: once it is reached, a run
 * stops immediately and cheaply (see catalogBuilder.runRefresh).
 *
 * @param {object} [options] - Injectable dependencies, for tests
 */
function start(options = {}) {
    if (timer) return;

    const runRefresh = options.runRefresh || catalogBuilder.runRefresh;
    const runRevalidation = options.runRevalidation || catalogBuilder.runRevalidation;
    const delayMs = options.delayMs === undefined ? BOOT_DELAY_MS : options.delayMs;
    const schedule = options.setTimeout || setTimeout;

    log.debug('catalog run scheduled in %dms', delayMs);

    timer = schedule(async () => {
        timer = null;
        log.debug('catalog run starting');

        // The two steps are independent: a failing refresh (no AI budget, no
        // network) must not stop the upkeep pass, which costs nothing.
        try {
            await runRefresh();
        } catch (error) {
            log.error('catalog refresh failed:', error.message);
        }

        try {
            await runRevalidation();
        } catch (error) {
            log.error('catalog revalidation failed:', error.message);
        }
    }, delayMs);

    // Never keep the process (or a test runner) alive just for this
    if (timer && typeof timer.unref === 'function') timer.unref();
}

function stop(options = {}) {
    if (!timer) return;
    const cancel = options.clearTimeout || clearTimeout;
    cancel(timer);
    timer = null;
    log.debug('pending catalog run cancelled');
}

module.exports = { start, stop, BOOT_DELAY_MS };
