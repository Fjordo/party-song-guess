/**
 * Unit tests for aiService functions
 * Tests Google Gemini AI integration with mocked API
 */

// Mock @google/generative-ai BEFORE importing anything else
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn();

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel
    }))
  };
});

// Import AFTER mock is set up
const { getSongListFromAI } = require('../../services/aiService');

describe('aiService - Google Gemini AI Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent
    });
  });

  describe('getSongListFromAI()', () => {
    test('should return array of songs with artist and title', async () => {
      // Mock successful Gemini response
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Oasis', title: 'Wonderwall' },
            { artist: 'Blur', title: 'Song 2' },
            { artist: 'Radiohead', title: 'Creep' }
          ])
        }
      });

      const result = await getSongListFromAI({
        genres: ['rock', 'britpop'],
        decade: '1990s',
        language: 'English',
        difficulty: 'easy',
        count: 3
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);

      // Verify format of returned songs
      result.forEach(song => {
        expect(song).toHaveProperty('artist');
        expect(song).toHaveProperty('title');
        expect(typeof song.artist).toBe('string');
        expect(typeof song.title).toBe('string');
      });
    });

    test('should request 30% more songs than count parameter', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Artist 1', title: 'Song 1' }
          ])
        }
      });

      await getSongListFromAI({
        genres: ['pop'],
        decade: '2000s',
        language: 'English',
        difficulty: 'hard',
        count: 10
      });

      // Verify generateContent was called
      expect(mockGenerateContent).toHaveBeenCalled();

      // Extract the prompt to verify it requests 13 songs (10 * 1.3 = 13)
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs).toContain('13'); // Math.ceil(10 * 1.3) = 13
    });

    test('should include all parameters in prompt', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Pino Daniele', title: 'Je so\' pazzo' }
          ])
        }
      });

      await getSongListFromAI({
        genres: ['italian pop', 'blues'],
        decade: '1980s',
        language: 'Italian',
        difficulty: 'hard',
        count: 5
      });

      // Verify prompt includes all parameters
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('italian pop');
      expect(prompt).toContain('blues');
      expect(prompt).toContain('1980s');
      expect(prompt).toContain('Italian');
      expect(prompt).toContain('Canzoni meno note'); // Hard difficulty
    });

    test('should handle easy difficulty in prompt', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'The Beatles', title: 'Hey Jude' }
          ])
        }
      });

      await getSongListFromAI({
        genres: ['rock'],
        decade: '1960s',
        language: 'English',
        difficulty: 'easy',
        count: 5
      });

      // Verify prompt mentions commercial hits for easy mode
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Grandi successi commerciali');
    });

    test('should configure Gemini model with correct parameters', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([{ artist: 'Artist', title: 'Song' }])
        }
      });

      await getSongListFromAI({
        genres: ['pop'],
        decade: '2020s',
        language: null,
        difficulty: 'easy',
        count: 5
      });

      // Verify getGenerativeModel was called with correct config
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-3-flash-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      });
    });

    test('should handle JSON parsing errors and return empty array', async () => {
      // Mock malformed JSON response
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'This is not valid JSON [{'
        }
      });

      const result = await getSongListFromAI({
        genres: ['pop'],
        decade: '2020s',
        language: 'English',
        difficulty: 'easy',
        count: 5
      });

      expect(result).toEqual([]);
    });

    test('should handle API errors and return empty array', async () => {
      // Mock API error
      mockGenerateContent.mockRejectedValue(new Error('API Error: Rate limit exceeded'));

      const result = await getSongListFromAI({
        genres: ['rock'],
        decade: '1990s',
        language: 'English',
        difficulty: 'hard',
        count: 10
      });

      expect(result).toEqual([]);
    });

    test('should handle network errors gracefully', async () => {
      // Mock network timeout
      mockGenerateContent.mockRejectedValue(new Error('Network timeout'));

      const result = await getSongListFromAI({
        genres: ['jazz'],
        decade: '1950s',
        language: null,
        difficulty: 'easy',
        count: 8
      });

      expect(result).toEqual([]);
    });

    test('should handle null/undefined parameters in prompt', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Artist', title: 'Song' }
          ])
        }
      });

      await getSongListFromAI({
        genres: ['pop'],
        decade: null,
        language: null,
        difficulty: 'easy',
        count: 5
      });

      // Verify prompt handles nulls with "Qualsiasi"
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Qualsiasi'); // Should appear twice for decade and language
    });

    test('should handle empty response array', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([])
        }
      });

      const result = await getSongListFromAI({
        genres: ['unknowngenre'],
        decade: '2030s',
        language: 'Klingon',
        difficulty: 'easy',
        count: 5
      });

      expect(result).toEqual([]);
    });

    test('should return array even with unexpected response format', async () => {
      // Mock response with unexpected structure (e.g., missing properties)
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Complete Song' },
            { title: 'Missing Artist' },
            { artist: 'Valid', title: 'Song' }
          ])
        }
      });

      const result = await getSongListFromAI({
        genres: ['pop'],
        decade: '2020s',
        language: 'English',
        difficulty: 'easy',
        count: 3
      });

      // Should still return the array (even with incomplete objects)
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
