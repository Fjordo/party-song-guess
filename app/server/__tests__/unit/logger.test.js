/**
 * Unit tests for logger - levelled console output
 */

const { createLogger, setLevel, currentLevel, LEVELS } = require('../../utils/logger');

describe('logger', () => {
    let log, warn, error;

    beforeEach(() => {
        log = jest.spyOn(console, 'log').mockImplementation(() => {});
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        error = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        setLevel('info');
        jest.restoreAllMocks();
    });

    test('defaults to info, so debug costs nothing in production', () => {
        expect(currentLevel()).toBe('info');

        const logger = createLogger('test');
        logger.debug('invisible');
        logger.info('visible');

        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0].join(' ')).toContain('visible');
    });

    test('emits debug output once the level allows it', () => {
        setLevel('debug');
        createLogger('catalog').debug('why this playlist');

        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0][0]).toContain('DEBUG');
        expect(log.mock.calls[0][0]).toContain('[catalog]');
    });

    test('routes each level to the matching console method', () => {
        setLevel('debug');
        const logger = createLogger('test');

        logger.error('e');
        logger.warn('w');
        logger.info('i');
        logger.debug('d');

        expect(error).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledTimes(2);
    });

    test('silences everything below the configured level', () => {
        setLevel('error');
        const logger = createLogger('test');

        logger.warn('w');
        logger.info('i');
        logger.debug('d');
        logger.error('e');

        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
    });

    test('falls back to info for an unknown or missing level', () => {
        setLevel('verbose');
        expect(currentLevel()).toBe('info');
        setLevel(undefined);
        expect(currentLevel()).toBe('info');
    });

    test('isDebug() lets callers skip expensive formatting', () => {
        const logger = createLogger('test');
        expect(logger.isDebug()).toBe(false);

        setLevel('debug');
        expect(logger.isDebug()).toBe(true);
    });

    test('prefixes every line with a timestamp, level and scope', () => {
        createLogger('game').info('room ABC123 started');

        expect(log.mock.calls[0][0])
            .toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+INFO\s+\[game\] room ABC123 started$/);
    });

    test('placeholders still work, because console only formats its first argument', () => {
        const { format } = require('util');
        createLogger('game').info('room %s served %d songs', 'ABC123', 7);

        // Reproduce what console itself does with the captured arguments
        expect(format(...log.mock.calls[0])).toContain('room ABC123 served 7 songs');
    });

    test('tolerates a non-string first argument', () => {
        createLogger('game').info({ roomId: 'ABC123' });
        expect(log.mock.calls[0][1]).toEqual({ roomId: 'ABC123' });
    });

    test('exposes the level ordering', () => {
        expect(LEVELS.error).toBeLessThan(LEVELS.debug);
    });
});
