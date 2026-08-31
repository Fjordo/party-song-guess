/**
 * Unit tests for difficultyStats - measured difficulty from play statistics
 */

const { computeEffectiveDifficulty } = require('../../utils/difficultyStats');

const OPTS = { minPlays: 5, easyRate: 0.55, hardRate: 0.30, msThreshold: 12000 };

describe('difficultyStats - computeEffectiveDifficulty()', () => {
    test('returns null below the minimum number of plays', () => {
        // Not enough evidence: the AI-assigned difficulty must keep standing
        expect(computeEffectiveDifficulty({ playCount: 4, guessCount: 4, totalGuessMs: 4000 }, OPTS))
            .toBeNull();
    });

    test('returns a verdict exactly at the minimum number of plays', () => {
        expect(computeEffectiveDifficulty({ playCount: 5, guessCount: 5, totalGuessMs: 5000 }, OPTS))
            .toBe('easy');
    });

    test('a frequently guessed song is easy', () => {
        expect(computeEffectiveDifficulty({ playCount: 10, guessCount: 8, totalGuessMs: 200000 }, OPTS))
            .toBe('easy');
    });

    test('a rarely guessed song is hard', () => {
        expect(computeEffectiveDifficulty({ playCount: 10, guessCount: 2, totalGuessMs: 4000 }, OPTS))
            .toBe('hard');
    });

    test('a never guessed song is hard, without dividing by zero', () => {
        expect(computeEffectiveDifficulty({ playCount: 10, guessCount: 0, totalGuessMs: 0 }, OPTS))
            .toBe('hard');
    });

    test('boundary rates resolve without falling through', () => {
        // exactly easyRate
        expect(computeEffectiveDifficulty({ playCount: 20, guessCount: 11, totalGuessMs: 0 }, OPTS))
            .toBe('easy');
        // exactly hardRate
        expect(computeEffectiveDifficulty({ playCount: 10, guessCount: 3, totalGuessMs: 0 }, OPTS))
            .toBe('hard');
    });

    describe('ambiguous middle band', () => {
        // rate 0.4: between hardRate and easyRate, so response time decides
        test('fast answers make it easy', () => {
            expect(computeEffectiveDifficulty(
                { playCount: 10, guessCount: 4, totalGuessMs: 4 * 5000 }, OPTS
            )).toBe('easy');
        });

        test('slow answers make it hard', () => {
            expect(computeEffectiveDifficulty(
                { playCount: 10, guessCount: 4, totalGuessMs: 4 * 20000 }, OPTS
            )).toBe('hard');
        });

        test('exactly at the time threshold counts as easy', () => {
            expect(computeEffectiveDifficulty(
                { playCount: 10, guessCount: 4, totalGuessMs: 4 * 12000 }, OPTS
            )).toBe('easy');
        });
    });

    test('tolerates missing or malformed stats', () => {
        expect(computeEffectiveDifficulty({}, OPTS)).toBeNull();
        expect(computeEffectiveDifficulty(null, OPTS)).toBeNull();
        expect(computeEffectiveDifficulty({ playCount: 'x', guessCount: null }, OPTS)).toBeNull();
    });

    test('uses built-in defaults when no options are given', () => {
        expect(computeEffectiveDifficulty({ playCount: 1, guessCount: 1, totalGuessMs: 10 }))
            .toBeNull();
        expect(computeEffectiveDifficulty({ playCount: 10, guessCount: 9, totalGuessMs: 10 }))
            .toBe('easy');
    });
});
