/**
 * Unit tests for env - numeric settings from the environment
 */

const { numberFromEnv } = require('../../utils/env');

describe('numberFromEnv()', () => {
    const KEY = 'TEST_NUMERIC_SETTING';

    afterEach(() => {
        delete process.env[KEY];
    });

    test('reads a configured value', () => {
        process.env[KEY] = '250';
        expect(numberFromEnv(KEY, 10)).toBe(250);
    });

    test('honours a configured zero', () => {
        // The `Number(x) || fallback` shorthand would silently return 10 here,
        // ignoring a deliberate "no delay" setting
        process.env[KEY] = '0';
        expect(numberFromEnv(KEY, 10)).toBe(0);
    });

    test('falls back when unset or empty', () => {
        expect(numberFromEnv(KEY, 10)).toBe(10);
        process.env[KEY] = '';
        expect(numberFromEnv(KEY, 10)).toBe(10);
    });

    test('falls back on a non-numeric value rather than yielding NaN', () => {
        process.env[KEY] = 'soon';
        expect(numberFromEnv(KEY, 10)).toBe(10);
    });

    test('accepts negative and fractional values', () => {
        process.env[KEY] = '-1';
        expect(numberFromEnv(KEY, 10)).toBe(-1);
        process.env[KEY] = '0.5';
        expect(numberFromEnv(KEY, 10)).toBe(0.5);
    });
});
