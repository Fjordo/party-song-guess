/**
 * Unit tests for detectLanguage() function
 * Tests heuristic-based language detection for Italian, Spanish, and English
 */

// Mock axios to prevent actual API calls
jest.mock('axios');

const musicService = require('../../services/musicService');

// Access the internal detectLanguage function
// Since it's not exported, we'll need to export it or test through the exported functions
// For now, let's test it indirectly through a small refactor

// Import directly after we export it
const { detectLanguage } = require('../../utils/languageDetection');

describe('detectLanguage() - Language Heuristic Detection', () => {
  describe('Italian detection', () => {
    test('should detect Italian from common words', () => {
      expect(detectLanguage('che bella canzone')).toBe('it');
      expect(detectLanguage('non è vero')).toBe('it');
      expect(detectLanguage('per te')).toBe('it');
    });

    test('should detect Italian from accents', () => {
      expect(detectLanguage('città')).toBe('it');
      expect(detectLanguage('è così')).toBe('it');
      expect(detectLanguage('perché')).toBe('it');
    });

    test('should detect Italian from mixed words and accents', () => {
      expect(detectLanguage('la città è bella')).toBe('it');
    });
  });

  describe('Spanish detection', () => {
    test('should detect Spanish from common words', () => {
      expect(detectLanguage('que bueno')).toBe('es');
      expect(detectLanguage('para ti')).toBe('es');
      expect(detectLanguage('el amor')).toBe('es');
    });

    test('should detect Spanish from accents', () => {
      expect(detectLanguage('canción')).toBe('es');
      expect(detectLanguage('corazón')).toBe('es');
      expect(detectLanguage('niño')).toBe('es');
    });

    test('should detect Spanish from ñ character', () => {
      expect(detectLanguage('español')).toBe('es');
      expect(detectLanguage('mañana')).toBe('es');
    });
  });

  describe('English detection', () => {
    test('should detect English from common words', () => {
      expect(detectLanguage('the song')).toBe('en');
      expect(detectLanguage('you and me')).toBe('en');
      expect(detectLanguage('love in the air')).toBe('en');
    });

    test('should detect English from multiple hint words', () => {
      expect(detectLanguage('the love of you')).toBe('en');
    });
  });

  describe('Mixed language handling', () => {
    test('should return dominant language when multiple languages present', () => {
      // More English words
      expect(detectLanguage('the love and you')).toBe('en'); // 4 en words
    });

    test('should handle close scores by returning highest', () => {
      // When scores are equal, returns first in sorted order
      const result = detectLanguage('que the para');
      expect(['es', 'en']).toContain(result);
    });
  });

  describe('Edge cases', () => {
    test('should return null for empty string', () => {
      expect(detectLanguage('')).toBe(null);
    });

    test('should return null for null input', () => {
      expect(detectLanguage(null)).toBe(null);
    });

    test('should return null for undefined input', () => {
      expect(detectLanguage(undefined)).toBe(null);
    });

    test('should return null when no language hints found', () => {
      expect(detectLanguage('xyz abc def')).toBe(null);
      expect(detectLanguage('random words here')).toBe(null);
    });

    test('should handle very short strings', () => {
      expect(detectLanguage('the')).toBe('en');
      expect(detectLanguage('que')).toBe('es');
      expect(detectLanguage('che')).toBe('it');
    });

    test('should be case insensitive', () => {
      expect(detectLanguage('THE SONG')).toBe('en');
      expect(detectLanguage('QUE BUENO')).toBe('es');
      expect(detectLanguage('CHE BELLA')).toBe('it');
    });
  });

  describe('Real-world song titles', () => {
    test('should detect Italian songs', () => {
      expect(detectLanguage('Napule è')).toBe('it');
      expect(detectLanguage('Nel blu dipinto di blu')).toBe('it');
    });

    test('should detect Spanish songs', () => {
      // 'la' is not in hints, but 'las', 'los', 'el', 'de' are
      expect(detectLanguage('El Condor Pasa')).toBe('es'); // 'el' is in hints
      expect(detectLanguage('Bailando')).toBe(null); // No hints, just one word
    });

    test('should detect English songs', () => {
      expect(detectLanguage('Love Me Do')).toBe('en');
      expect(detectLanguage('The Sound of Silence')).toBe('en');
    });
  });
});
