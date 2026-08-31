/**
 * Unit tests for catalogTags - vocabulary and pure tagging helpers
 */

const {
    ALLOWED_GENRES,
    ALLOWED_DECADES,
    GENRES,
    DECADES,
    yearFromReleaseDate,
    decadeFromYear,
    isLikelyReissue,
    slug,
    dedupeKey,
    bucketKey,
    parseBucketKey,
    shuffle
} = require('../../utils/catalogTags');

describe('catalogTags - vocabulary', () => {
    test('whitelists keep the values the client offers', () => {
        expect(ALLOWED_GENRES.has('pop')).toBe(true);
        expect(ALLOWED_GENRES.has('rnb')).toBe(true);
        expect(ALLOWED_GENRES.size).toBe(11);
        // '' means "any decade" and must stay accepted by validation
        expect(ALLOWED_DECADES.has('')).toBe(true);
    });

    test('enumerable lists exclude the "any" placeholder', () => {
        expect(GENRES).toHaveLength(11);
        expect(DECADES).toHaveLength(8);
        expect(DECADES).not.toContain('');
    });
});

describe('catalogTags - yearFromReleaseDate()', () => {
    test('extracts the year from an ISO timestamp', () => {
        expect(yearFromReleaseDate('1995-10-02T07:00:00Z')).toBe(1995);
    });

    test('does not shift the year across timezones', () => {
        // A Date-based implementation returns 1968 here in negative UTC offsets
        expect(yearFromReleaseDate('1969-01-01T00:00:00Z')).toBe(1969);
    });

    test('accepts a bare year', () => {
        expect(yearFromReleaseDate('2009')).toBe(2009);
    });

    test.each([['', null], ['abcd', null], ['not a date', null]])(
        'returns null for unparsable input %p',
        (input, expected) => {
            expect(yearFromReleaseDate(input)).toBe(expected);
        }
    );

    test('returns null for non-string input', () => {
        expect(yearFromReleaseDate(undefined)).toBeNull();
        expect(yearFromReleaseDate(null)).toBeNull();
        expect(yearFromReleaseDate(1995)).toBeNull();
    });
});

describe('catalogTags - decadeFromYear()', () => {
    test.each([
        [1949, null],
        [1950, '50s'],
        [1959, '50s'],
        [1969, '60s'],
        [1985, '80s'],
        [1999, '90s'],
        [2000, '2000s'],
        [2009, '2000s'],
        [2010, '2010s'],
        [2019, '2010s'],
        [2020, '2020s'],
        [2031, '2020s']
    ])('maps %p to %p', (year, expected) => {
        expect(decadeFromYear(year)).toBe(expected);
    });

    test('every produced decade is part of the vocabulary', () => {
        for (let year = 1950; year <= 2029; year++) {
            expect(DECADES).toContain(decadeFromYear(year));
        }
    });

    test('returns null when the year is missing or not a number', () => {
        expect(decadeFromYear(null)).toBeNull();
        expect(decadeFromYear(undefined)).toBeNull();
        expect(decadeFromYear(NaN)).toBeNull();
    });
});

describe('catalogTags - isLikelyReissue()', () => {
    test.each([
        'Morning Glory (Remastered)',
        'Greatest Hits',
        'The Best of Queen',
        'Anthology 2',
        'Nevermind (Deluxe Edition)',
        'Live at Wembley'
    ])('flags %p as a reissue', (album) => {
        expect(isLikelyReissue(album)).toBe(true);
    });

    test.each(['Definitely Maybe', 'Thriller', ''])('does not flag %p', (album) => {
        expect(isLikelyReissue(album)).toBe(false);
    });

    test('handles a missing album name', () => {
        expect(isLikelyReissue(null)).toBe(false);
        expect(isLikelyReissue(undefined)).toBe(false);
    });
});

describe('catalogTags - slug() and dedupeKey()', () => {
    test('strips accents and punctuation', () => {
        expect(slug('Je so\u0027 pazzo')).toBe('je so pazzo');
        expect(slug('Perch\u00e9 Lo Fai?')).toBe('perche lo fai');
    });

    test('drops parenthesised qualifiers and feat. suffixes', () => {
        expect(slug('Wonderwall (Remastered 2009)')).toBe('wonderwall');
        expect(slug('Despacito feat. Justin Bieber')).toBe('despacito');
    });

    test('treats an apostrophe as part of the word, not a separator', () => {
        // Otherwise "Let's Get It On" and "Lets Get It On" would be two songs
        expect(slug("Let's Get It On")).toBe(slug('Lets Get It On'));
        expect(slug('Je so’ pazzo')).toBe(slug("Je so' pazzo"));
    });

    test('keeps non-Latin scripts instead of erasing them', () => {
        // An ASCII-only \w would reduce these to '' and make every song by the
        // same artist share one dedupe key
        expect(slug('작은 것들을 위한 시')).not.toBe('');
        expect(slug('上を向いて歩こう')).not.toBe('');
        expect(slug('Кино')).not.toBe('');
        expect(dedupeKey('BTS', '작은 것들을 위한 시'))
            .not.toBe(dedupeKey('BTS', '피 땀 눈물'));
    });

    test('has no usable key when the title carries no letters or digits', () => {
        // The caller must fall back to the provider id rather than merge these
        expect(dedupeKey('Artist', '!!!')).toBeNull();
        expect(dedupeKey('Artist', '')).toBeNull();
    });

    test('returns an empty string for non-string input', () => {
        expect(slug(null)).toBe('');
        expect(slug(42)).toBe('');
    });

    test('the same song in different editions collapses onto one key', () => {
        expect(dedupeKey('Oasis', 'Wonderwall (Remastered 2009)'))
            .toBe(dedupeKey('Oasis', 'Wonderwall'));
    });

    test('different songs keep different keys', () => {
        expect(dedupeKey('Oasis', 'Wonderwall')).not.toBe(dedupeKey('Blur', 'Wonderwall'));
        expect(dedupeKey('Oasis', 'Wonderwall')).not.toBe(dedupeKey('Oasis', 'Supersonic'));
    });
});

describe('catalogTags - bucketKey() and parseBucketKey()', () => {
    test('serializes a fully specified bucket', () => {
        expect(bucketKey({ genre: 'rock', decade: '90s', difficulty: 'easy', language: 'en' }))
            .toBe('rock|90s|easy|en');
    });

    test('keeps the shape fixed when segments are null', () => {
        expect(bucketKey({ genre: 'jazz', decade: null, difficulty: 'hard', language: null }))
            .toBe('jazz||hard|');
    });

    test('round-trips through parseBucketKey', () => {
        const bucket = { genre: 'indie', decade: '2000s', difficulty: 'hard', language: 'it' };
        expect(parseBucketKey(bucketKey(bucket))).toEqual(bucket);
    });

    test('empty segments come back as null', () => {
        expect(parseBucketKey('jazz||hard|')).toEqual({
            genre: 'jazz', decade: null, difficulty: 'hard', language: null
        });
    });
});

describe('catalogTags - shuffle()', () => {
    test('preserves every element without mutating the input', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8];
        const original = [...input];
        const result = shuffle(input);

        expect(input).toEqual(original);
        expect(result).toHaveLength(input.length);
        expect([...result].sort((a, b) => a - b)).toEqual(original);
    });

    test('handles empty and single-element arrays', () => {
        expect(shuffle([])).toEqual([]);
        expect(shuffle(['only'])).toEqual(['only']);
    });
});
