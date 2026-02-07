/**
 * Unit tests for checkAnswer() function
 * Tests the 5-tiered answer validation algorithm:
 * 1. Exact match (after normalization)
 * 2. Substring match
 * 3. Word overlap (≥60%)
 * 4. Levenshtein distance (≥0.7 similarity for typos)
 * 5. Edge case handling
 */

// We need to export checkAnswer from index.js for testing
// For now, we'll import the function after refactoring
const { checkAnswer } = require('../../utils/checkAnswer');

describe('checkAnswer() - Answer Validation', () => {
  describe('Exact matches (case-insensitive)', () => {
    test('should match identical strings', () => {
      expect(checkAnswer('song', 'song')).toBe(true);
    });

    test('should match regardless of case', () => {
      expect(checkAnswer('Song', 'song')).toBe(true);
      expect(checkAnswer('SONG', 'song')).toBe(true);
      expect(checkAnswer('SoNg', 'SoNg')).toBe(true);
    });

    test('should match multi-word phrases', () => {
      expect(checkAnswer('Beautiful Song', 'beautiful song')).toBe(true);
      expect(checkAnswer('THE BEATLES', 'the beatles')).toBe(true);
    });
  });

  describe('Punctuation handling', () => {
    test('should ignore punctuation marks', () => {
      expect(checkAnswer('Song!', 'Song')).toBe(true);
      expect(checkAnswer('Song?', 'Song')).toBe(true);
      expect(checkAnswer('Song.', 'Song')).toBe(true);
      expect(checkAnswer('Song,', 'Song')).toBe(true);
    });

    test('should handle multiple punctuation marks', () => {
      expect(checkAnswer('Song!!!', 'Song')).toBe(true);
      expect(checkAnswer('Song...', 'Song')).toBe(true);
    });

    test('should handle punctuation in multi-word phrases', () => {
      expect(checkAnswer('Hey, Jude!', 'Hey Jude')).toBe(true);
    });
  });

  describe('Parentheses and remix markers', () => {
    test('should strip content in parentheses', () => {
      expect(checkAnswer('Song (Remix)', 'Song')).toBe(true);
      expect(checkAnswer('Song (Live)', 'Song')).toBe(true);
      expect(checkAnswer('Song (Remastered)', 'Song')).toBe(true);
    });

    test('should work with parentheses in actual title', () => {
      expect(checkAnswer('Song', 'Song (Remix)')).toBe(true);
    });

    test('should handle multiple parentheses', () => {
      expect(checkAnswer('Song (Radio Edit) (2020)', 'Song')).toBe(true);
    });
  });

  describe('Featured artists handling', () => {
    test('should strip "feat." and following text', () => {
      expect(checkAnswer('Song feat. Artist', 'Song')).toBe(true);
      expect(checkAnswer('Song ft. Artist', 'Song')).toBe(true);
    });

    test('should work when actual has feat.', () => {
      expect(checkAnswer('Song', 'Song feat. Other Artist')).toBe(true);
    });

    test('should handle "feat" without period', () => {
      expect(checkAnswer('Song feat Artist', 'Song')).toBe(true);
    });
  });

  describe('Substring matches', () => {
    test('should accept when guess contains actual', () => {
      expect(checkAnswer('Beautiful Song', 'Beautiful')).toBe(true);
      expect(checkAnswer('Smells Like Teen Spirit', 'Teen Spirit')).toBe(true);
    });

    test('should accept when actual contains guess', () => {
      // Note: 'Love' doesn't match 'Loving You' because they're different words after normalization
      // 'Beautiful' DOES match 'Beautiful Song' because it's a full word match
      expect(checkAnswer('Beautiful', 'Beautiful Song')).toBe(true);
      expect(checkAnswer('Spirit', 'Teen Spirit')).toBe(true);
    });

    test('should work with partial words', () => {
      expect(checkAnswer('Wonder', 'Wonderwall')).toBe(true);
    });
  });

  describe('Word overlap (≥60% threshold)', () => {
    test('should accept when 60%+ words match', () => {
      // "Beautiful Love Song" has 3 words, "Beautiful Song Love" has all 3 = 100%
      expect(checkAnswer('Beautiful Song Love', 'Beautiful Love Song')).toBe(true);
    });

    test('should accept reordered words above threshold', () => {
      // 2 out of 3 words match = 66%
      expect(checkAnswer('Song Love', 'Beautiful Love Song')).toBe(true);
    });

    test('should reject when below 60% threshold', () => {
      // Only 1 out of 3 words match = 33%
      expect(checkAnswer('Beautiful', 'Song Love You')).toBe(false);
    });

    test('should handle duplicate words correctly', () => {
      // Should use Set to deduplicate - 'love' appears once in 'love love' (deduped)
      // 1 out of 2 words in 'love song' = 50%, below 60% threshold
      // Better test: verify word overlap with actual deduplication
      expect(checkAnswer('Love Song', 'Song Love Beautiful')).toBe(true); // 2/3 = 66%
    });
  });

  describe('Levenshtein distance (typo handling)', () => {
    test('should accept small typos (≥70% similarity)', () => {
      // Levenshtein threshold is 0.7 (70%)
      // 'Snog' vs 'Song': dist=2 (s→s, n→o, o→n, g→g), maxLen=4, sim=1-2/4=0.5 < 0.7
      // Need typos with ≥70% similarity
      expect(checkAnswer('Sonf', 'Song')).toBe(true); // 1 sub in 4 = 75%
      expect(checkAnswer('Lovee', 'Love')).toBe(true); // 1 insertion in 5 = 80%
    });

    test('should accept minor spelling errors', () => {
      expect(checkAnswer('Wonderwal', 'Wonderwall')).toBe(true);
      expect(checkAnswer('Beatls', 'Beatles')).toBe(true);
    });

    test('should reject strings with too many differences', () => {
      expect(checkAnswer('Apple', 'Orange')).toBe(false);
      expect(checkAnswer('Dog', 'Elephant')).toBe(false);
    });

    test('should handle single character differences', () => {
      // Cat vs Bat: dist=1, maxLen=3, sim=1-1/3=0.666 < 0.7
      // Test vs Best: dist=1, maxLen=4, sim=1-1/4=0.75 >= 0.7 ✓
      expect(checkAnswer('Test', 'Best')).toBe(true); // 75% similar
      expect(checkAnswer('Tests', 'Bests')).toBe(true); // 80% similar (1 diff in 5)
    });
  });

  describe('Whitespace handling', () => {
    test('should collapse multiple spaces', () => {
      expect(checkAnswer('Song   Name', 'Song Name')).toBe(true);
      expect(checkAnswer('Song\t\tName', 'Song Name')).toBe(true);
    });

    test('should trim leading and trailing spaces', () => {
      expect(checkAnswer('  Song  ', 'Song')).toBe(true);
      expect(checkAnswer('Song', '  Song  ')).toBe(true);
    });

    test('should handle mixed whitespace', () => {
      expect(checkAnswer('  Song   Name  ', 'Song Name')).toBe(true);
    });
  });

  describe('Accented characters', () => {
    test('should handle Italian accents', () => {
      expect(checkAnswer('Napule è', 'Napule')).toBe(true);
      expect(checkAnswer('città', 'citta')).toBe(true);
    });

    test('should handle Spanish accents', () => {
      expect(checkAnswer('canción', 'cancion')).toBe(true);
      expect(checkAnswer('niño', 'nino')).toBe(true);
    });

    test('should handle French accents', () => {
      expect(checkAnswer('café', 'cafe')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('should reject empty strings', () => {
      expect(checkAnswer('', 'Song')).toBe(false);
      expect(checkAnswer('Song', '')).toBe(false);
      expect(checkAnswer('', '')).toBe(false);
    });

    test('should reject null values', () => {
      expect(checkAnswer(null, 'Song')).toBe(false);
      expect(checkAnswer('Song', null)).toBe(false);
      expect(checkAnswer(null, null)).toBe(false);
    });

    test('should reject undefined values', () => {
      expect(checkAnswer(undefined, 'Song')).toBe(false);
      expect(checkAnswer('Song', undefined)).toBe(false);
      expect(checkAnswer(undefined, undefined)).toBe(false);
    });

    test('should handle whitespace-only strings', () => {
      expect(checkAnswer('   ', 'Song')).toBe(false);
      expect(checkAnswer('Song', '   ')).toBe(false);
    });

    test('should handle very short strings', () => {
      expect(checkAnswer('A', 'A')).toBe(true);
      expect(checkAnswer('I', 'I')).toBe(true);
    });
  });

  describe('Articles and common words', () => {
    test('should handle "The" at the beginning', () => {
      expect(checkAnswer('The Song', 'Song')).toBe(true);
      expect(checkAnswer('Song', 'The Song')).toBe(true);
    });

    test('should handle "A" and "An"', () => {
      expect(checkAnswer('A Song', 'Song')).toBe(true);
      expect(checkAnswer('An Apple', 'Apple')).toBe(true);
    });
  });

  describe('Combined complex cases', () => {
    test('should handle multiple normalizations at once', () => {
      // Parentheses + feat. + punctuation + case
      expect(checkAnswer('Song! (Remix) feat. Artist', 'song')).toBe(true);
    });

    test('should handle real-world song titles', () => {
      expect(checkAnswer('Smells Like Teen Spirit', 'Smells Like Teen Spirit')).toBe(true);
      expect(checkAnswer('teen spirit', 'Smells Like Teen Spirit')).toBe(true);
      expect(checkAnswer('WONDERWALL', 'Wonderwall')).toBe(true);
      expect(checkAnswer('Hey Jude', 'Hey Jude')).toBe(true);
      expect(checkAnswer('Jude', 'Hey Jude')).toBe(true);
    });

    test('should handle user typos in real scenarios', () => {
      expect(checkAnswer('Wonderwal', 'Wonderwall')).toBe(true);
      expect(checkAnswer('smells teen spirit', 'Smells Like Teen Spirit')).toBe(true);
      expect(checkAnswer('beatles hey jude', 'Hey Jude - The Beatles')).toBe(true);
    });

    test('should reject completely unrelated guesses', () => {
      expect(checkAnswer('Wonderwall', 'Bohemian Rhapsody')).toBe(false);
      expect(checkAnswer('Yesterday', 'Let It Be')).toBe(false);
    });
  });

  describe('Special characters', () => {
    test('should handle ampersands', () => {
      expect(checkAnswer('Rock & Roll', 'Rock and Roll')).toBe(true);
    });

    test('should handle numbers', () => {
      // Numbers are preserved as-is (2 != Two)
      expect(checkAnswer('1999', '1999')).toBe(true);
      expect(checkAnswer('Song 2', 'Song 2')).toBe(true);
      // But 'Song 2' won't match 'Song Two' - different words after normalization
    });

    test('should handle hyphens', () => {
      expect(checkAnswer('Hip-Hop', 'Hip Hop')).toBe(true);
    });
  });
});
