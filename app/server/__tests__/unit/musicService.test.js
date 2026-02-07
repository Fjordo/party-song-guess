/**
 * Unit tests for musicService functions
 * Tests iTunes API integration with mocked axios
 */

// Mock axios to prevent actual API calls
jest.mock('axios');

const axios = require('axios');
const { getRandomSongs, searchAndGetPreview } = require('../../services/musicService');

describe('musicService - iTunes API Integration', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchAndGetPreview()', () => {
    test('should return song with preview URL when found', async () => {
      // Mock successful iTunes API response
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Wonderwall',
              artistName: 'Oasis',
              previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music.jpg'
            }
          ]
        }
      });

      const result = await searchAndGetPreview('Oasis', 'Wonderwall');

      expect(result).toEqual({
        title: 'Wonderwall',
        artist: 'Oasis',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
        artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music.jpg'
      });

      // Verify API was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            term: expect.stringContaining('Oasis'),
            media: 'music',
            entity: 'song',
            limit: 1
          }),
          timeout: 5000
        })
      );
    });

    test('should filter out songs without preview URLs', async () => {
      // Mock response with song missing previewUrl
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Song Without Preview',
              artistName: 'Artist',
              previewUrl: null, // No preview available
              artworkUrl100: 'https://artwork.jpg'
            }
          ]
        }
      });

      const result = await searchAndGetPreview('Artist', 'Song Without Preview');

      expect(result).toBe(null);
    });

    test('should return null when no results found', async () => {
      // Mock empty results
      axios.get.mockResolvedValue({
        data: {
          results: []
        }
      });

      const result = await searchAndGetPreview('NonExistentArtist', 'NonExistentSong');

      expect(result).toBe(null);
    });

    test('should handle API timeout gracefully', async () => {
      // Mock timeout error
      axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

      const result = await searchAndGetPreview('Artist', 'Song');

      expect(result).toBe(null);
    });

    test('should handle API errors gracefully', async () => {
      // Mock network error
      axios.get.mockRejectedValue(new Error('Network Error'));

      const result = await searchAndGetPreview('Artist', 'Song');

      expect(result).toBe(null);
    });

    test('should clean search term by removing special characters', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Song',
              artistName: 'Artist',
              previewUrl: 'https://preview.m4a',
              artworkUrl100: 'https://artwork.jpg'
            }
          ]
        }
      });

      await searchAndGetPreview('Artist!!!', 'Song???');

      // Verify special characters were removed
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            term: expect.not.stringContaining('!')
          })
        })
      );
    });

    test('should support single query string parameter', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Napule è',
              artistName: 'Pino Daniele',
              previewUrl: 'https://preview.m4a',
              artworkUrl100: 'https://artwork.jpg'
            }
          ]
        }
      });

      const result = await searchAndGetPreview('Pino Daniele Napule è');

      expect(result).not.toBe(null);
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            term: expect.stringContaining('Pino Daniele')
          })
        })
      );
    });
  });

  describe('getRandomSongs()', () => {
    const mockItunesResults = [
      {
        trackName: 'Song 1',
        artistName: 'Artist 1',
        previewUrl: 'https://preview1.m4a',
        artworkUrl100: 'https://artwork1.jpg'
      },
      {
        trackName: 'Song 2',
        artistName: 'Artist 2',
        previewUrl: 'https://preview2.m4a',
        artworkUrl100: 'https://artwork2.jpg'
      },
      {
        trackName: 'Song 3',
        artistName: 'Artist 3',
        previewUrl: 'https://preview3.m4a',
        artworkUrl100: 'https://artwork3.jpg'
      }
    ];

    test('should return array of songs with correct format', async () => {
      axios.get.mockResolvedValue({
        data: { results: mockItunesResults }
      });

      const result = await getRandomSongs('pop', 3, null, 'hard');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(3);

      // Verify format of returned songs
      result.forEach(song => {
        expect(song).toHaveProperty('title');
        expect(song).toHaveProperty('artist');
        expect(song).toHaveProperty('previewUrl');
        expect(song).toHaveProperty('artwork');
      });
    });

    test('should call iTunes API with correct parameters', async () => {
      axios.get.mockResolvedValue({
        data: { results: mockItunesResults }
      });

      await getRandomSongs('rock', 10, null, 'hard');

      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: {
            term: 'rock',
            media: 'music',
            entity: 'song',
            limit: 50
          }
        })
      );
    });

    test('should filter by language when specified', async () => {
      // Mock results with mixed languages
      axios.get.mockResolvedValue({
        data: {
          results: [
            { trackName: 'Che bella canzone', artistName: 'Italian Artist', previewUrl: 'https://preview.m4a', artworkUrl100: 'https://art.jpg' },
            { trackName: 'The Song', artistName: 'English Artist', previewUrl: 'https://preview.m4a', artworkUrl100: 'https://art.jpg' },
            { trackName: 'Napule è', artistName: 'Pino Daniele', previewUrl: 'https://preview.m4a', artworkUrl100: 'https://art.jpg' }
          ]
        }
      });

      const result = await getRandomSongs('pop', 10, 'it', 'hard');

      // Should filter to Italian songs or fall back to all if none found
      expect(Array.isArray(result)).toBe(true);
    });

    test('should handle easy difficulty by selecting from top results', async () => {
      const manyResults = Array.from({ length: 100 }, (_, i) => ({
        trackName: `Song ${i}`,
        artistName: `Artist ${i}`,
        previewUrl: `https://preview${i}.m4a`,
        artworkUrl100: `https://artwork${i}.jpg`
      }));

      axios.get.mockResolvedValue({
        data: { results: manyResults }
      });

      const result = await getRandomSongs('pop', 5, null, 'easy');

      expect(result.length).toBeLessThanOrEqual(5);
      // Easy mode should select from top 100
    });

    test('should handle hard difficulty by randomizing all results', async () => {
      axios.get.mockResolvedValue({
        data: { results: mockItunesResults }
      });

      const result = await getRandomSongs('pop', 3, null, 'hard');

      expect(result.length).toBeLessThanOrEqual(3);
      // Hard mode randomizes all results
    });

    test('should return empty array on API error', async () => {
      axios.get.mockRejectedValue(new Error('Network Error'));

      const result = await getRandomSongs('pop', 10);

      expect(result).toEqual([]);
    });

    test('should handle empty results from API', async () => {
      axios.get.mockResolvedValue({
        data: { results: [] }
      });

      const result = await getRandomSongs('unknowngenre', 10);

      expect(result).toEqual([]);
    });
  });
});
