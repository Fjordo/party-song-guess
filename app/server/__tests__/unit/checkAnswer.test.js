/**
 * Unit tests for checkAnswer() function
 * Tests the new robust answer validation algorithm:
 * 1. Exact match (after normalization)
 * 2. Token overlap (≥80% of significant words)
 * 3. Levenshtein distance (≥0.75 similarity for typos)
 * 4. Stopword filtering
 */

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
  });

  describe('Token Overlap (≥80% threshold)', () => {
    test('should accept when significant words match', () => {
      // "The Beatles" -> "Beatles" (The is stopword). Match 100%.
      expect(checkAnswer('Beatles', 'The Beatles')).toBe(true);
      expect(checkAnswer('The Beatles', 'Beatles')).toBe(true);
    });

    test('should reject weak partial matches (below 80%)', () => {
      // "Beautiful Song" -> "Beautiful" (1/2 tokens = 50%) -> FAIL
      expect(checkAnswer('Beautiful', 'Beautiful Song')).toBe(false);
      // "Teen Spirit" -> "Smells Like Teen Spirit" (2/4 tokens = 50%) -> FAIL
      // Note: Unless "Smells" and "Like" are stopwords? "like" might differ, but assuming not all are stopwords.
      expect(checkAnswer('Teen Spirit', 'Smells Like Teen Spirit')).toBe(false);
    });

    test('should reject incorrect partial matches', () => {
      // "Stones" -> "The Rolling Stones" (1/2 tokens = 50%) -> FAIL
      expect(checkAnswer('Stones', 'The Rolling Stones')).toBe(false);
    });
  });

  describe('International / Non-English Songs', () => {
    test('should match French with accents normalized', () => {
      expect(checkAnswer('Hélène', 'Helene')).toBe(true);
      expect(checkAnswer('Ça Plane Pour Moi', 'Ca Plane Pour Moi')).toBe(true);
    });

    test('should match Spanish with accents', () => {
      expect(checkAnswer('Bésame Mucho', 'Besame Mucho')).toBe(true);
      expect(checkAnswer('Corazón Espinado', 'Corazon Espinado')).toBe(true);
    });

    test('should match German umlauts', () => {
      // "99 Luftballons" is standard, but if someone typed "Luftballōns" (fake accent) it should match "Luftballons"
      expect(checkAnswer('Mädchen', 'Madchen')).toBe(true);
    });

    test('should match Italian accented words', () => {
      expect(checkAnswer('Città Vuota', 'Citta Vuota')).toBe(true);
      expect(checkAnswer('Perchè', 'Perche')).toBe(true);
    });
  });

  describe('Levenshtein distance (typo handling)', () => {
    test('should accept small typos (≥75% similarity)', () => {
      // 0.75 threshold allows 1 error in 4 chars
      expect(checkAnswer('Sonf', 'Song')).toBe(true); // 3/4 = 75%
      expect(checkAnswer('Lovee', 'Love')).toBe(true); // 4/5 = 80%
    });

    test('should accept minor spelling errors', () => {
      expect(checkAnswer('Wonderwal', 'Wonderwall')).toBe(true);
      expect(checkAnswer('Beatls', 'Beatles')).toBe(true);
    });

    test('should reject strings with too many differences', () => {
      expect(checkAnswer('Apple', 'Orange')).toBe(false);
      // 'Snog' vs 'Song' -> dist 2 (transposition is 2 edits in Levenshtein usually, or 1 swap). 
      // Standard Levenshtein: substitution n->o (1), o->n (1) = 2. 
      // Len 4. Sim 0.5. Fail.
      expect(checkAnswer('Snog', 'Song')).toBe(false);
    });
  });

  describe('Regression Tests (The "Single Letter" Bug)', () => {
    test('should reject single characters that are not exact matches', () => {
      expect(checkAnswer('a', 'Bohemian Rhapsody')).toBe(false);
      expect(checkAnswer('e', 'Bohemian Rhapsody')).toBe(false);
    });

    test('should reject short substrings', () => {
      expect(checkAnswer('Rhapsody', 'Bohemian Rhapsody')).toBe(false); // 50% match < 80%
    });
  });
});
